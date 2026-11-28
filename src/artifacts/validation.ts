import { record } from '../document-analysis/contracts';
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
  if (artifact.kind !== 'metadata-review')
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
  if (!metadataPayload(payload))
    throw new ArtifactError('invalid-payload', 'Invalid artifact payload');
  canonicalJSON(value);
  return value as NeoArtifact;
}
