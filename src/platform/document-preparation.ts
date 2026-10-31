import { analysisPDF, documentServiceTransport } from './document-analysis';
import { attachmentDocumentCache } from './document-analysis-cache';
import { checkParseCurrent } from '../document-analysis/contracts';
import { MINERU_MAX_BYTES, MINERU_MAX_PAGES } from '../document-analysis/mineru-client';
import { pdfSourcePages } from '../toolkit/pdf-source';
import type { PreparationHost } from '../document-analysis/preparation';

/** One local journal, serialized by the queue, contains identities only and is never an ordinary preference. */
function recordPath(): string {
  const file = Zotero.File.pathToFile(Zotero.DataDirectory.dir).clone();
  file.append('zotero-neo-document-tasks.json');
  const path = file.path;
  if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
  return path;
}
export function documentPreparationHost(debug: (message: string) => void): PreparationHost {
  return {
    transport: documentServiceTransport,
    debug,
    async readRecord() {
      const path = recordPath();
      if (!(await IOUtils.exists(path))) return null;
      if (((await IOUtils.stat(path)).size ?? Infinity) > 1024 * 1024)
        throw new Error('Document journal too large');
      return IOUtils.readJSON(path);
    },
    async writeRecord(value) {
      const path = recordPath();
      if (JSON.stringify(value).length > 256 * 1024) throw new Error('Document journal too large');
      await IOUtils.writeJSON(path, value, { tmpPath: path + '.tmp' });
    },
    async prepare(target, signal) {
      checkParseCurrent(signal);
      const item = await Zotero.Items.getAsync(target.itemID);
      if (
        !item ||
        item.deleted ||
        item.libraryID !== target.libraryID ||
        item.key !== target.key ||
        !item.isPDFAttachment()
      )
        throw new Error('PDF attachment changed');
      const path = await item.getFilePathAsync();
      if (!path) throw new Error('PDF file unavailable');
      const file = Zotero.File.pathToFile(path);
      if (file.fileSize > MINERU_MAX_BYTES) throw new Error('PDF exceeds 200 MB');
      const pdf = await analysisPDF(target.itemID);
      checkParseCurrent(signal);
      const pages = await pdfSourcePages(() => pdf.read(), signal, MINERU_MAX_PAGES);
      checkParseCurrent(signal);
      return {
        source: { fingerprint: pdf.fingerprint, fileName: pdf.fileName, pages },
        cache: attachmentDocumentCache(target.itemID),
        read: () => pdf.read(),
        isCurrent: async () => !signal.aborted && !item.deleted && (await pdf.isCurrent()),
      };
    },
  };
}

/** The controller must survive Reader/window teardown; never allocate its signal in a content iframe. */
export function documentPreparationAbort(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}
