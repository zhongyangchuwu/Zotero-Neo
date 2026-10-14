import { cloneInto, isDeadObject } from '../../platform/cross-compartment';
import { asElement } from '../../platform/dom';
import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime } from './private-types';
import { readerWindow } from './host';
import type { ReaderNativeNavigation } from './history-bridge';

export function selectedAnnotationIDs(reader: ReaderRuntime): readonly string[] {
  return (reader as NativeReaderRuntime)._internalReader?._state?.selectedAnnotationIDs ?? [];
}

export function setSelectedAnnotationIDs(reader: ReaderRuntime, keys: readonly string[]): void {
  const window = readerWindow(reader);
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (window && internal?.setSelectedAnnotations)
    internal.setSelectedAnnotations(cloneInto(keys, window));
}

export function clearAnnotationSelection(reader: ReaderRuntime): void {
  setSelectedAnnotationIDs(reader, []);
}

export function setAnnotationColorFilter(reader: ReaderRuntime, colors: readonly string[]): void {
  const window = readerWindow(reader);
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (window && internal?.setFilter) internal.setFilter(cloneInto({ colors }, window));
}

export function navigateToAnnotation(
  reader: ReaderRuntime,
  key: string,
  fallbackWindow: Window,
): void | Promise<void> {
  return (reader as NativeReaderRuntime)._internalReader?.navigate?.(
    cloneInto({ annotationID: key }, readerWindow(reader) ?? fallbackWindow),
  );
}

/** Reports native selection settlement, or routes its navigation through the admitted owner. */
export function selectReaderAnnotation(
  reader: ReaderRuntime,
  key: string,
  navigation?: ReaderNativeNavigation,
): unknown {
  const window = readerWindow(reader);
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (!window || !internal) return { kind: 'unavailable' };
  if (internal.setSelectedAnnotations) {
    const before = internal._state?.selectedAnnotationIDs ?? [];
    internal.setSelectedAnnotations(cloneInto([key], window));
    const selected = internal._state?.selectedAnnotationIDs;
    if (!selected || (before.length === 1 && before[0] === key)) return { kind: 'unchanged' };
    return selected.length === 1 && selected[0] === key
      ? { kind: 'completed', evidence: 'settled-change' }
      : { kind: 'unchanged' };
  }
  if (!internal.navigate) return { kind: 'unavailable' };
  const request = cloneInto({ annotationID: key }, window);
  if (navigation) {
    navigation.bindRequest(request);
    return navigation.navigate(request);
  }
  return internal.navigate(request);
}

/** Retains the exact native owner, even if the Reader replaces it before release. */
export function protectAnnotationCommentDeletion(reader: ReaderRuntime): (() => void) | null {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (!internal) return null;
  const previous = internal._enableAnnotationDeletionFromComment;
  internal._enableAnnotationDeletionFromComment = false;
  return () => {
    if (!isDeadObject(internal)) internal._enableAnnotationDeletionFromComment = previous;
  };
}

/** Dismisses only newly mounted native annotation popups while Neo owns comment input. */
export function guardAnnotationCommentPopups(
  reader: ReaderRuntime,
  isCurrent: () => boolean,
): MutationObserver | null {
  const window = readerWindow(reader) as (Window & typeof globalThis) | undefined;
  const root = window?.document.body;
  if (!window || !root || typeof window.MutationObserver !== 'function') return null;
  const guard = new window.MutationObserver((mutations) => {
    if (!isCurrent()) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const element = asElement(node);
        if (!element) continue;
        const popup = element.matches('.annotation-popup')
          ? element
          : element.querySelector('.annotation-popup');
        const input = popup?.querySelector<HTMLElement>('[contenteditable="true"],textarea,input');
        input?.dispatchEvent(
          new window.KeyboardEvent(
            'keydown',
            cloneInto(
              {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true,
              },
              window,
            ),
          ),
        );
      }
    }
  });
  guard.observe(root, cloneInto({ childList: true, subtree: true }, window));
  return guard;
}
