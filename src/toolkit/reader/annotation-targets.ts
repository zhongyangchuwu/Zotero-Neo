import { cloneInto } from '../../platform/cross-compartment';
import { readerWindow } from './host';
import { visibleElement, visibleWindow } from './visibility';
import { readerPresentationView, readerReadingMode } from './presentation';
import type { ReaderRuntime, ReaderViewRuntime } from './contracts';
import type {
  NativeReaderAnnotationRuntime,
  NativeReaderRuntime,
  NativeReaderViewRuntime,
  NativePdfWindow,
} from './private-types';

export interface ReaderVisibleAnnotation {
  readonly key: string;
  readonly text: string;
  readonly comment: string;
  /** First visible anchor fragment, in this view's client coordinates. */
  readonly rect: readonly number[];
  readonly currentRect: () => readonly number[] | null;
}

function validRect(rect: readonly number[]): boolean {
  return (
    rect.length === 4 && rect.every(Number.isFinite) && rect[2]! > rect[0]! && rect[3]! > rect[1]!
  );
}

function intersect(left: readonly number[], right: readonly number[]): readonly number[] | null {
  const rect = [
    Math.max(left[0]!, right[0]!),
    Math.max(left[1]!, right[1]!),
    Math.min(left[2]!, right[2]!),
    Math.min(left[3]!, right[3]!),
  ];
  return validRect(rect) ? rect : null;
}

function elementRect(element: Element): readonly number[] | null {
  const bounds = element.getBoundingClientRect();
  const rect = [bounds.left, bounds.top, bounds.right, bounds.bottom];
  return validRect(rect) ? rect : null;
}

function supportedPosition(annotation: NativeReaderAnnotationRuntime): boolean {
  if (!['highlight', 'underline', 'note', 'image', 'text'].includes(annotation.type ?? ''))
    return false;
  const position = annotation.position;
  if (
    !position ||
    !Number.isInteger(position.pageIndex) ||
    position.pageIndex! < 0 ||
    !Array.isArray(position.rects) ||
    !position.rects.length ||
    !position.rects.every(validRect) ||
    (position.nextPageRects !== undefined &&
      (!Array.isArray(position.nextPageRects) ||
        !position.nextPageRects.length ||
        !position.nextPageRects.every(validRect)))
  )
    return false;
  // Native free-text rotation requires a rotated polygon, not its unrotated rect.
  return annotation.type !== 'text' || !position.rotation;
}

function firstVisibleRect(
  view: NativeReaderViewRuntime,
  window: Window,
  ownerWindow: Window,
  annotation: NativeReaderAnnotationRuntime,
): readonly number[] | null {
  if (readerReadingMode(window)) {
    if (
      !visibleWindow(window) ||
      !supportedPosition(annotation) ||
      !['highlight', 'underline', 'note'].includes(annotation.type ?? '')
    )
      return null;
    const range = view.toDisplayedRange?.(cloneInto(annotation.position!, ownerWindow));
    if (!range) return null;
    const viewport = [0, 0, window.innerWidth, window.innerHeight];
    for (const rect of Array.from(range.getClientRects() ?? [])) {
      const visible = intersect([rect.left, rect.top, rect.right, rect.bottom], viewport);
      if (visible) return visible;
    }
    return null;
  }
  if (
    !supportedPosition(annotation) ||
    !visibleWindow(window) ||
    typeof view.getClientRectForPopup !== 'function'
  )
    return null;
  const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
  const container = viewer?.container;
  if (!container || !visibleElement(window, container)) return null;
  const containerRect = elementRect(container);
  const viewport = [
    0,
    0,
    window.innerWidth || window.document.documentElement.clientWidth,
    window.innerHeight || window.document.documentElement.clientHeight,
  ];
  const visible = containerRect && intersect(containerRect, viewport);
  if (!visible) return null;
  const position = annotation.position!;
  for (let offset = 0; offset < 2; offset += 1) {
    const rects = offset ? position.nextPageRects : position.rects;
    if (!rects) continue;
    const pageIndex = position.pageIndex! + offset;
    const page = viewer?._pages?.[pageIndex] ?? viewer?.getPageView?.(pageIndex);
    // Zotero 10's rendered-page wrappers expose private indexes, not PDF.js identity.
    if (!page || !view._pages?.some((rendered) => rendered._pageIndex === pageIndex)) continue;
    const div = page.div;
    if (!div || !visibleElement(window, div)) continue;
    const bounds = elementRect(div);
    const clip = bounds && intersect(visible, bounds);
    if (!clip) continue;
    for (const rect of rects) {
      // Keep conversion inside the native realm: viewport methods may be opaque to Chrome.
      // Convert one fragment at a time; a union can cross the viewport with nothing visible.
      const client = view.getClientRectForPopup(
        cloneInto({ pageIndex, rects: [[...rect]] }, ownerWindow),
      );
      if (!Array.isArray(client) || !validRect(client)) continue;
      const fragment = intersect(client, clip);
      if (fragment) return fragment;
    }
  }
  return null;
}

/**
 * Snapshots native saved/current annotation fields, never popup/editor drafts or item inventory.
 * Reading this API does not select/edit annotations, navigate, or load pages.
 * Unsupported geometry (including ink and rotated free text) is deliberately omitted.
 */
export function readerVisibleAnnotations(
  readerHandle: ReaderRuntime,
  viewHandle: ReaderViewRuntime,
  window: Window,
): readonly ReaderVisibleAnnotation[] {
  const reader = readerHandle as NativeReaderRuntime;
  const view = viewHandle as NativeReaderViewRuntime;
  try {
    const internal = reader._internalReader;
    const ownerWindow = readerWindow(readerHandle);
    if (!internal || !ownerWindow) return [];
    const primary = readerPresentationView(reader, true) === view;
    if (!primary && readerPresentationView(reader, false) !== view) return [];
    const state = internal._state;
    if (!state || !Array.isArray(state.annotations) || !Array.isArray(view._annotations)) return [];
    const filter = state.filter;
    const filterSnapshot = JSON.stringify(filter);
    const ownsView = () => {
      const current = internal._state;
      return (
        reader._isTabClosed !== true &&
        reader._internalReader === internal &&
        readerWindow(readerHandle) === ownerWindow &&
        readerPresentationView(reader, primary) === view &&
        view._iframeWindow === window &&
        current?.showAnnotations !== false &&
        current?.filter === filter &&
        JSON.stringify(current?.filter) === filterSnapshot
      );
    };
    if (!ownsView()) return [];
    // Native Reader filters the array, not its objects, before PDFView.setAnnotations.
    // Identity membership fences replacements/deletions without reading item inventory.
    const targets: ReaderVisibleAnnotation[] = [];
    const members = new Set(state.annotations);
    for (const annotation of view._annotations) {
      try {
        if (
          typeof annotation.id !== 'string' ||
          !annotation.id ||
          annotation._hidden ||
          !members.has(annotation) ||
          (annotation.text !== undefined && typeof annotation.text !== 'string') ||
          (annotation.comment !== undefined && typeof annotation.comment !== 'string')
        )
          continue;
        const rect = firstVisibleRect(view, window, ownerWindow, annotation);
        if (!rect) continue;
        const key = annotation.id;
        const text = annotation.text;
        const comment = annotation.comment;
        const type = annotation.type;
        const position = JSON.stringify(annotation.position);
        const currentRect = (): readonly number[] | null => {
          try {
            if (
              !ownsView() ||
              annotation._hidden ||
              !view._annotations?.includes(annotation) ||
              !internal._state?.annotations?.includes(annotation) ||
              annotation.id !== key ||
              annotation.type !== type ||
              annotation.text !== text ||
              annotation.comment !== comment ||
              JSON.stringify(annotation.position) !== position
            )
              return null;
            return firstVisibleRect(view, window, ownerWindow, annotation);
          } catch {
            // A detached/dead host wrapper or unsupported native geometry is not a target.
            return null;
          }
        };
        targets.push({ key, text: text ?? '', comment: comment ?? '', rect, currentRect });
      } catch {
        // One malformed annotation must not hide other native visible anchors.
      }
    }
    return targets;
  } catch {
    return [];
  }
}
