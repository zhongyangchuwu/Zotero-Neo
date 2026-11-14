import { record, type DocumentCacheKey, type ParsedDocument } from '../document-analysis/contracts';
import { documentCacheSlot } from '../document-analysis/cache';
import {
  documentCorrectionIdentity,
  emptyDocumentCorrections,
  readDocumentCorrections,
  type DocumentCorrections,
} from '../document-analysis/corrections';
import { notifyAttachmentDocumentSaved } from './document-analysis-cache';

const MAX_BYTES = 32 * 1024 * 1024;
const pending = new Map<string, Promise<unknown>>();
const queued = new Map<string, number>();
const MAX_PENDING = 4;

async function correctionFile(itemID: number, key: DocumentCacheKey): Promise<nsIFile> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isPDFAttachment()) throw new Error('PDF attachment unavailable');
  const file = Zotero.Attachments.getStorageDirectory(item).clone();
  file.append(
    `.zotero-neo-corrections-${Zotero.Utilities.Internal.md5(documentCacheSlot(key))}.json`,
  );
  return file;
}
async function readFile(
  file: nsIFile,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): Promise<DocumentCorrections> {
  if (!file.exists()) return emptyDocumentCorrections(parsed, key);
  if (file.fileSize > MAX_BYTES) throw new Error('Document correction sidecar exceeds size limit');
  const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
  if (typeof text !== 'string') throw new Error('Document correction sidecar unavailable');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Invalid document correction sidecar');
  }
  // A sidecar for an earlier parse is deliberately inert, never migrated by region ID.
  const admitted = readDocumentCorrections(value, parsed, key);
  if (!admitted && record(value)?.identity === documentCorrectionIdentity(parsed, key))
    throw new Error('Invalid document correction sidecar');
  return admitted ?? emptyDocumentCorrections(parsed, key);
}

export async function readAttachmentDocumentCorrections(
  itemID: number,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): Promise<DocumentCorrections> {
  return readFile(await correctionFile(itemID, key), parsed, key);
}

/** Serialize read/compare/stage/commit per attachment+service. Conflicting windows must reload, not lose edits. */
export async function saveAttachmentDocumentCorrections(options: {
  readonly itemID: number;
  readonly parsed: ParsedDocument;
  readonly key: DocumentCacheKey;
  readonly previous: DocumentCorrections;
  readonly next: DocumentCorrections;
  /** Must validate owner, PDF, selected service and the exact current uncorrected parser output. */
  readonly current: () => Promise<boolean>;
}): Promise<boolean> {
  const { itemID, parsed, key, previous, next, current } = options;
  if (
    !readDocumentCorrections(next, parsed, key) ||
    previous.identity !== documentCorrectionIdentity(parsed, key)
  )
    throw new Error('Invalid correction source');
  const contents = JSON.stringify(next);
  if (contents.length > MAX_BYTES)
    throw new Error('Document correction sidecar exceeds size limit');
  const file = await correctionFile(itemID, key);
  const count = queued.get(file.path) ?? 0;
  if (count >= MAX_PENDING) throw new Error('Too many pending document corrections');
  queued.set(file.path, count + 1);
  const predecessor = pending.get(file.path) ?? Promise.resolve();
  const task = predecessor
    .catch(() => {})
    .then(async () => {
      if (!(await current())) return false;
      const saved = await readFile(file, parsed, key);
      if (
        saved.identity !== previous.identity ||
        JSON.stringify(saved.edits) !== JSON.stringify(previous.edits)
      )
        throw new Error('Document corrections changed; reopen the comparison');
      await Zotero.File.createDirectoryIfMissingAsync(file.parent!.path);
      const stage = file.clone();
      stage.leafName += `.stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        await Zotero.File.putContentsAsync(stage.path, contents, 'UTF-8');
        if (stage.fileSize > MAX_BYTES)
          throw new Error('Document correction sidecar exceeds size limit');
        if (!(await current())) return false;
        if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
        await IOUtils.move(stage.path, file.path);
        notifyAttachmentDocumentSaved(itemID);
        return true;
      } finally {
        await Zotero.File.removeIfExists(stage.path);
        await Zotero.File.removeIfExists(`${stage.path}.tmp`);
      }
    });
  pending.set(file.path, task);
  try {
    return await task;
  } finally {
    if (pending.get(file.path) === task) pending.delete(file.path);
    const remaining = (queued.get(file.path) ?? 1) - 1;
    if (remaining) queued.set(file.path, remaining);
    else queued.delete(file.path);
  }
}
