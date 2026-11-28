import type { NativePdfWindow } from './private-types';

export interface ReaderPaintedTextLayer {
  readonly node: Element;
  readonly marker: Element;
}

/** Find the completed text layer by page index without scanning the document's rendered text. */
export function readerPaintedTextLayer(
  window: Window,
  index: number,
): ReaderPaintedTextLayer | undefined {
  const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  const page = viewer?._pages?.[index] ?? viewer?.getPageView?.(index);
  const node = page?.div?.querySelector('.textLayer:not([hidden])');
  // PDF.js appends this sentinel only after rendering the text layer.
  const marker = node?.querySelector('.endOfContent');
  return node && marker ? { node, marker } : undefined;
}
