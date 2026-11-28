import { cloneInto, isDeadObject } from '../../platform/cross-compartment';
import type { ReaderRuntime } from './contracts';
import type { NativeReaderAnnotationRuntime, NativeReaderRuntime } from './private-types';
import { readerIsClosed, readerWindow } from './host';
import type { ReaderNativeNavigation } from './history-bridge';
import { readerPresentationView } from './presentation';
import { visibleElement } from './visibility';

export function selectedAnnotationIDs(reader: ReaderRuntime): readonly string[] {
  return (reader as NativeReaderRuntime)._internalReader?._state?.selectedAnnotationIDs ?? [];
}

/** Returns the native catalog, or null before the host has published it. */
export function readerLoadedAnnotationIDs(reader: ReaderRuntime): ReadonlySet<string> | null {
  const annotations = (reader as NativeReaderRuntime)._internalReader?._state?.annotations;
  if (!annotations) return null;
  const ids = new Set<string>();
  for (const annotation of annotations) {
    if (annotation.id) ids.add(annotation.id);
  }
  return ids;
}

/** Captures Zotero's document and per-annotation write restrictions for the admitted action. */
export function readerAnnotationWriteGuard(reader: ReaderRuntime): (key: string) => boolean {
  const state = (reader as NativeReaderRuntime)._internalReader?._state;
  if (state?.readOnly) return () => false;
  const readOnly = new Set<string>();
  for (const annotation of state?.annotations ?? []) {
    if (annotation.id && annotation.readOnly) readOnly.add(annotation.id);
  }
  return (key) => !readOnly.has(key);
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

type CommentFocusAttempt = HTMLElement | 'pending' | 'readOnly' | 'unavailable' | 'cancelled';

/** The pinned Reader renders both sidebar and split popups in its outer UI document. */
export function readerAnnotationCommentFocus(
  reader: ReaderRuntime,
  pdfWindow: Window,
  key: string,
): (() => CommentFocusAttempt) | null {
  const window = readerWindow(reader);
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (!window || !internal || isDeadObject(window) || !/^[a-z0-9_-]+$/i.test(key)) return null;
  const document = window.document;
  const primary = readerPresentationView(reader, true)?._iframeWindow === pdfWindow;
  const view = readerPresentationView(reader, primary);
  if (!view || view._iframeWindow !== pdfWindow) return null;
  let selected = internal._state?.selectedAnnotationIDs;
  let catalog: readonly NativeReaderAnnotationRuntime[] | undefined;
  let annotation: NativeReaderAnnotationRuntime | undefined;
  return (): CommentFocusAttempt => {
    if (
      readerIsClosed(reader) ||
      readerWindow(reader) !== window ||
      isDeadObject(window) ||
      isDeadObject(document) ||
      window.document !== document ||
      (reader as NativeReaderRuntime)._internalReader !== internal ||
      isDeadObject(internal) ||
      isDeadObject(view) ||
      readerPresentationView(reader, primary) !== view ||
      view._iframeWindow !== pdfWindow
    )
      return 'cancelled';
    const state = internal._state;
    if (state?.selectedAnnotationIDs !== selected) return 'cancelled';
    if (state?.readOnly) return 'readOnly';
    // AnnotationManager publishes fresh arrays; don't rescan while waiting on React.
    if (state?.annotations !== catalog) {
      catalog = state?.annotations;
      annotation = undefined;
      for (const candidate of catalog ?? []) {
        if (candidate.id !== key) continue;
        annotation = candidate;
        break;
      }
    }
    // Newly saved annotations reach the Reader through Zotero's item notification.
    if (!annotation) return 'pending';
    if (annotation.readOnly) return 'readOnly';
    if (annotation._hidden || annotation.type === 'ink') return 'unavailable';

    const sidebarOpen = state?.sidebarOpen === true && state.sidebarView === 'annotations';
    if (annotation.type === 'text' && !sidebarOpen) {
      // Native text annotations expose their separate comment only in the sidebar.
      if (!internal.setSidebarView || !internal.toggleSidebar) return 'unavailable';
      internal.setSidebarView('annotations');
      internal.toggleSidebar(true);
      return 'pending';
    }
    if (selected?.length !== 1 || selected[0] !== key) {
      if (!internal.setSelectedAnnotations) return 'unavailable';
      // Omit triggeredFromView so Zotero doesn't schedule an unscoped autofocus.
      // Selection updates the native annotation card and closes any prior popup.
      internal.setSelectedAnnotations(cloneInto([key], window));
      selected = internal._state?.selectedAnnotationIDs;
      if (selected?.length !== 1 || selected[0] !== key) return 'unavailable';
      return 'pending';
    }
    const popup = primary ? state?.primaryViewAnnotationPopup : state?.secondaryViewAnnotationPopup;
    if (!sidebarOpen && popup?.annotation.id !== key) {
      // This is the same native popup opener used by Zotero's PDF/DOM Enter handling.
      if (!view._openAnnotationPopup) return 'unavailable';
      view._openAnnotationPopup();
      return 'pending';
    }
    const container = sidebarOpen
      ? `#annotations [data-sidebar-annotation-id="${key}"]`
      : `.${primary ? 'primary' : 'secondary'}-view .annotation-popup`;
    const input = document.querySelector<HTMLElement>(
      `${container} .comment .content[id="${key}"][role="textbox"][contenteditable="true"]:not([aria-readonly="true" i])`,
    );
    // Connected but hidden React trees are not ready; only settle once focus can land.
    return input && visibleElement(window, input) ? input : 'pending';
  };
}
