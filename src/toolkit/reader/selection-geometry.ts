import type { ComputedAnnotationPosition, PdfWindow } from './contracts';
import type { NativePdfWindow } from './private-types';

/** Converts only selected text-node fragments; canvas/page boxes are not annotation text. */
export function computeSelectionPosition(
  pdfWindow: PdfWindow,
  selection: Selection,
): ComputedAnnotationPosition | null {
  if (!selection.rangeCount) return null;
  const viewer = (pdfWindow as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  if (!viewer) return null;
  const range = selection.getRangeAt(0);
  const rectangles: DOMRect[] = [];
  let incomplete = false;
  const collect = (fragment: Range) => {
    const bounds = fragment.getClientRects();
    if (!bounds) {
      incomplete = true;
      return;
    }
    for (const rectangle of bounds) {
      if (rectangle.width > 1 && rectangle.height > 1) rectangles.push(rectangle);
    }
  };
  if (range.commonAncestorContainer.nodeType === 3) {
    collect(range);
  } else {
    const walker = pdfWindow.document.createTreeWalker(range.commonAncestorContainer, 4);
    walker.currentNode = range.startContainer;
    let node = range.startContainer.nodeType === 3 ? range.startContainer : walker.nextNode();
    for (; node; node = walker.nextNode()) {
      if (range.comparePoint(node, 0) > 0) break;
      if (!range.intersectsNode(node)) continue;
      const fragment = pdfWindow.document.createRange();
      fragment.selectNodeContents(node);
      if (node === range.startContainer) fragment.setStart(node, range.startOffset);
      if (node === range.endContainer) fragment.setEnd(node, range.endOffset);
      collect(fragment);
    }
  }
  const pages = Array.from(
    pdfWindow.document.querySelectorAll('.page[data-page-number]'),
  ) as HTMLElement[];
  const pageBounds = new Array<DOMRect>(pages.length);
  const groups = new Map<number, { bounds: DOMRect; rectangles: DOMRect[] }>();
  for (const rectangle of rectangles) {
    const center = (rectangle.top + rectangle.bottom) / 2;
    let page: HTMLElement | undefined;
    let bounds: DOMRect | undefined;
    for (let index = 0; index < pages.length; index += 1) {
      const candidate = pages[index]!;
      const candidateBounds = (pageBounds[index] ??= candidate.getBoundingClientRect());
      if (center >= candidateBounds.top && center <= candidateBounds.bottom) {
        page = candidate;
        bounds = candidateBounds;
        break;
      }
    }
    const index = Number(page?.dataset.pageNumber) - 1;
    if (!bounds || !Number.isInteger(index) || index < 0) {
      incomplete = true;
      continue;
    }
    const group = groups.get(index);
    if (group) group.rectangles.push(rectangle);
    else groups.set(index, { bounds, rectangles: [rectangle] });
  }
  const ordered = [...groups.entries()].sort(([left], [right]) => left - right);
  const first = ordered[0];
  if (!first) return null;
  const pageLabel = viewer._pageLabels?.[first[0]] ?? String(first[0] + 1);
  const next = ordered[1];
  if (ordered.length > 2 || (next && next[0] !== first[0] + 1)) {
    return { position: null, pageLabel, failure: 'unsupported-page-span' };
  }
  if (incomplete) return { position: null, pageLabel, failure: 'invalid-geometry' };
  const convert = ([pageIndex, group]: [number, { bounds: DOMRect; rectangles: DOMRect[] }]):
    | number[][]
    | null => {
    const pageView = viewer._pages?.[pageIndex] ?? viewer.getPageView?.(pageIndex);
    const viewport = pageView?.viewport;
    if (!viewport?.convertToPdfPoint) return null;
    const converted: number[][] = [];
    for (const rectangle of group.rectangles) {
      const upperLeft = viewport.convertToPdfPoint(
        rectangle.left - group.bounds.left,
        rectangle.top - group.bounds.top,
      );
      const lowerRight = viewport.convertToPdfPoint(
        rectangle.right - group.bounds.left,
        rectangle.bottom - group.bounds.top,
      );
      if (!upperLeft || !lowerRight) return null;
      const rect = [
        Math.min(upperLeft[0], lowerRight[0]),
        Math.min(upperLeft[1], lowerRight[1]),
        Math.max(upperLeft[0], lowerRight[0]),
        Math.max(upperLeft[1], lowerRight[1]),
      ].map((value) => Math.round(value * 1000) / 1000);
      if (!rect.every(Number.isFinite) || rect[2]! <= rect[0]! || rect[3]! <= rect[1]!) return null;
      converted.push(rect);
    }
    return converted;
  };
  const rects = convert(first);
  if (!rects?.length) return { position: null, pageLabel, failure: 'invalid-geometry' };
  const position: { pageIndex: number; rects: number[][]; nextPageRects?: number[][] } = {
    pageIndex: first[0],
    rects,
  };
  if (next) {
    const nextRects = convert(next);
    if (!nextRects?.length) return { position: null, pageLabel, failure: 'invalid-geometry' };
    position.nextPageRects = nextRects;
  }
  const pageHeight =
    viewer._pages?.[first[0]]?.viewport?.height ??
    viewer.getPageView?.(first[0])?.viewport?.height ??
    0;
  const y = rects[0]?.[3] ?? 0;
  const sortIndex = `${String(first[0]).padStart(5, '0')}|000000|${String(Math.max(0, Math.floor(pageHeight - y))).padStart(5, '0')}`;
  return { position: JSON.stringify(position), sortIndex, pageLabel };
}

/** Uses the native scroll surface where present, with the existing DOM fallback. */
export function readerScrollContainer(pdfWindow: PdfWindow): HTMLElement {
  return ((pdfWindow as NativePdfWindow).PDFViewerApplication?.pdfViewer?.container ??
    pdfWindow.document.getElementById('viewerContainer') ??
    pdfWindow.document.scrollingElement ??
    pdfWindow.document.documentElement) as HTMLElement;
}

export function readerPagePositionTop(
  pdfWindow: PdfWindow,
  position: 'top' | 'center' | 'bottom',
): number | null {
  const viewer = (pdfWindow as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  const container = viewer?.container;
  if (!viewer || !container) {
    const element = readerScrollContainer(pdfWindow);
    const available = Math.max(0, element.scrollHeight - element.clientHeight);
    return position === 'top' ? 0 : position === 'bottom' ? available : available / 2;
  }
  const page = pdfWindow.document.querySelector<HTMLElement>(
    `.page[data-page-number="${viewer.currentPageNumber ?? 1}"]`,
  );
  if (!page) return null;
  const target =
    position === 'top'
      ? page.offsetTop
      : position === 'bottom'
        ? page.offsetTop + page.offsetHeight - container.clientHeight
        : page.offsetTop + page.offsetHeight / 2 - container.clientHeight / 2;
  return Math.max(0, target);
}

export function readerPageRatioTop(
  pdfWindow: PdfWindow,
  pageIndex: number,
  ratio: number,
): number | null {
  const container =
    (pdfWindow as NativePdfWindow).PDFViewerApplication?.pdfViewer?.container ??
    pdfWindow.document.getElementById('viewerContainer');
  const page = pdfWindow.document.querySelector<HTMLElement>(
    `.page[data-page-number="${pageIndex + 1}"]`,
  );
  return page && page.offsetHeight > 0 && container
    ? Math.max(0, page.offsetTop + page.offsetHeight * ratio - container.clientHeight / 2)
    : null;
}

export async function readerAnnotationPageRatio(
  pdfWindow: PdfWindow,
  annotationPosition: string | undefined,
): Promise<{ pageIndex: number; ratio: number }> {
  try {
    const parsed: unknown = JSON.parse(annotationPosition ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { pageIndex: 0, ratio: 0.5 };
    const pageIndexValue = 'pageIndex' in parsed ? parsed.pageIndex : undefined;
    const rectsValue = 'rects' in parsed ? parsed.rects : undefined;
    const pageIndex = typeof pageIndexValue === 'number' ? pageIndexValue : 0;
    if (!Array.isArray(rectsValue) || !Array.isArray(rectsValue[0]))
      return { pageIndex, ratio: 0.5 };
    const y = rectsValue[0][3] ?? rectsValue[0][1];
    if (typeof y !== 'number') return { pageIndex, ratio: 0.5 };
    const page = await (pdfWindow as NativePdfWindow).PDFViewerApplication?.pdfDocument?.getPage?.(
      pageIndex + 1,
    );
    const viewport = page?.getViewport({ scale: 1 });
    return viewport
      ? { pageIndex, ratio: Math.max(0, Math.min(1, (viewport.height - y) / viewport.height)) }
      : { pageIndex, ratio: 0.5 };
  } catch {
    return { pageIndex: 0, ratio: 0.5 };
  }
}
