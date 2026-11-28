import { isDeadObject } from '../../platform/cross-compartment';
import { CleanupFailure } from '../../core/cleanup';
import { readerReadingMode } from './presentation';
import type { NativePdfWindow } from './private-types';

export interface ReaderTextSourceLocation {
  readonly pageIndex: number | null;
  readonly rect: readonly number[] | null;
  readonly sourceBlockId: string | null;
  /** PDF.js rotated text has font leading across its short axis, as on arXiv margin labels. */
  readonly vertical?: boolean;
}

export interface ReaderTextAdmission {
  readonly current: () => boolean;
  readonly ready: (location: ReaderTextSourceLocation) => boolean;
  readonly accepts: (location: ReaderTextSourceLocation) => boolean;
}

interface Admission extends ReaderTextAdmission {
  readonly id: string;
  readonly document: Document;
  readonly validate: () => boolean | Promise<boolean>;
  readonly marked: Map<HTMLElement, string | null>;
  readonly dispose: () => void;
  visits: number;
}
const admissions = new WeakMap<Window, Admission>();
interface SelectFilter {
  readonly admission: Admission;
  readonly releaseStyle: () => void;
  invalid: boolean;
}
const selectFilters = new WeakMap<Window, SelectFilter>();
const ATTRIBUTE = 'data-zv-text-excluded';
let nextAdmission = 0;

function restoreAttribute(element: HTMLElement, previous: string | null, id: string): void {
  if (isDeadObject(element) || element.getAttribute(ATTRIBUTE) !== id) return;
  if (previous === null) element.removeAttribute(ATTRIBUTE);
  else element.setAttribute(ATTRIBUTE, previous);
}

/** Mark current layout without changing native selection until an admitted gesture starts. */
export function leaseReaderTextAdmission(
  window: Window,
  accepts: Admission['accepts'],
  current: () => boolean,
  validate: Admission['validate'] = () => true,
  ready: ReaderTextAdmission['ready'] = (location) =>
    (location.pageIndex !== null && location.rect !== null) || !!location.sourceBlockId,
): () => void {
  admissions.get(window)?.dispose();
  const document = window.document;
  const marked = new Map<HTMLElement, string | null>();
  let disposed = false;
  const id = String(++nextAdmission);
  const admission: Admission = {
    id,
    document,
    accepts,
    ready,
    validate,
    marked,
    visits: 0,
    current: () => !disposed && current() && !isDeadObject(window) && window.document === document,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (admissions.get(window) === admission) admissions.delete(window);
      const failure = new CleanupFailure();
      const filter = selectFilters.get(window);
      if (filter?.admission === admission) failure.run(filter.releaseStyle);
      for (const [element, previous] of marked)
        failure.run(() => restoreAttribute(element, previous, id));
      marked.clear();
      failure.rethrow();
    },
  };
  admissions.set(window, admission);
  return admission.dispose;
}

/** Capture a single layout publication; it cannot become current again after replacement. */
export function captureReaderTextAdmission(window: Window): ReaderTextAdmission | null {
  const admission = admissions.get(window);
  if (!admission?.current()) return null;
  return {
    accepts: admission.accepts,
    ready: admission.ready,
    current: () => admission.current() && admission.validate() === true,
  };
}

/** The document owns this rule only while an admitted mouse or Neo Select gesture is active. */
export function activateReaderTextFilter(window: Window): () => void {
  const document = window.document;
  const style = document.createElement('style');
  style.setAttribute('data-zv-body-filter', '');
  style.textContent =
    ':is(.textLayer, #sdt-content) [data-zv-text-excluded] { user-select:none !important; }';
  document.documentElement.appendChild(style);
  return () => {
    if (!isDeadObject(style)) style.remove();
  };
}

/** Latch Neo Select intent at its anchor. Warming a page never takes over an existing selection. */
export function beginReaderTextSelection(window: Window, anchor: Text): (() => void) | null {
  const admission = admissions.get(window);
  if (!admission?.current() || admission.validate() !== true) return null;
  const location = sourceLocation(window, anchor);
  if (!admission.ready(location) || !admission.accepts(location)) return null;
  const releaseStyle = activateReaderTextFilter(window);
  const filter = { admission, releaseStyle, invalid: false };
  selectFilters.set(window, filter);
  return () => {
    if (selectFilters.get(window) === filter) selectFilters.delete(window);
    releaseStyle();
  };
}

/** Recheck source ownership before copying or saving a filtered snapshot; never accept a replacement lease. */
export async function validateReaderSelection(window: Window): Promise<boolean> {
  const filter = selectFilters.get(window);
  if (!filter) return true;
  const { admission } = filter;
  const invalidate = (): false => {
    filter.invalid = true;
    filter.releaseStyle();
    return false;
  };
  if (filter.invalid || admissions.get(window) !== admission || !admission.current())
    return invalidate();
  const selection = window.getSelection();
  const endpoints = selection && [
    selection.anchorNode,
    selection.anchorOffset,
    selection.focusNode,
    selection.focusOffset,
  ];
  let valid = false;
  try {
    valid = await admission.validate();
  } catch {
    // Missing or changed source geometry cannot authorize a filtered write.
  }
  valid = valid && admissions.get(window) === admission && admission.current();
  if (!valid || selectFilters.get(window) !== filter) return invalidate();
  const latest = window.getSelection();
  return (
    !!endpoints &&
    !!latest &&
    endpoints[0] === latest.anchorNode &&
    endpoints[1] === latest.anchorOffset &&
    endpoints[2] === latest.focusNode &&
    endpoints[3] === latest.focusOffset
  );
}

export function readerTextAdmissionActive(window: Window): boolean {
  return admissions.get(window)?.current() === true;
}

/** Keep a stale filtered intent distinguishable from a gesture that started unfiltered. */
export function readerSelectionIsFiltered(window: Window): boolean {
  return selectFilters.has(window);
}

/** Read PDF source coordinates or the native SDT block identity without exposing private view objects. */
function sourceLocation(window: Window, text: Text, bounds?: DOMRect): ReaderTextSourceLocation {
  if (readerReadingMode(window)) {
    const path = text.parentElement?.closest<HTMLElement>('[data-ref-path]')?.dataset.refPath;
    const top = path?.split('.')[0];
    return {
      pageIndex: null,
      rect: null,
      sourceBlockId: top && /^\d+$/u.test(top) ? `native:${top}` : null,
    };
  }
  const page = text.parentElement?.closest<HTMLElement>('.page[data-page-number]');
  const pageIndex = Number(page?.dataset.pageNumber) - 1;
  const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  const viewport =
    viewer?._pages?.[pageIndex]?.viewport ?? viewer?.getPageView?.(pageIndex)?.viewport;
  if (!page || !Number.isInteger(pageIndex) || pageIndex < 0 || !viewport?.convertToPdfPoint)
    return { pageIndex: null, rect: null, sourceBlockId: null };
  if (!bounds) {
    const range = window.document.createRange();
    range.selectNodeContents(text);
    bounds = range.getBoundingClientRect();
  }
  const box = page.getBoundingClientRect();
  const a = viewport.convertToPdfPoint(bounds.left - box.left, bounds.top - box.top);
  const b = viewport.convertToPdfPoint(bounds.right - box.left, bounds.bottom - box.top);
  if (!a || !b) return { pageIndex, rect: null, sourceBlockId: null };
  const rect = [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
  const rotation = Number.parseFloat(
    text.parentElement?.style?.getPropertyValue('--rotate') ?? '0',
  );
  return {
    pageIndex,
    rect: rect.every(Number.isFinite) ? rect : null,
    sourceBlockId: null,
    vertical: Number.isFinite(rotation) && Math.abs(rotation % 180) === 90,
  };
}

/** Mark the current text layer; only an admitted Neo Select gesture hides nodes from motions. */
export function readerTextNodeAllowed(window: Window, text: Text, bounds?: DOMRect): boolean {
  const admission = admissions.get(window);
  if (!admission?.current()) return true;
  const location = sourceLocation(window, text, bounds);
  const excluded = admission.ready(location) && !admission.accepts(location);
  const element = text.parentElement;
  if (element) {
    if (excluded) {
      if (!admission.marked.has(element))
        admission.marked.set(element, element.getAttribute(ATTRIBUTE));
      element.setAttribute(ATTRIBUTE, admission.id);
    } else if (element.getAttribute(ATTRIBUTE) === admission.id) {
      const previous = admission.marked.get(element);
      if (previous == null) element.removeAttribute(ATTRIBUTE);
      else element.setAttribute(ATTRIBUTE, previous);
      admission.marked.delete(element);
    }
  }
  if (++admission.visits % 128 === 0)
    for (const [element, previous] of admission.marked)
      if (isDeadObject(element) || !element.isConnected) {
        restoreAttribute(element, previous, admission.id);
        admission.marked.delete(element);
      }
  const filter = selectFilters.get(window);
  return !excluded || filter?.invalid === true || filter?.admission !== admission;
}

/** Split at excluded source text: DOM Range itself still contains user-select:none descendants in Gecko. */
export function readerSelectedTextRanges(window: Window, selection: Selection): readonly Range[] {
  const result: Range[] = [];
  const filter = selectFilters.get(window);
  const separatePages = filter && !readerReadingMode(window);
  if (filter && (filter.invalid || !filter.admission.current())) return result;
  for (let i = 0; i < selection.rangeCount; i++) {
    const selected = selection.getRangeAt(i);
    if (!filter) {
      result.push(selected);
      continue;
    }
    if (selected.commonAncestorContainer.nodeType === 3) {
      if (readerTextNodeAllowed(window, selected.commonAncestorContainer as Text))
        result.push(selected);
      continue;
    }
    const walker = window.document.createTreeWalker(selected.commonAncestorContainer, 4);
    let run: Range | null = null;
    let page: Element | null | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (selected.comparePoint(node, 0) > 0) break;
      if (!selected.intersectsNode(node)) continue;
      if (separatePages) {
        const nextPage = (node as Text).parentElement?.closest('.page[data-page-number]');
        if (nextPage !== page) run = null;
        page = nextPage;
      }
      if (!readerTextNodeAllowed(window, node as Text)) {
        run = null;
        continue;
      }
      const start = node === selected.startContainer ? selected.startOffset : 0;
      const end = node === selected.endContainer ? selected.endOffset : (node as Text).length;
      if (end <= start) continue;
      if (!run) {
        run = window.document.createRange();
        run.setStart(node, start);
        result.push(run);
      }
      run.setEnd(node, end);
    }
  }
  return result;
}

/** Preserve text-layer line boundaries without reserializing the unfiltered Gecko Selection. */
export function readerTextRangeText(range: Range): string {
  if (range.startContainer === range.endContainer) return range.toString();
  const document = range.startContainer.ownerDocument;
  if (!document) return range.toString();
  const walker = document.createTreeWalker(range.commonAncestorContainer, 4);
  let previousBlock: Element | null | undefined;
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (range.comparePoint(node, 0) > 0) break;
    if (!range.intersectsNode(node)) continue;
    const text = node as Text;
    const parent = text.parentElement;
    const block = parent?.closest('p,li,td,th,pre,figcaption,h1,h2,h3,h4,h5,h6,.textLayer');
    if (
      parts.length &&
      (block !== previousBlock || parent?.previousElementSibling?.localName === 'br')
    )
      parts.push('\n');
    parts.push(
      text.data.slice(
        text === range.startContainer ? range.startOffset : 0,
        text === range.endContainer ? range.endOffset : text.length,
      ),
    );
    previousBlock = block;
  }
  return parts.join('');
}

export function readerSelectionText(window: Window, selection: Selection): string {
  if (!readerSelectionIsFiltered(window)) return selection.toString();
  return readerSelectedTextRanges(window, selection).map(readerTextRangeText).join(' ');
}
