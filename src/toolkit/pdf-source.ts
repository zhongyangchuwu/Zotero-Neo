import { checkParseCurrent, documentRect, record } from '../document-analysis/contracts';
import { mayContainDocumentCaption } from '../document-analysis/local-rules/caption-identity';
import { cloneInto } from '../platform/cross-compartment';
import type { LocalFigurePage } from '../document-analysis/local-rules';
import { pdfFigureGeometry } from './pdf-figure-geometry';

interface PdfPage {
  readonly view: readonly number[];
  getTextContent(): Promise<unknown>;
  getOperatorList(): Promise<unknown>;
  cleanup(): boolean;
}

interface PDFTask {
  readonly promise: Promise<{
    readonly numPages: number;
    getPage(index: number): Promise<PdfPage>;
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
    wasmUrl: string;
  }): PDFTask;
}

export interface PdfExtractionSource {
  readonly pageCount: number;
  readPage(
    index: number,
    needGeometry: (hasCaption: () => boolean) => boolean,
  ): Promise<LocalFigurePage | null>;
  destroy(): Promise<void>;
}

function* pdfTextChunks(content: unknown): Iterable<string> {
  const items = record(content)?.items;
  if (!Array.isArray(items)) throw new Error('PDF text content unavailable');
  for (const item of items) {
    const text = record(item)?.str;
    if (typeof text === 'string') yield text;
  }
}

/** Open one in-memory host PDF.js document, owned by the caller's abort signal. */
export async function openPdfSource(
  read: () => Promise<Uint8Array>,
  signal: AbortSignal,
  window: Window | undefined = Zotero.getMainWindow(),
): Promise<PdfExtractionSource> {
  checkParseCurrent(signal);
  if (!window || window.closed) throw new Error('PDF extraction host unavailable');
  // Use a mutable chrome window realm for the PDF.js polyfills, not Bootstrap's module realm.
  const realm = window as Window & { Function: FunctionConstructor };
  const load = new realm.Function(
    "return ChromeUtils.importESModule('resource://zotero/reader/pdf/build/pdf.mjs', { global: 'current' });",
  );
  const module = load() as HostPDFModule;
  module.GlobalWorkerOptions.workerSrc = 'resource://zotero/reader/pdf/build/pdf.worker.mjs';
  const bytes = await read();
  checkParseCurrent(signal);
  const task = module.getDocument(
    // CCITT/JBIG2 decoding otherwise aborts embedded Forms and silently loses later paths.
    cloneInto(
      {
        data: bytes,
        disableFontFace: true,
        isEvalSupported: false,
        wasmUrl: 'resource://zotero/reader/pdf/web/wasm/',
      },
      window,
    ),
  );
  let disposal: Promise<void> | undefined;
  const destroy = (): Promise<void> => {
    signal.removeEventListener('abort', abort);
    return (disposal ??= task.destroy());
  };
  const abort = (): void => {
    void destroy().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    checkParseCurrent(signal);
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1)
      throw new Error('PDF page count unavailable');
    return {
      pageCount: pdf.numPages,
      destroy,
      async readPage(index, needGeometry) {
        checkParseCurrent(signal);
        const page = await pdf.getPage(index + 1);
        checkParseCurrent(signal);
        try {
          const textContent = await page.getTextContent();
          checkParseCurrent(signal);
          if (!needGeometry(() => mayContainDocumentCaption(pdfTextChunks(textContent))))
            return null;
          const operators = await page.getOperatorList();
          checkParseCurrent(signal);
          const viewBox = documentRect(page.view);
          if (!viewBox) throw new Error('PDF page bounds unavailable');
          return {
            pageIndex: index,
            viewBox,
            ...pdfFigureGeometry(textContent, operators, module.OPS),
          };
        } finally {
          // PDF.js otherwise keeps the full operator list on every visited page proxy.
          if (!signal.aborted) page.cleanup();
        }
      },
    };
  } catch (error) {
    await destroy().catch(() => {});
    throw error;
  }
}

/** Offline quality tooling: read all painted graphics and native text without a Reader session. */
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
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('Invalid PDF page budget');
  const pdf = await openPdfSource(read, signal);
  try {
    if (pdf.pageCount > maxPages) throw new Error(`PDF exceeds ${maxPages} pages`);
    const pages: LocalFigurePage[] = [];
    for (let index = 0; index < pdf.pageCount; index++) {
      check();
      const page = await pdf.readPage(index, () => {
        check();
        return true;
      });
      check();
      if (page) pages.push(page);
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
