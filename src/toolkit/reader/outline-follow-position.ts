import type { NativePdfWindow, NativeReaderViewRuntime, PdfPageViewRuntime } from './private-types';

const READING_LINE = 0.18;

export interface OutlineFollowLocation {
  readonly position?: object;
  readonly href?: string;
}

interface VisiblePdfPage {
  readonly id: number;
  readonly y: number;
  readonly view: PdfPageViewRuntime;
}

interface EpubOutlineView extends NativeReaderViewRuntime {
  readonly flow?: {
    readonly startRange: Range | null;
    readonly startSection: { readonly index: number } | null;
  };
  _getHrefTarget?(href: string): HTMLElement | null;
}

export type CompareOutlineLocations = (
  candidate: OutlineFollowLocation,
  other: OutlineFollowLocation | null,
) => number | null;

function comparator<T>(
  resolve: (location: OutlineFollowLocation) => T | null,
  compare: (left: T, right: T) => number | null,
  relativeToReadingPosition: (target: T) => number | null,
): CompareOutlineLocations {
  const targets = new Map<OutlineFollowLocation, T | null>();
  const cached = (location: OutlineFollowLocation): T | null => {
    const existing = targets.get(location);
    if (existing !== undefined) return existing;
    const target = resolve(location);
    targets.set(location, target);
    return target;
  };
  return (candidate, other) => {
    const left = cached(candidate);
    if (left === null) return null;
    if (!other) return relativeToReadingPosition(left);
    const right = cached(other);
    return right === null ? null : compare(left, right);
  };
}

function pageIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function pdfOutlinePosition(window: NativePdfWindow): CompareOutlineLocations | null {
  const app = window.PDFViewerApplication;
  const viewer = app?.pdfViewer as
    | (NonNullable<typeof app>['pdfViewer'] & {
        _getVisiblePages?(): { readonly views: readonly VisiblePdfPage[] };
      })
    | undefined;
  const container = viewer?.container;
  const count = viewer?.pagesCount ?? app?.pdfDocument?.numPages;
  if (!viewer || !container?.clientHeight || !count) return null;
  const line = container.scrollTop + container.clientHeight * READING_LINE;
  const visible = viewer._getVisiblePages?.().views;
  let current: VisiblePdfPage | undefined;
  if (visible?.length) {
    // PDF.js reports visible pages in percentage order, not reading-line order. In a
    // spread, use its active page if both pages meet the line; in a gutter prefer above.
    for (const page of visible) {
      if (
        !current ||
        (page.y <= line
          ? current.y > line || page.y > current.y
          : current.y > line && page.y < current.y) ||
        (page.y === current.y && page.id === viewer.currentPageNumber)
      )
        current = page;
    }
  }
  const activeNumber = current?.id ?? viewer.currentPageNumber;
  if (activeNumber === undefined || !pageIndex(activeNumber - 1) || activeNumber > count)
    return null;
  const activePage = activeNumber - 1;
  const getPage = (index: number): PdfPageViewRuntime | undefined =>
    index === activePage && current
      ? current.view
      : (viewer.getPageView?.(index) ?? viewer._pages?.[index]);
  const activeDiv = getPage(activePage)?.div;
  const origin =
    current?.y ??
    (activeDiv
      ? container.scrollTop +
        activeDiv.getBoundingClientRect().top +
        activeDiv.clientTop -
        container.getBoundingClientRect().top -
        container.clientTop
      : null);
  const readingOffset = origin === null ? null : Math.max(0, line - origin);

  type Target = { readonly page: number; readonly offset: number };
  return comparator<Target>(
    ({ position }) => {
      const native = position as
        | { readonly pageIndex?: unknown; readonly rects?: unknown }
        | undefined;
      const page = native?.pageIndex;
      if (!pageIndex(page) || page >= count || page > activePage) return null;
      const rects = native?.rects;
      if (rects == null || (Array.isArray(rects) && rects.length === 0)) return { page, offset: 0 };
      if (!Array.isArray(rects)) return null;
      const viewport = getPage(page)?.viewport as
        | { convertToViewportPoint?(x: number, y: number): readonly [number, number] }
        | undefined;
      let offset = Infinity;
      let pageOnly = false;
      for (const rect of rects) {
        if (!Array.isArray(rect) || !rect.length) continue;
        const [x1, y1, x2, y2] = rect;
        if ((x1 != null && !Number.isFinite(x1)) || (x2 != null && !Number.isFinite(x2))) continue;
        if (y1 == null && y2 == null) {
          pageOnly = true;
          continue;
        }
        if ((y1 != null && !Number.isFinite(y1)) || (y2 != null && !Number.isFinite(y2))) continue;
        const point = viewport?.convertToViewportPoint;
        if (point) {
          const x = x1 ?? x2 ?? 0;
          const y = y1 ?? y2;
          offset = Math.min(offset, point.call(viewport, x, y)[1]);
          if ((x2 ?? x) !== x || (y2 ?? y) !== y)
            offset = Math.min(offset, point.call(viewport, x2 ?? x, y2 ?? y)[1]);
        }
      }
      if (Number.isFinite(offset)) return { page, offset };
      return pageOnly ? { page, offset: 0 } : null;
    },
    (left, right) => left.page - right.page || left.offset - right.offset,
    (target) =>
      target.page !== activePage
        ? target.page - activePage
        : readingOffset === null
          ? target.offset === 0
            ? 0
            : null
          : target.offset - readingOffset,
  );
}

function domOutlinePosition(
  view: NativeReaderViewRuntime,
  window: Window,
  document: Document,
): CompareOutlineLocations | null {
  if (window.innerHeight <= 0) return null;
  const line = window.innerHeight * READING_LINE;
  return comparator<number>(
    ({ position, href }) => {
      let rect: DOMRect | undefined;
      if (typeof href === 'string' && href.startsWith('#sdt-')) {
        // Reading Mode publishes fragment destinations for its rendered SDT blocks.
        const element = document.getElementById(href.slice(1));
        if (element?.closest('#sdt-content')) rect = element.getBoundingClientRect();
      } else if (
        position &&
        typeof position === 'object' &&
        'type' in position &&
        (position.type === 'CssSelector' || position.type === 'TextPositionSelector')
      ) {
        try {
          const range = view.toDisplayedRange?.(position);
          if (range?.startContainer.ownerDocument === document && range.startContainer.isConnected)
            rect = range.getBoundingClientRect();
        } catch {
          // Invalid or no longer resolvable snapshot selectors are not destinations.
          return null;
        }
      }
      return rect && (rect.width > 0 || rect.height > 0) && Number.isFinite(rect.top)
        ? rect.top
        : null;
    },
    (left, right) => left - right,
    (target) => target - line,
  );
}

function sectionOf(node: Node | undefined): number | null {
  const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
  const raw = element?.closest('[data-section-index]')?.getAttribute('data-section-index');
  const index = raw ? Number(raw) : null;
  return pageIndex(index) ? index : null;
}

function epubOutlinePosition(
  view: EpubOutlineView,
  document: Document,
): CompareOutlineLocations | null {
  if (!view._getHrefTarget || !view.flow) return null;
  const range = view.flow.startRange;
  const start = range?.startContainer;
  const currentSection =
    (range && sectionOf(start?.childNodes[range.startOffset] ?? start)) ??
    view.flow.startSection?.index;
  if (!pageIndex(currentSection)) return null;

  type Target = { readonly section: number; readonly node: HTMLElement; readonly start: boolean };
  return comparator<Target>(
    ({ href }) => {
      if (typeof href !== 'string' || !href) return null;
      const node = view._getHrefTarget?.(href);
      if (!node || node.ownerDocument !== document) return null;
      const section = sectionOf(node);
      if (section === null) return null;
      const start = node.classList.contains('section-container');
      // The native resolver returns the section container for an unresolved hash.
      // That does not prove the link names a heading at the section's beginning.
      if (start && /#.+/.test(href)) return null;
      return { section, node, start };
    },
    (left, right) => {
      if (left.section !== right.section) return left.section - right.section;
      if (left.node === right.node) return 0;
      if (left.node.getRootNode() !== right.node.getRootNode()) return null;
      // DOM's FOLLOWING/PRECEDING bits, for attached or virtualized sections alike.
      const order = left.node.compareDocumentPosition(right.node);
      return order & 4 ? -1 : order & 2 ? 1 : null;
    },
    (target) => {
      if (target.section !== currentSection) return target.section - currentSection;
      if (target.start) return 0;
      if (!range || start?.getRootNode() !== target.node.getRootNode()) return null;
      return range.comparePoint(target.node, 0);
    },
  );
}

export function outlineReadingPosition(
  view: NativeReaderViewRuntime,
  window: Window,
  document: Document,
): CompareOutlineLocations | null {
  if ((window as NativePdfWindow).PDFViewerApplication)
    return pdfOutlinePosition(window as NativePdfWindow);
  if ((view as EpubOutlineView)._getHrefTarget) return epubOutlinePosition(view, document);
  return domOutlinePosition(view, window, document);
}
