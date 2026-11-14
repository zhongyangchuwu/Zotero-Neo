import { checkParseCurrent, type DocumentPage } from '../document-analysis/contracts';
import { nativeDocumentPages } from '../document-analysis/native';
import { cloneInto } from '../platform/cross-compartment';
import type { LocalFigurePage } from '../document-analysis/local-figures';
import { pdfFigureGraphics, pdfFigureText } from './pdf-figure-geometry';

interface PDFTask {
  readonly promise: Promise<{
    readonly numPages: number;
    getPage(index: number): Promise<{
      readonly view: readonly number[];
      readonly rotate: number;
      getTextContent(): Promise<unknown>;
      getOperatorList(): Promise<unknown>;
    }>;
  }>;
  destroy(): Promise<void>;
}
interface HostPDFModule {
  readonly GlobalWorkerOptions: { workerSrc: string };
  readonly OPS: Readonly<Record<string, number>>;
  getDocument(options: {
    data: Uint8Array;
    disableFontFace: boolean;
    isEvalSupported: boolean;
  }): PDFTask;
}

async function withPdfSource<T>(
  read: () => Promise<Uint8Array>,
  signal: AbortSignal,
  maxPages: number,
  visit: (pdf: Awaited<PDFTask['promise']>, module: HostPDFModule) => Promise<T>,
): Promise<T> {
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
    return await visit(pdf, module);
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}

/** Read source geometry without opening Reader tabs or invoking SDT/OCR. */
export async function pdfSourcePages(
  read: () => Promise<Uint8Array>,
  signal: AbortSignal,
  maxPages: number,
): Promise<readonly DocumentPage[]> {
  return withPdfSource(read, signal, maxPages, async (pdf) => {
    const pages: { viewRect: readonly number[]; rotation: number }[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      checkParseCurrent(signal);
      const page = await pdf.getPage(index);
      checkParseCurrent(signal);
      pages.push({ viewRect: page.view, rotation: page.rotate });
    }
    return nativeDocumentPages({ pages });
  });
}

/** Read painted graphics and native text; no pixels, SDT labels, OCR or model are used. */
export async function pdfSourceFigurePages(
  read: () => Promise<Uint8Array>,
  signal: AbortSignal,
  maxPages: number,
  isCurrent: () => boolean = () => true,
): Promise<readonly LocalFigurePage[]> {
  const check = (): void => {
    checkParseCurrent(signal);
    if (!isCurrent()) throw new Error('Document analysis cancelled');
  };
  check();
  return withPdfSource(read, signal, maxPages, async (pdf, module) => {
    const pages: LocalFigurePage[] = [];
    for (let index = 0; index < pdf.numPages; index++) {
      check();
      const page = await pdf.getPage(index + 1);
      check();
      const text = pdfFigureText(await page.getTextContent());
      check();
      const graphics = pdfFigureGraphics(await page.getOperatorList(), module.OPS);
      check();
      const geometry = nativeDocumentPages({
        pages: [{ viewRect: page.view, rotation: page.rotate }],
      })[0]!;
      pages.push({ pageIndex: index, viewBox: geometry.viewBox, text, graphics });
    }
    return pages;
  });
}
