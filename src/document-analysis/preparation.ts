import { checkParseCurrent, record, type DocumentSource } from './contracts';
import type { DocumentResultCache } from './cache';
import {
  mineruClient,
  mineruDocumentCacheKey,
  MINERU_MAX_FILES,
  MINERU_MAX_PAGES,
} from './mineru-client';
import { mineruParsedDocument } from './mineru';
import type { DocumentServiceTransport } from './transport';

export const MAX_PREPARATION_FILES = 200;

export interface DocumentAttachment {
  readonly itemID: number;
  readonly libraryID: number;
  readonly key: string;
  readonly title: string;
}
export type PreparationState =
  | 'ready'
  | 'checking'
  | 'cached'
  | 'uploading'
  | 'waiting-file'
  | 'pending'
  | 'running'
  | 'converting'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'paused';
export type PreparationFailure = 'file' | 'sourceChanged' | 'service' | 'cache' | 'timeout';
export interface PreparationRow {
  readonly target: DocumentAttachment;
  state: PreparationState;
  fingerprint?: string;
  remote?: { batchID: string; dataID: string; createdAt: number; uploaded: boolean };
  completedPages?: number;
  totalPages?: number;
  failure?: PreparationFailure;
}
export interface PreparedAttachment {
  readonly source: DocumentSource;
  readonly cache: DocumentResultCache;
  read(): Promise<Uint8Array>;
  isCurrent(): Promise<boolean>;
}
export interface PreparationHost {
  readonly transport: DocumentServiceTransport;
  prepare(target: DocumentAttachment, signal: AbortSignal): Promise<PreparedAttachment>;
  readRecord(): Promise<unknown>;
  writeRecord(value: unknown): Promise<void>;
  debug(message: string): void;
}
const STATES: readonly PreparationState[] = [
  'ready',
  'checking',
  'cached',
  'uploading',
  'waiting-file',
  'pending',
  'running',
  'converting',
  'downloading',
  'complete',
  'failed',
  'paused',
];
const FAILURES: readonly PreparationFailure[] = [
  'file',
  'sourceChanged',
  'service',
  'cache',
  'timeout',
];
const finished = (row: PreparationRow): boolean =>
  row.state === 'cached' || row.state === 'complete';

/** Project only non-secret task identity; signed URLs, tokens, response bodies and raw errors never enter the journal. */
export function preparationRecord(rows: readonly PreparationRow[]): unknown {
  return {
    version: 1,
    cacheKey: mineruDocumentCacheKey(),
    rows: rows.map((row) => ({
      target: {
        itemID: row.target.itemID,
        libraryID: row.target.libraryID,
        key: row.target.key,
        title: row.target.title,
      },
      state: row.state,
      fingerprint: row.fingerprint,
      ...(row.remote
        ? {
            remote: {
              batchID: row.remote.batchID,
              dataID: row.remote.dataID,
              createdAt: row.remote.createdAt,
              uploaded: row.remote.uploaded,
            },
          }
        : {}),
      completedPages: row.completedPages,
      totalPages: row.totalPages,
      failure: row.failure,
    })),
  };
}
export function restorePreparation(value: unknown): PreparationRow[] {
  const saved = record(value),
    key = record(saved?.cacheKey),
    expected = mineruDocumentCacheKey();
  if (
    saved?.version !== 1 ||
    key?.backend !== expected.backend ||
    key.adapterVersion !== expected.adapterVersion ||
    key.configuration !== expected.configuration ||
    !Array.isArray(saved.rows) ||
    saved.rows.length > MAX_PREPARATION_FILES
  )
    return [];
  const rows: PreparationRow[] = [],
    seen = new Set<string>();
  for (const value of saved.rows) {
    const row = record(value),
      target = record(row?.target),
      remote = record(row?.remote);
    if (
      !row ||
      !target ||
      !Number.isSafeInteger(target.itemID) ||
      Number(target.itemID) <= 0 ||
      !Number.isSafeInteger(target.libraryID) ||
      typeof target.key !== 'string' ||
      !/^[A-Z0-9]{8}$/u.test(target.key) ||
      typeof target.title !== 'string' ||
      target.title.length > 2000 ||
      !STATES.includes(row.state as PreparationState) ||
      (row.fingerprint !== undefined &&
        (typeof row.fingerprint !== 'string' || !/^[a-f0-9]{32}$/u.test(row.fingerprint))) ||
      (row.failure !== undefined && !FAILURES.includes(row.failure as PreparationFailure))
    )
      return [];
    const identity = `${target.libraryID}:${target.key}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    if (
      row.remote !== undefined &&
      (!remote ||
        typeof remote.batchID !== 'string' ||
        !/^[\w.-]{1,256}$/u.test(remote.batchID) ||
        typeof remote.dataID !== 'string' ||
        !/^[\w.-]{1,128}$/u.test(remote.dataID) ||
        typeof remote.createdAt !== 'number' ||
        !Number.isFinite(remote.createdAt) ||
        remote.createdAt < 0 ||
        typeof remote.uploaded !== 'boolean')
    )
      return [];
    rows.push({
      target: {
        itemID: Number(target.itemID),
        libraryID: Number(target.libraryID),
        key: target.key,
        title: target.title,
      },
      state: ['cached', 'complete', 'failed', 'ready'].includes(String(row.state))
        ? (row.state as PreparationState)
        : 'paused',
      ...(typeof row.fingerprint === 'string' ? { fingerprint: row.fingerprint } : {}),
      ...(remote
        ? {
            remote: {
              batchID: String(remote.batchID),
              dataID: String(remote.dataID),
              createdAt: Number(remote.createdAt),
              uploaded: remote.uploaded as boolean,
            },
          }
        : {}),
      ...(row.failure ? { failure: row.failure as PreparationFailure } : {}),
    });
  }
  return rows;
}

/** Small bounded worker pool shared by upload and download; all tasks settle before a run can be replaced. */
async function parallel<T>(values: readonly T[], run: (value: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.allSettled(
    Array.from({ length: Math.min(2, values.length) }, async () => {
      while (next < values.length) await run(values[next++]!);
    }),
  ).then((results) => {
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  });
}

/** Application-owned work outlives any Reader or dialog; each retry resumes receipts before creating a new task. */
export class DocumentPreparationQueue {
  readonly #host: PreparationHost;
  readonly #listeners = new Set<() => void>();
  readonly #uploadURLs = new Map<string, string>();
  #rows: PreparationRow[] = [];
  #initial: Promise<void> | null = null;
  #writes: Promise<void> = Promise.resolve();
  #abort: AbortController | null = null;
  #disposed = false;
  #storageFailed = false;
  constructor(host: PreparationHost) {
    this.#host = host;
  }
  get rows(): readonly PreparationRow[] {
    return this.#rows;
  }
  get running(): boolean {
    return this.#abort !== null;
  }
  get storageFailed(): boolean {
    return this.#storageFailed;
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit(): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        this.#host.debug('Document preparation presentation unavailable');
      }
    }
  }
  init(): Promise<void> {
    return (this.#initial ??= this.#host
      .readRecord()
      .then((value) => {
        if (!this.#disposed) this.#rows = restorePreparation(value);
      })
      .catch(() => {
        this.#storageFailed = true;
        this.#host.debug('Document preparation journal unavailable');
      })
      .then(() => this.#emit()));
  }
  async #save(): Promise<void> {
    this.#emit();
    const snapshot = preparationRecord(this.#rows);
    const task = this.#writes.catch(() => {}).then(() => this.#host.writeRecord(snapshot));
    this.#writes = task;
    try {
      await task;
      this.#storageFailed = false;
    } catch {
      this.#storageFailed = true;
      throw new Error('Document task receipt could not be saved');
    }
  }
  /** Explicitly replace the last batch only when no local work is running; completed attachment caches remain intact. */
  async replace(targets: readonly DocumentAttachment[]): Promise<boolean> {
    await this.init();
    if (this.#disposed || this.running) return false;
    if (!targets.length || targets.length > MAX_PREPARATION_FILES)
      throw new Error('Select between 1 and 200 PDFs');
    const seen = new Set<string>();
    this.#rows = targets
      .filter((target) => {
        const id = `${target.libraryID}:${target.key}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((target) => ({ target: { ...target }, state: 'ready' }));
    this.#uploadURLs.clear();
    await this.#save();
    return true;
  }
  stop(): void {
    this.#abort?.abort();
  }
  dispose(): void {
    this.#disposed = true;
    this.stop();
    this.#listeners.clear();
    this.#uploadURLs.clear();
  }

  async run(apiKey: string, createAbort: () => AbortController): Promise<void> {
    if (this.#disposed || this.running) return;
    const abort = createAbort();
    this.#abort = abort;
    this.#emit();
    const signal = abort.signal;
    try {
      await this.init();
      checkParseCurrent(signal);
      const prepared = new Map<PreparationRow, PreparedAttachment>();
      for (const row of this.#rows) {
        if (finished(row)) continue;
        checkParseCurrent(signal);
        row.state = 'checking';
        delete row.completedPages;
        delete row.totalPages;
        delete row.failure;
        await this.#save();
        try {
          const input = await this.#host.prepare(row.target, signal);
          checkParseCurrent(signal);
          if (row.fingerprint && row.fingerprint !== input.source.fingerprint) {
            row.state = 'failed';
            row.failure = 'sourceChanged';
            continue;
          }
          row.fingerprint = input.source.fingerprint;
          if (input.source.pages.length > MINERU_MAX_PAGES) throw new Error('Page limit exceeded');
          const cached = await input.cache.read(input.source, mineruDocumentCacheKey());
          checkParseCurrent(signal);
          if (!(await input.isCurrent())) throw new Error('Source retired');
          if (cached) {
            row.state = 'cached';
            row.completedPages = row.totalPages = input.source.pages.length;
            continue;
          }
          prepared.set(row, input);
          row.state = 'ready';
        } catch (error) {
          checkParseCurrent(signal);
          this.#host.debug(`Document preparation source unavailable: ${String(error)}`);
          row.state = 'failed';
          row.failure = 'file';
        } finally {
          await this.#save();
        }
      }
      const client = mineruClient(apiKey, this.#host.transport);
      const download = async (
        row: PreparationRow,
        result: Parameters<typeof client.layout>[0],
      ): Promise<void> => {
        const input = prepared.get(row)!;
        try {
          checkParseCurrent(signal);
          row.state = 'downloading';
          await this.#save();
          const layout = await client.layout(result, signal);
          checkParseCurrent(signal);
          const parsed = mineruParsedDocument(
            input.source,
            layout,
            Math.max(0, Date.now() - row.remote!.createdAt),
          );
          if (
            !(await input.cache.write(
              input.source,
              mineruDocumentCacheKey(),
              parsed,
              async () => !signal.aborted && !this.#disposed && (await input.isCurrent()),
            )) ||
            signal.aborted
          )
            throw new Error('Cache not saved');
          row.state = 'complete';
          row.completedPages = row.totalPages = input.source.pages.length;
          delete row.failure;
        } catch {
          checkParseCurrent(signal);
          row.state = 'failed';
          row.failure = 'cache';
        }
        await this.#save();
      };
      // Recover remote identity first. A network error never implies that an accepted upload should be repeated.
      const recover = [
        ...new Set([...prepared.keys()].flatMap((row) => (row.remote ? [row.remote.batchID] : []))),
      ];
      for (const batchID of recover) {
        const rows = [...prepared.keys()].filter((row) => row.remote?.batchID === batchID);
        try {
          const entries = await client.poll(batchID, signal);
          checkParseCurrent(signal);
          await parallel(rows, async (row) => {
            const entry = entries.find((entry) => entry.dataID === row.remote!.dataID);
            if (!entry) {
              row.state = 'failed';
              row.failure = 'service';
            } else if (entry.state === 'failed') {
              delete row.remote;
              row.state = 'ready';
            } else if (entry.state === 'done') await download(row, entry);
            else if (entry.state === 'waiting-file' && !row.remote!.uploaded) {
              // Only a confirmed unuploaded task may acquire a fresh URL after restart/expiry.
              if (
                !this.#uploadURLs.has(row.remote!.dataID) ||
                Date.now() - row.remote!.createdAt >= 24 * 60 * 60 * 1000
              )
                delete row.remote;
              row.state = 'ready';
            } else row.state = entry.state;
          });
        } catch {
          checkParseCurrent(signal);
          for (const row of rows)
            if (!finished(row)) {
              row.state = 'failed';
              row.failure = 'service';
            }
        }
        await this.#save();
      }
      const fresh = [...prepared.keys()].filter((row) => row.state === 'ready' && !row.remote);
      for (let offset = 0; offset < fresh.length; offset += MINERU_MAX_FILES) {
        const group = fresh.slice(offset, offset + MINERU_MAX_FILES);
        try {
          const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const ids = group.map((_, i) => `neo-${nonce}-${i}`);
          const receipt = await client.submit(ids, signal);
          receipt.uploads.forEach((upload, i) => {
            const row = group[i]!;
            row.remote = {
              batchID: receipt.batchID,
              dataID: upload.dataID,
              createdAt: Date.now(),
              uploaded: false,
            };
            this.#uploadURLs.set(upload.dataID, upload.url);
          });
        } catch {
          checkParseCurrent(signal);
          for (const row of group) {
            row.state = 'failed';
            row.failure = 'service';
          }
        }
        // Receipt durability precedes the first PUT, including after a partial failure.
        await this.#save();
      }
      await parallel(
        [...prepared.keys()].filter((row) => row.state === 'ready' && row.remote),
        async (row) => {
          try {
            checkParseCurrent(signal);
            const input = prepared.get(row)!,
              remote = row.remote!,
              url = this.#uploadURLs.get(remote.dataID);
            if (!url) throw new Error('Upload URL unavailable');
            row.state = 'uploading';
            await this.#save();
            const bytes = await input.read();
            checkParseCurrent(signal);
            if (!(await input.isCurrent())) throw new Error('Source retired');
            await client.upload(url, bytes, signal);
            remote.uploaded = true;
            this.#uploadURLs.delete(remote.dataID);
            row.state = 'pending';
          } catch {
            checkParseCurrent(signal);
            row.state = 'failed';
            row.failure = 'service';
          }
          await this.#save();
        },
      );
      const active = (): PreparationRow[] =>
        [...prepared.keys()].filter(
          (row) => row.remote && !finished(row) && row.state !== 'failed',
        );
      for (let attempt = 0; attempt < 180 && active().length; attempt++) {
        for (const batchID of new Set(active().map((row) => row.remote!.batchID))) {
          const rows = active().filter((row) => row.remote!.batchID === batchID);
          try {
            const entries = await client.poll(batchID, signal);
            checkParseCurrent(signal);
            await parallel(rows, async (row) => {
              const entry = entries.find((entry) => entry.dataID === row.remote!.dataID);
              if (!entry || entry.state === 'failed') {
                row.state = 'failed';
                row.failure = 'service';
              } else if (entry.state === 'done') await download(row, entry);
              else {
                row.state = entry.state;
                row.completedPages = entry.completedPages;
                row.totalPages = entry.totalPages;
              }
            });
          } catch {
            checkParseCurrent(signal);
            for (const row of rows)
              if (!finished(row)) {
                row.state = 'failed';
                row.failure = 'service';
              }
          }
          await this.#save();
        }
        if (active().length) await this.#host.transport.wait(3000, signal);
      }
      for (const row of active()) {
        row.state = 'failed';
        row.failure = 'timeout';
      }
    } catch {
      if (!signal.aborted) this.#host.debug('Document preparation interrupted; receipts retained');
    } finally {
      for (const row of this.#rows)
        if (!finished(row) && row.state !== 'failed' && row.state !== 'ready') row.state = 'paused';
      try {
        await this.#save();
      } catch {
        this.#host.debug('Document preparation journal write failed');
      }
      if (this.#abort === abort) this.#abort = null;
      this.#emit();
    }
  }
}
