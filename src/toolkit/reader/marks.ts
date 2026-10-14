import type { ItemRuntime } from '../../reader/types';
import type { NativePdfWindow } from './private-types';

export function readerMarkPosition(window: Window): { pageIndex: number | null; ratio: number } {
  try {
    const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
    const container = viewer?.container ?? window.document.getElementById('viewerContainer');
    if (viewer && container) {
      const pageNumber = viewer.currentPageNumber ?? 1;
      const page = window.document.querySelector<HTMLElement>(
        `.page[data-page-number="${pageNumber}"]`,
      );
      const ratio =
        page && page.offsetHeight > 0
          ? (container.scrollTop - page.offsetTop + container.clientHeight / 2) / page.offsetHeight
          : 0;
      return { pageIndex: pageNumber - 1, ratio: Math.max(0, Math.min(1, ratio)) };
    }
    const fallback = window.document.scrollingElement ?? window.document.documentElement;
    const range = Math.max(0, fallback.scrollHeight - fallback.clientHeight);
    return { pageIndex: null, ratio: range ? fallback.scrollTop / range : 0 };
  } catch {
    return { pageIndex: null, ratio: 0 };
  }
}

export function readerMarkTolerance(
  window: Window,
  pageIndex: number | null,
  pages: number,
): number {
  if (pageIndex !== null) {
    const page = window.document.querySelector<HTMLElement>(
      `.page[data-page-number="${pageIndex + 1}"]`,
    );
    if (page && page.offsetHeight > 0) return 1 / page.offsetHeight;
  } else {
    const container = window.document.scrollingElement ?? window.document.documentElement;
    const range = container.scrollHeight - container.clientHeight;
    if (range > 0) return pages / range;
  }
  return 0.000001;
}
export function readerPageCount(window: Window): number {
  return (window as NativePdfWindow).PDFViewerApplication?.pdfViewer?.pagesCount ?? 1;
}
export function setReaderMarkPage(window: Window, pageIndex: number): void {
  const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  if (viewer) viewer.currentPageNumber = pageIndex + 1;
}

export function readerMarkExtra(item: ItemRuntime | null): string {
  if (!item) return '';
  try {
    return item.getField?.('extra') ?? (item as ItemRuntime & { extra?: string }).extra ?? '';
  } catch {
    return '';
  }
}
export function setReaderMarkExtra(item: ItemRuntime, value: string): void {
  if (item.setField) item.setField('extra', value);
  else (item as ItemRuntime & { extra?: string }).extra = value;
}
