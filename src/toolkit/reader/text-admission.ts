import { isDeadObject } from '../../platform/cross-compartment';
import { CleanupFailure } from '../../core/cleanup';
import { readerReadingMode } from './presentation';
import type { NativePdfWindow } from './private-types';

export interface ReaderTextSourceLocation {
  readonly pageIndex: number | null;
  readonly rect: readonly number[] | null;
  readonly sourceBlockId: string | null;
}

interface Admission {
  readonly id: string;
  readonly document: Document;
  readonly accepts: (location: ReaderTextSourceLocation) => boolean;
  readonly current: () => boolean;
  readonly marked: Map<HTMLElement, string | null>;
  readonly dispose: () => void;
  visits: number;
}
const admissions = new WeakMap<Window, Admission>();
const ATTRIBUTE = 'data-zv-text-excluded';
let nextAdmission = 0;

function restoreAttribute(element: HTMLElement, previous: string | null, id: string): void {
  if (isDeadObject(element) || element.getAttribute(ATTRIBUTE) !== id) return;
  if (previous === null) element.removeAttribute(ATTRIBUTE);
  else element.setAttribute(ATTRIBUTE, previous);
}

/** Lease a feature-owned source policy to one exact view; native mouse selection is never patched. */
export function leaseReaderTextAdmission(
  window: Window,
  accepts: Admission['accepts'],
  current: () => boolean,
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
    marked,
    visits: 0,
    current: () => !disposed && current() && !isDeadObject(window) && window.document === document,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (admissions.get(window) === admission) admissions.delete(window);
      const failure = new CleanupFailure();
      for (const [element, previous] of marked)
        failure.run(() => restoreAttribute(element, previous, id));
      marked.clear();
      failure.rethrow();
    },
  };
  admissions.set(window, admission);
  return admission.dispose;
}

export function readerTextAdmissionActive(window: Window): boolean {
  return admissions.get(window)?.current() === true;
}

/** Geometry filtering belongs only to a Neo-owned Select interaction, never native Normal-mode selection. */
export function readerSelectionIsFiltered(window: Window): boolean {
  return (
    readerTextAdmissionActive(window) &&
    window.document.documentElement.hasAttribute('data-zv-select-active')
  );
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
  return { pageIndex, rect: rect.every(Number.isFinite) ? rect : null, sourceBlockId: null };
}

/** Unknown geometry remains selectable; only the feature's explicit, current policy excludes text. */
export function readerTextNodeAllowed(window: Window, text: Text, bounds?: DOMRect): boolean {
  const admission = admissions.get(window);
  if (!admission?.current()) return true;
  const accepted = admission.accepts(sourceLocation(window, text, bounds));
  const element = text.parentElement;
  if (element) {
    if (!accepted) {
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
  return accepted;
}

/** Split at excluded source text: DOM Range itself still contains user-select:none descendants in Gecko. */
export function readerSelectedTextRanges(window: Window, selection: Selection): readonly Range[] {
  const result: Range[] = [];
  for (let i = 0; i < selection.rangeCount; i++) {
    const selected = selection.getRangeAt(i);
    if (!readerSelectionIsFiltered(window)) {
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
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (selected.comparePoint(node, 0) > 0) break;
      if (!selected.intersectsNode(node)) continue;
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

/** Preserve Gecko's layout-aware spaces and line breaks; Range.toString() omits PDF text-layer BRs. */
export function readerSelectionText(window: Window, selection: Selection): string {
  // Refresh admission marks before Gecko serializes the user-select:none scope.
  if (readerSelectionIsFiltered(window)) readerSelectedTextRanges(window, selection);
  return selection.toString();
}
