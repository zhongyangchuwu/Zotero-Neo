import { checkParseCurrent, type DocumentPage } from '../document-analysis/contracts';
import { nativeDocumentPages } from '../document-analysis/native';
import { cloneInto } from '../platform/cross-compartment';

interface PDFTask {
  readonly promise: Promise<{
    readonly numPages: number;
    getPage(index: number): Promise<{ readonly view: readonly number[]; readonly rotate: number }>;
  }>;
  destroy(): Promise<void>;
}
interface HostPDFModule {
  readonly GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: {
    data: Uint8Array;
    disableFontFace: boolean;
    isEvalSupported: boolean;
  }): PDFTask;
}

/** Read page geometry with Zotero's bundled PDF.js, without opening Reader tabs or invoking SDT/OCR. */
export async function pdfSourcePages(
  read: () => Promise<Uint8Array>,
  signal: AbortSignal,
  maxPages: number,
): Promise<readonly DocumentPage[]> {
  checkParseCurrent(signal);
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('Invalid PDF page budget');
  const window = Zotero.getMainWindow();
  if (!window || window.closed) throw new Error('PDF metadata host unavailable');
  // PDF.js polyfills need the Main window's mutable realm, rather than Bootstrap's module realm.
  // This fixed loader has no caller-supplied code and loads only Zotero's installed module.
  const load = new (window as unknown as { Function: FunctionConstructor }).Function(
    "return ChromeUtils.importESModule('resource://zotero/reader/pdf/build/pdf.mjs', { global: 'current' });",
  );
  const module = load() as HostPDFModule;
  module.GlobalWorkerOptions.workerSrc = 'resource://zotero/reader/pdf/build/pdf.worker.mjs';
  const bytes = await read();
  checkParseCurrent(signal);
  const task = module.getDocument(
    cloneInto({ data: bytes, disableFontFace: true, isEvalSupported: false }, window),
  );
  const abort = (): void => {
    void task.destroy().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    checkParseCurrent(signal);
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > maxPages)
      throw new Error(`PDF exceeds ${maxPages} pages or is unreadable`);
    const pages: { viewRect: readonly number[]; rotation: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      checkParseCurrent(signal);
      const page = await pdf.getPage(i);
      checkParseCurrent(signal);
      pages.push({ viewRect: page.view, rotation: page.rotate });
    }
    return nativeDocumentPages({ pages });
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
