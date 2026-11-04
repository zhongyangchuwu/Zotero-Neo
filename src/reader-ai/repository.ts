import type { ReaderAIRecord, ReaderAIRepository, ReaderAISource } from './contracts';
import { ReaderAIError } from './errors';
import { parseReaderAIOutput } from './output';
import { documentRect } from '../document-analysis/contracts';

export interface ReaderAIStorage {
  read(source: ReaderAISource): Promise<string | null>;
  write(
    source: ReaderAISource,
    contents: string,
    current: () => Promise<boolean>,
  ): Promise<boolean>;
}

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_RECORDS = 1000;
const queues = new Map<string, Promise<unknown>>();
const key = (source: ReaderAISource) => `${source.libraryID}:${source.key}`;
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 200000): v is string => typeof v === 'string' && v.length <= max;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const sameAttachment = (a: ReaderAISource, b: ReaderAISource) =>
  a.itemID === b.itemID && a.libraryID === b.libraryID && a.key === b.key;

function validSource(v: unknown): v is ReaderAISource {
  return (
    obj(v) &&
    integer(v.itemID) &&
    integer(v.libraryID) &&
    str(v.key, 100) &&
    !!v.key &&
    str(v.fingerprint, 500) &&
    !!v.fingerprint &&
    str(v.fileName, 2000)
  );
}
function validRecord(v: unknown, source: ReaderAISource): v is ReaderAIRecord {
  if (
    !obj(v) ||
    !str(v.id, 200) ||
    !v.id ||
    !integer(v.revision) ||
    v.revision < 1 ||
    !validSource(v.source) ||
    !sameAttachment(v.source, source) ||
    !str(v.kind, 20) ||
    !['explain', 'question', 'guide'].includes(v.kind) ||
    !str(v.question, 20000) ||
    !str(v.contextTitle, 2000) ||
    !str(v.model, 2000) ||
    !str(v.endpoint, 4000) ||
    !str(v.createdAt, 100) ||
    !str(v.updatedAt, 100) ||
    !(v.userText === null || str(v.userText)) ||
    !obj(v.usage) ||
    ![v.usage.inputTokens, v.usage.outputTokens].every((n) => n === null || integer(n)) ||
    !Array.isArray(v.evidence) ||
    v.evidence.length > 500
  )
    return false;
  const ids = new Set<string>();
  for (const e of v.evidence) {
    if (
      !obj(e) ||
      !str(e.id, 200) ||
      !e.id ||
      ids.has(e.id) ||
      !str(e.kind, 20) ||
      !['selection', 'text', 'figure', 'table'].includes(e.kind) ||
      !str(e.title, 2000) ||
      !str(e.text, 200000) ||
      !str(e.format, 20) ||
      !['text', 'html', 'latex', 'markdown'].includes(e.format) ||
      !(e.pageLabel === null || str(e.pageLabel, 100)) ||
      !str(e.precision, 20) ||
      !['text', 'region'].includes(e.precision) ||
      !(e.nativePosition === null || str(e.nativePosition, 20000))
    )
      return false;
    if (
      e.location !== null &&
      (!obj(e.location) ||
        !integer(e.location.pageIndex) ||
        !Array.isArray(e.location.rects) ||
        !e.location.rects.length ||
        e.location.rects.length > 256 ||
        !e.location.rects.every((rect: unknown) => documentRect(rect) !== null))
    )
      return false;
    ids.add(e.id);
  }
  try {
    parseReaderAIOutput(v.output, v.evidence);
  } catch {
    return false;
  }
  return true;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createReaderAIRepository(storage: ReaderAIStorage): ReaderAIRepository {
  async function read(source: ReaderAISource): Promise<ReaderAIRecord[]> {
    if (!validSource(source)) throw new ReaderAIError('storage');
    try {
      const contents = await storage.read(source);
      if (contents === null) return [];
      if (contents.length > MAX_BYTES) throw new Error('too large');
      const data: unknown = JSON.parse(contents);
      if (
        !obj(data) ||
        data.version !== 1 ||
        !Array.isArray(data.records) ||
        data.records.length > MAX_RECORDS ||
        !data.records.every((record: unknown) => validRecord(record, source)) ||
        new Set(data.records.map((record: ReaderAIRecord) => record.id)).size !==
          data.records.length
      )
        throw new Error('invalid store');
      return data.records as ReaderAIRecord[];
    } catch {
      throw new ReaderAIError('storage');
    }
  }
  async function serialized<T>(source: ReaderAISource, fn: () => Promise<T>): Promise<T> {
    const slot = key(source);
    const previous = queues.get(slot) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(fn);
    queues.set(slot, task);
    try {
      return await task;
    } finally {
      if (queues.get(slot) === task) queues.delete(slot);
    }
  }
  async function save(
    source: ReaderAISource,
    records: ReaderAIRecord[],
    current: () => Promise<boolean>,
  ): Promise<void> {
    const contents = JSON.stringify({ version: 1, records });
    if (records.length > MAX_RECORDS || contents.length > MAX_BYTES)
      throw new ReaderAIError('storage');
    try {
      if (!(await storage.write(source, contents, current)))
        throw new ReaderAIError('stale-source');
    } catch (error) {
      if (error instanceof ReaderAIError) throw error;
      throw new ReaderAIError('storage');
    }
  }
  return {
    list: (source) => serialized(source, async () => clone(await read(source))),
    add: (record, current) =>
      serialized(record.source, async () => {
        const records = await read(record.source);
        if (!validRecord(record, record.source) || records.some((r) => r.id === record.id))
          throw new ReaderAIError('storage');
        records.push(clone(record));
        await save(record.source, records, current);
        return clone(record);
      }),
    edit: (source, id, revision, userText) =>
      serialized(source, async () => {
        const records = await read(source);
        const index = records.findIndex((r) => r.id === id);
        if (
          index < 0 ||
          records[index].revision !== revision ||
          !(userText === null || str(userText))
        )
          throw new ReaderAIError('storage');
        const updated = {
          ...records[index],
          revision: revision + 1,
          userText,
          updatedAt: new Date().toISOString(),
        };
        records[index] = updated;
        await save(source, records, async () => true);
        return clone(updated);
      }),
    remove: (source, id, revision) =>
      serialized(source, async () => {
        const records = await read(source);
        const index = records.findIndex((r) => r.id === id);
        if (index < 0 || records[index].revision !== revision) throw new ReaderAIError('storage');
        records.splice(index, 1);
        await save(source, records, async () => true);
      }),
  };
}
