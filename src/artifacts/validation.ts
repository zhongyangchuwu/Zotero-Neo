import { readDocumentCacheRecord } from '../document-analysis/cache';
import {
  documentRect,
  record,
  type DocumentCacheKey,
  type DocumentPage,
} from '../document-analysis/contracts';
import { readDocumentCorrections } from '../document-analysis/corrections';
import { parseAIQAOutput } from '../ai-qa/output';
import { ArtifactError, type NeoArtifact } from './contracts';

const text = (value: unknown, max = 200000): value is string =>
  typeof value === 'string' && value.length <= max;
const id = (value: unknown): value is string => text(value, 1000) && value.length > 0;
const list = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 1000 && value.every(id);

/** Canonical JSON also rejects host objects, cycles, non-finite values and prototype keys. */
export function canonicalJSON(value: unknown, depth = 0): string {
  if (depth > 64) throw new ArtifactError('invalid', 'Artifact nesting exceeds limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJSON(entry, depth + 1)).join(',')}]`;
  if (
    value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.some(([key]) => ['__proto__', 'constructor', 'prototype'].includes(key)))
      throw new ArtifactError('invalid', 'Unsafe artifact object key');
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJSON(entry, depth + 1)}`).join(',')}}`;
  }
  throw new ArtifactError('invalid', 'Artifact must contain only JSON values');
}

function correctionsPayload(payload: Record<string, unknown>): boolean {
  const baseline = record(payload.baseline),
    key = record(payload.cacheKey);
  if (
    !baseline ||
    !key ||
    !id(key.backend) ||
    !Number.isSafeInteger(key.adapterVersion) ||
    !text(key.configuration) ||
    !id(baseline.sourceFingerprint) ||
    !Array.isArray(baseline.pages) ||
    baseline.pages.length > 100000
  )
    return false;
  for (const [index, value] of baseline.pages.entries()) {
    const page = record(value);
    if (
      !page ||
      page.pageIndex !== index ||
      ![0, 90, 180, 270].includes(page.rotation as number) ||
      !documentRect(page.viewBox)
    )
      return false;
  }
  const parsed = readDocumentCacheRecord(
    { cacheVersion: 1, savedAt: 0, key, parsed: baseline },
    {
      fingerprint: baseline.sourceFingerprint,
      fileName: '',
      pages: baseline.pages as DocumentPage[],
    },
    key as unknown as DocumentCacheKey,
  )?.parsed;
  return (
    !!parsed &&
    !!readDocumentCorrections(payload.corrections, parsed, key as unknown as DocumentCacheKey)
  );
}

function aiPayload(payload: Record<string, unknown>): boolean {
  if (typeof payload.deleted !== 'boolean') return false;
  if (payload.deleted) return payload.record === null;
  const value = record(payload.record),
    source = record(value?.source),
    usage = record(value?.usage);
  if (
    !value ||
    !source ||
    'itemID' in source ||
    'libraryID' in source ||
    !id(source.key) ||
    !id(source.fingerprint) ||
    !text(source.fileName, 2000) ||
    !id(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !['explain', 'question', 'guide'].includes(value.kind as string) ||
    !text(value.question, 20000) ||
    !text(value.contextTitle, 2000) ||
    !text(value.model, 2000) ||
    !text(value.endpoint, 4000) ||
    !text(value.createdAt, 100) ||
    !text(value.updatedAt, 100) ||
    !(value.userText === null || text(value.userText)) ||
    !usage ||
    ![usage.inputTokens, usage.outputTokens].every(
      (n) => n === null || (Number.isSafeInteger(n) && (n as number) >= 0),
    ) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > 500
  )
    return false;
  const ids = new Set<string>();
  for (const raw of value.evidence) {
    const evidence = record(raw),
      location = record(evidence?.location);
    if (
      !evidence ||
      !id(evidence.id) ||
      ids.has(evidence.id) ||
      !['selection', 'text', 'figure', 'table'].includes(evidence.kind as string) ||
      !text(evidence.title, 2000) ||
      !text(evidence.text) ||
      !['text', 'html', 'latex', 'markdown'].includes(evidence.format as string) ||
      !(evidence.pageLabel === null || text(evidence.pageLabel, 100)) ||
      !['text', 'region'].includes(evidence.precision as string) ||
      !(evidence.nativePosition === null || text(evidence.nativePosition, 20000))
    )
      return false;
    if (
      evidence.location !== null &&
      (!location ||
        !Number.isSafeInteger(location.pageIndex) ||
        (location.pageIndex as number) < 0 ||
        !Array.isArray(location.rects) ||
        !location.rects.length ||
        location.rects.length > 256 ||
        !location.rects.every((rect) => documentRect(rect)))
    )
      return false;
    ids.add(evidence.id);
  }
  try {
    parseAIQAOutput(value.output, value.evidence as never);
    return true;
  } catch {
    return false;
  }
}

function metadataPayload(payload: Record<string, unknown>): boolean {
  const query = record(payload.query),
    paper = record(payload.paper),
    snapshot = record(payload.snapshot);
  return (
    ['proposal', 'applied'].includes(payload.stage as string) &&
    !!query &&
    text(query.text, 20000) &&
    !!paper &&
    id(paper.source) &&
    id(paper.sourceID) &&
    text(paper.title) &&
    Array.isArray(paper.authors) &&
    paper.authors.every((author) => text(author, 2000)) &&
    !!snapshot &&
    id(snapshot.itemKey) &&
    !!record(snapshot.values) &&
    !('itemID' in snapshot) &&
    !('libraryID' in snapshot) &&
    Array.isArray(payload.changes) &&
    payload.changes.length <= 1000 &&
    payload.changes.every((change) => {
      const entry = record(change);
      return !!entry && id(entry.field) && 'before' in entry && 'after' in entry;
    }) &&
    list(payload.selectedFields) &&
    list(payload.appliedFields)
  );
}

export function validateArtifact(value: unknown): NeoArtifact {
  const artifact = record(value);
  if (!artifact || artifact.format !== 'zotero-neo')
    throw new ArtifactError('invalid', 'Not a Zotero Neo artifact');
  if (artifact.schemaVersion !== 1)
    throw new ArtifactError(
      'unknown-schema',
      'Unsupported Zotero Neo artifact schema; file preserved',
    );
  if (!['metadata-review', 'document-corrections', 'ai-qa'].includes(artifact.kind as string))
    throw new ArtifactError('unknown-kind', 'Unsupported artifact kind; file preserved');
  const producer = record(artifact.producer),
    payload = record(artifact.payload),
    source = record(artifact.source),
    hash = record(source?.contentHash);
  if (
    !text(artifact.libraryURI, 1000) ||
    !/^https?:\/\/zotero\.org\/(?:(?:users|groups)\/\d+|users\/local\/\w+)$/u.test(
      artifact.libraryURI,
    ) ||
    !id(artifact.parentItemKey) ||
    !id(artifact.recordID) ||
    !id(artifact.revisionID) ||
    !list(artifact.parentRevisions) ||
    new Set(artifact.parentRevisions).size !== artifact.parentRevisions.length ||
    artifact.parentRevisions.includes(artifact.revisionID) ||
    !text(artifact.createdAt, 100) ||
    !Number.isFinite(Date.parse(artifact.createdAt)) ||
    !producer ||
    !id(producer.name) ||
    !id(producer.version) ||
    !payload ||
    payload.version !== 1
  )
    throw new ArtifactError('invalid', 'Invalid artifact envelope or payload version');
  if (
    artifact.source !== undefined &&
    (!source ||
      !id(source.attachmentKey) ||
      !hash ||
      !['md5', 'sha256'].includes(hash.algorithm as string) ||
      !text(hash.value, 64) ||
      !(hash.algorithm === 'md5' ? /^[a-f0-9]{32}$/u : /^[a-f0-9]{64}$/u).test(hash.value) ||
      !['document', 'region'].includes(source.precision as string) ||
      !(source.parserIdentity === undefined || text(source.parserIdentity, 32 * 1024 * 1024)))
  )
    throw new ArtifactError('invalid-source', 'Invalid algorithm-tagged artifact source');
  if (
    !(artifact.kind === 'document-corrections'
      ? !!source && correctionsPayload(payload)
      : artifact.kind === 'ai-qa'
        ? !!source && aiPayload(payload)
        : metadataPayload(payload))
  )
    throw new ArtifactError('invalid-payload', 'Invalid artifact payload');
  if (
    artifact.kind === 'document-corrections' &&
    record(payload.baseline)?.sourceFingerprint !== hash?.value
  )
    throw new ArtifactError(
      'invalid-source',
      'Correction baseline does not match the declared content hash',
    );
  if (artifact.kind === 'ai-qa' && payload.deleted === false) {
    const reading = record(payload.record),
      readingSource = record(reading?.source);
    if (
      readingSource?.key !== source?.attachmentKey ||
      typeof readingSource?.fingerprint !== 'string' ||
      readingSource.fingerprint.toLowerCase() !== hash?.value
    )
      throw new ArtifactError(
        'invalid-source',
        'AI evidence source does not match the declared original content hash',
      );
  }
  canonicalJSON(value);
  return value as NeoArtifact;
}
