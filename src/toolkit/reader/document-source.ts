import { nativeObjectIdentity } from '../../platform/cross-compartment';
import type { ReaderRuntime } from './contracts';
import { readerIsClosed, readerOwnerWindow } from './host';
import { readerPresentationView } from './presentation';
import type { NativePdfWindow, NativeReaderRuntime } from './private-types';

export interface ReaderPdfViewport {
  readonly identity: object;
  readonly presentation: object;
  readonly document: Document;
  readonly pages: readonly number[];
}

export interface ReaderPdfSource {
  readonly pageCount: number;
  readonly realm: Window | undefined;
  read(): Promise<Uint8Array>;
  isCurrent(): boolean;
  viewport(window: Window, mappedPages?: readonly number[]): ReaderPdfViewport | null;
}

/** Pin the loaded primary PDF, never the attachment path or its on-disk revision. */
export function readerPdfSource(reader: ReaderRuntime): ReaderPdfSource | null {
  const native = reader as NativeReaderRuntime;
  const internal = native._internalReader;
  const primary = internal?._primaryView;
  const window = primary?._iframeWindow as NativePdfWindow | undefined;
  const document = window?.document;
  const pdf = window?.PDFViewerApplication?.pdfDocument;
  const getData = pdf?.getData;
  const count = pdf?.numPages ?? pdf?._pdfInfo?.numPages;
  const itemID = reader.itemID;
  if (
    !window ||
    !pdf ||
    !getData ||
    count === undefined ||
    !Number.isSafeInteger(count) ||
    count < 1
  )
    return null;
  const current = (): boolean =>
    !readerIsClosed(reader) &&
    !window.closed &&
    reader.itemID === itemID &&
    native._internalReader === internal &&
    internal?._primaryView === primary &&
    primary?._iframeWindow === window &&
    window.document === document &&
    window.PDFViewerApplication?.pdfDocument === pdf;
  const fingerprints = pdf.fingerprints ?? pdf._pdfInfo?.fingerprints;
  return {
    pageCount: count,
    realm: readerOwnerWindow(reader),
    read: async () => nativeObjectIdentity(await getData.call(pdf)),
    isCurrent: current,
    viewport(targetWindow, mappedPages) {
      if (!current() || targetWindow.closed) return null;
      const primaryPresentation = readerPresentationView(reader, true);
      const isPrimary = primaryPresentation?._iframeWindow === targetWindow;
      const presentation = isPrimary ? primaryPresentation : readerPresentationView(reader, false);
      if (presentation?._iframeWindow !== targetWindow) return null;
      const view = isPrimary ? primary : internal?._secondaryView;
      const pdfWindow = view?._iframeWindow as NativePdfWindow | undefined;
      const app = pdfWindow?.PDFViewerApplication;
      const targetPdf = app?.pdfDocument;
      if (!pdfWindow || pdfWindow.closed || !targetPdf) return null;
      if (targetPdf !== pdf) {
        // A split has a separate PDF.js proxy. It must be showing the same PDF.
        const other = targetPdf.fingerprints ?? targetPdf._pdfInfo?.fingerprints;
        if (
          !fingerprints?.[0] ||
          !other ||
          fingerprints[0] !== other[0] ||
          fingerprints[1] !== other[1]
        )
          return null;
      }
      // Native Reading Mode has no PDF.js viewport. Only its exact Range→PDF
      // mappings supplied by selection may request layout through that presentation.
      const indexes =
        presentation === view
          ? app?.pdfViewer?._getVisiblePages?.().views.map(({ id }) => id - 1)
          : mappedPages;
      if (!indexes) return null;
      const pages = [...new Set(indexes)].filter(
        (index) => Number.isSafeInteger(index) && index >= 0 && index < count,
      );
      return { identity: targetPdf, presentation, document: targetWindow.document, pages };
    },
  };
}
