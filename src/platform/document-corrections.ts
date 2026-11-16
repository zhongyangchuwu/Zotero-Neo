import { record, type DocumentCacheKey, type ParsedDocument } from '../document-analysis/contracts';
import { documentCacheSlot } from '../document-analysis/cache';
import {
  documentCorrectionIdentity,
  emptyDocumentCorrections,
  readDocumentCorrections,
  recoverDocumentCorrections,
  type DocumentCorrections,
} from '../document-analysis/corrections';
import {
  ArtifactError,
  artifactHeads,
  createArtifactRepository,
  type ArtifactIssue,
  type NeoArtifact,
} from '../artifacts';
import { artifactAttachments, artifactPDF } from './artifacts';
import { artifactFailureIssues, setArtifactStorageIssues } from './artifact-feedback';
import { notifyAttachmentDocumentSaved } from './document-analysis-cache';

const MAX_BYTES = 32 * 1024 * 1024;
const pending = new Map<string, Promise<unknown>>();
const observed = new WeakMap<DocumentCorrections, readonly string[]>();
const repository = createArtifactRepository();

async function correctionFile(itemID: number, key: DocumentCacheKey): Promise<nsIFile> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || item.deleted || !item.isPDFAttachment())
    throw new ArtifactError('source-unavailable', 'PDF attachment unavailable');
  const file = Zotero.Attachments.getStorageDirectory(item).clone();
  file.append(
    `.zotero-neo-corrections-${Zotero.Utilities.Internal.md5(documentCacheSlot(key))}.json`,
  );
  return file;
}
async function legacyCorrectionValue(itemID: number, key: DocumentCacheKey): Promise<unknown> {
  const file = await correctionFile(itemID, key);
  if (!file.exists()) return null;
  if (file.fileSize > MAX_BYTES) throw new Error('Document correction sidecar exceeds size limit');
  const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
  if (typeof text !== 'string') throw new Error('Document correction sidecar unavailable');
  return JSON.parse(text) as unknown;
}
function recordID(attachmentKey: string, parsed: ParsedDocument, key: DocumentCacheKey): string {
  return `corrections:${attachmentKey}:${Zotero.Utilities.Internal.md5(documentCorrectionIdentity(parsed, key))}`;
}
function admit(
  artifact: NeoArtifact,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): DocumentCorrections {
  const state = readDocumentCorrections(record(artifact.payload)?.corrections, parsed, key);
  if (!state)
    throw new ArtifactError(
      'source-changed',
      'Stored corrections belong to a different parser baseline; history retained',
    );
  observed.set(state, [artifact.revisionID]);
  return state;
}

export async function readAttachmentDocumentCorrections(
  itemID: number,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): Promise<DocumentCorrections> {
  let allowLegacy = false;
  try {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item || item.deleted || !item.isPDFAttachment())
      throw new ArtifactError('source-unavailable', 'PDF attachment unavailable');
    if (!item.parentID) {
      allowLegacy = true;
      throw new ArtifactError(
        'parent-required',
        'Attach this standalone PDF to a regular reference before saving Neo artifacts',
      );
    }
    const parent = await Zotero.Items.getAsync(item.parentID);
    if (!parent)
      throw new ArtifactError(
        'parent-required',
        'Correction parent is unavailable; formal history could not be checked',
      );
    // PDF availability cannot establish the absence of formal correction history.
    const listing = await repository
      .list(parent, 'document-corrections')
      .catch(async (error: unknown) => {
        if (error instanceof ArtifactError && error.kind === 'identity-unavailable')
          allowLegacy = (await artifactAttachments(parent)).length === 0;
        throw error;
      });
    const id = recordID(item.key, parsed, key);
    allowLegacy =
      listing.complete && !listing.artifacts.some((artifact) => artifact.recordID === id);
    if (!listing.complete)
      throw new ArtifactError(
        'incomplete',
        'Correction artifact files are incomplete; do not overwrite them',
        listing.issues,
      );
    const artifacts = [...listing.artifacts],
      issues: ArtifactIssue[] = [];
    let heads = artifactHeads(artifacts, id);
    if (heads.length > 1)
      throw new ArtifactError(
        'conflict',
        'Independent correction revisions exist; choose or merge them explicitly',
      );
    const pdf = await artifactPDF(itemID).catch((error: unknown) => {
      if (!heads.length || !(error instanceof ArtifactError) || error.kind !== 'source-unavailable')
        throw error;
      issues.push(...artifactFailureIssues(error));
      return undefined;
    });
    if (pdf) {
      if (pdf.item.key !== item.key || pdf.parent.id !== parent.id)
        throw new ArtifactError('source-changed', 'Correction source attachment changed');
      if (pdf.source.contentHash.value !== parsed.sourceFingerprint.toLowerCase())
        throw new ArtifactError(
          'source-changed',
          'PDF bytes differ from the correction baseline; old coordinates are inactive',
        );
    }
    // A complete current history, including an empty restore, needs no sidecar recovery.
    const value = !heads.length && pdf ? await legacyCorrectionValue(itemID, key) : null;
    if (value !== null && pdf) {
      const recovered = recoverDocumentCorrections(value);
      if (!recovered)
        throw new ArtifactError(
          'corrupt',
          'Legacy correction baseline cannot be recovered; file retained',
        );
      const historicalID = recordID(pdf.item.key, recovered.parsed, recovered.key);
      // Any existing history, including an empty restored state, supersedes the sidecar.
      if (!artifacts.some((artifact) => artifact.recordID === historicalID)) {
        const hash = recovered.parsed.sourceFingerprint.toLowerCase();
        if (!/^[a-f0-9]{32}$/u.test(hash))
          throw new ArtifactError(
            'invalid-source',
            'Legacy correction source is not a known MD5 fingerprint',
          );
        const result = await repository.publish(
          pdf.parent,
          {
            kind: 'document-corrections',
            recordID: historicalID,
            revisionID: `legacy:${Zotero.Utilities.Internal.md5(JSON.stringify([historicalID, recovered.corrections]))}`,
            source: {
              ...pdf.source,
              contentHash: { algorithm: 'md5', value: hash },
              precision: 'region',
              parserIdentity: `md5:${Zotero.Utilities.Internal.md5(recovered.corrections.identity)}`,
            },
            payload: {
              version: 1,
              baseline: recovered.parsed,
              cacheKey: recovered.key,
              corrections: recovered.corrections,
            },
          },
          pdf.isCurrent,
        );
        artifacts.push(result.artifact);
      }
    }
    heads = artifactHeads(artifacts, id);
    if (heads.length > 1)
      throw new ArtifactError(
        'conflict',
        'Independent correction revisions exist; choose or merge them explicitly',
      );
    const state = heads.length
      ? admit(heads[0], parsed, key)
      : emptyDocumentCorrections(parsed, key);
    if (!heads.length) observed.set(state, []);
    if (
      artifacts.some(
        (artifact) => artifact.source?.attachmentKey === item.key && artifact.recordID !== id,
      )
    )
      issues.push({
        kind: 'source-changed',
        message:
          'Historical corrections for a different PDF/parser baseline were retained and not applied',
      });
    if (listing.availability === 'local-only')
      issues.push({
        kind: 'local-only',
        message:
          'Stored locally in Zotero; account and file sync have not established cross-device availability',
      });
    setArtifactStorageIssues(itemID, issues);
    return state;
  } catch (error) {
    setArtifactStorageIssues(itemID, artifactFailureIssues(error));
    // An existing local manual result remains readable when migration is unavailable.
    // It is not declared synced, and saving still requires a complete artifact listing.
    if (
      allowLegacy &&
      error instanceof ArtifactError &&
      [
        'identity-unavailable',
        'parent-required',
        'source-unavailable',
        'read-only',
        'publish-unavailable',
      ].includes(error.kind)
    ) {
      if (!(await correctionFile(itemID, key)).exists()) throw error;
      const value = await legacyCorrectionValue(itemID, key);
      const local = readDocumentCorrections(value, parsed, key);
      if (!local) throw error;
      observed.set(local, []);
      return local;
    }
    throw error;
  }
}

/** One explicit correction operation is one immutable revision, including restoration to an empty set. */
export async function saveAttachmentDocumentCorrections(options: {
  readonly itemID: number;
  readonly parsed: ParsedDocument;
  readonly key: DocumentCacheKey;
  readonly previous: DocumentCorrections;
  readonly next: DocumentCorrections;
  readonly current: () => Promise<boolean>;
}): Promise<boolean> {
  const { itemID, parsed, key, previous, next, current } = options;
  if (
    !readDocumentCorrections(next, parsed, key) ||
    previous.identity !== documentCorrectionIdentity(parsed, key)
  )
    throw new Error('Invalid correction source');
  const slot = `${itemID}:${documentCacheSlot(key)}`;
  const predecessor = pending.get(slot) ?? Promise.resolve();
  const task = predecessor
    .catch(() => {})
    .then(async () => {
      if (!(await current())) return false;
      try {
        const pdf = await artifactPDF(itemID);
        if (pdf.source.contentHash.value !== parsed.sourceFingerprint.toLowerCase())
          throw new ArtifactError(
            'source-changed',
            'PDF bytes changed; corrections were not published',
          );
        const listing = await repository.list(pdf.parent, 'document-corrections');
        if (!listing.complete)
          throw new ArtifactError(
            'incomplete',
            'Correction artifacts are incomplete; no changes published',
            listing.issues,
          );
        const id = recordID(pdf.item.key, parsed, key),
          heads = artifactHeads(listing.artifacts, id);
        const expected = observed.get(previous);
        if (
          heads.length > 1 ||
          (expected &&
            JSON.stringify(heads.map((head) => head.revisionID).sort()) !==
              JSON.stringify([...expected].sort()))
        )
          throw new ArtifactError(
            'conflict',
            'Document corrections changed; reopen the comparison',
          );
        if (
          heads.length &&
          JSON.stringify(admit(heads[0], parsed, key).edits) !== JSON.stringify(previous.edits)
        )
          throw new ArtifactError(
            'conflict',
            'Document corrections changed; reopen the comparison',
          );
        if (heads.length && JSON.stringify(next.edits) === JSON.stringify(previous.edits)) {
          observed.set(
            next,
            heads.map((head) => head.revisionID),
          );
          setArtifactStorageIssues(
            itemID,
            listing.availability === 'local-only'
              ? [
                  {
                    kind: 'local-only',
                    message:
                      'Corrections are stored locally in Zotero; cross-device file sync is unverified',
                  },
                ]
              : [],
          );
          return true;
        }
        const result = await repository.publish(
          pdf.parent,
          {
            kind: 'document-corrections',
            recordID: id,
            parentRevisions: heads.map((head) => head.revisionID),
            source: {
              ...pdf.source,
              precision: 'region',
              parserIdentity: `md5:${Zotero.Utilities.Internal.md5(next.identity)}`,
            },
            payload: {
              version: 1,
              baseline: { ...parsed, durationMs: 0 },
              cacheKey: key,
              corrections: next,
            },
          },
          async () => (await current()) && (await pdf.isCurrent()),
        );
        observed.set(next, [result.artifact.revisionID]);
        setArtifactStorageIssues(
          itemID,
          listing.availability === 'local-only'
            ? [
                {
                  kind: 'local-only',
                  message:
                    'Corrections are stored locally in Zotero; cross-device file sync is unverified',
                },
              ]
            : [],
        );
        notifyAttachmentDocumentSaved(itemID);
        return true;
      } catch (error) {
        setArtifactStorageIssues(itemID, artifactFailureIssues(error));
        if (error instanceof ArtifactError && error.kind === 'stale-source') return false;
        throw error;
      }
    });
  pending.set(slot, task);
  try {
    return await task;
  } finally {
    if (pending.get(slot) === task) pending.delete(slot);
  }
}
