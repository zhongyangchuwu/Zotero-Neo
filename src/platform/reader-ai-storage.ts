import type { ReaderAIStorage } from '../reader-ai/repository';
import type { ReaderAISource } from '../reader-ai/contracts';

const MAX_BYTES = 16 * 1024 * 1024;

async function fileFor(source: ReaderAISource): Promise<nsIFile> {
  const item = await Zotero.Items.getAsync(source.itemID);
  if (
    !item ||
    !item.isPDFAttachment() ||
    item.libraryID !== source.libraryID ||
    item.key !== source.key
  )
    throw new Error('PDF attachment unavailable');
  const file = Zotero.Attachments.getStorageDirectory(item).clone();
  file.append('.zotero-neo-reader-ai.json');
  return file;
}

/** Stores records in Zotero's attachment directory, including for linked PDFs. */
export function attachmentReadingStorage(): ReaderAIStorage {
  return {
    async read(source) {
      const file = await fileFor(source);
      if (!file.exists()) return null;
      if (file.fileSize > MAX_BYTES) throw new Error('Reader AI store exceeds size limit');
      const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
      if (typeof text !== 'string') throw new Error('Reader AI store unreadable');
      return text;
    },
    async write(source, contents, current) {
      const file = await fileFor(source);
      if (contents.length > MAX_BYTES) throw new Error('Reader AI store exceeds size limit');
      if (!(await current())) return false;
      await Zotero.File.createDirectoryIfMissingAsync(file.parent!.path);
      const stage = file.clone();
      stage.leafName += `.stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        await Zotero.File.putContentsAsync(stage.path, contents, 'UTF-8');
        if (stage.fileSize > MAX_BYTES) throw new Error('Reader AI store exceeds size limit');
        if (!(await current())) return false;
        if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
        await IOUtils.move(stage.path, file.path);
        return true;
      } finally {
        await Zotero.File.removeIfExists(stage.path);
        await Zotero.File.removeIfExists(`${stage.path}.tmp`);
      }
    },
  };
}
