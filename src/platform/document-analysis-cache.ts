import {
  documentCacheRecord,
  documentCacheSlot,
  readDocumentCacheRecord,
  type DocumentResultCache,
} from '../document-analysis/cache';
import type { DocumentCacheKey } from '../document-analysis/contracts';
import { ZoteroLogger } from '../core/logging';

const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const pendingWrites = new Map<string, Promise<unknown>>();
const observers = new Map<number, Set<() => void>>();
const logger = new ZoteroLogger();

/** Reader owners subscribe once; any single/batch writer can retire their memoized navigation targets after commit. */
export function observeAttachmentDocumentCache(itemID: number, saved: () => void): () => void {
  const listeners = observers.get(itemID) ?? new Set<() => void>();
  listeners.add(saved);
  observers.set(itemID, listeners);
  return () => {
    listeners.delete(saved);
    if (!listeners.size) observers.delete(itemID);
  };
}

/** Zotero.File.rename sanitizes leading dots; commit the exact cache path with Gecko's move API. */
async function commitCacheFile(stage: string, destination: string): Promise<void> {
  if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
  await IOUtils.move(stage, destination);
}

async function cacheFile(itemID: number, key: DocumentCacheKey): Promise<nsIFile> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isPDFAttachment()) throw new Error('PDF attachment unavailable');
  // Attachment-owned storage also exists for linked PDFs; never write beside the external source file.
  const file = Zotero.Attachments.getStorageDirectory(item).clone();
  const slot = Zotero.Utilities.Internal.md5(documentCacheSlot(key));
  file.append(`.zotero-neo-analysis-${slot}.json`);
  return file;
}

/** Attachment-owned UTF-8 storage; no Bootstrap DOM constructors or external runtime dependencies. */
export function attachmentDocumentCache(itemID: number): DocumentResultCache {
  return {
    async read(source, key) {
      const file = await cacheFile(itemID, key);
      if (!file.exists() || file.fileSize > MAX_CACHE_BYTES) return null;
      const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_CACHE_BYTES);
      if (typeof text !== 'string') return null;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return null;
      }
      return readDocumentCacheRecord(value, source, key);
    },
    async write(source, key, parsed, current) {
      const file = await cacheFile(itemID, key);
      const contents = JSON.stringify(documentCacheRecord(source, key, parsed));
      if (contents.length > MAX_CACHE_BYTES) throw new Error('Document cache exceeds size limit');
      const predecessor = pendingWrites.get(file.path) ?? Promise.resolve();
      const task = predecessor
        .catch(() => {})
        .then(async () => {
          if (!(await current())) return false;
          await Zotero.File.createDirectoryIfMissingAsync(file.parent!.path);
          const stage = file.clone();
          stage.leafName += `.stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          try {
            await Zotero.File.putContentsAsync(stage.path, contents, 'UTF-8');
            if (stage.fileSize > MAX_CACHE_BYTES)
              throw new Error('Document cache exceeds size limit');
            if (!(await current())) return false;
            await commitCacheFile(stage.path, file.path);
            return true;
          } finally {
            await Zotero.File.removeIfExists(stage.path);
            await Zotero.File.removeIfExists(`${stage.path}.tmp`);
          }
        });
      pendingWrites.set(file.path, task);
      try {
        const saved = await task;
        if (saved)
          for (const observer of observers.get(itemID) ?? []) {
            try {
              observer();
            } catch {
              logger.debug('Document cache presentation could not refresh');
            }
          }
        return saved;
      } finally {
        if (pendingWrites.get(file.path) === task) pendingWrites.delete(file.path);
      }
    },
  };
}
