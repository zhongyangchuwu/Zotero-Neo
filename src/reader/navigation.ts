import { cloneInto } from '../platform/cross-compartment';
import type { FocusDirection } from '../input/actions';
import type { PdfWindow, ReaderRuntime } from './types';
import type { NavigationExecution, NavigationIntent, NavigationOutcome } from '../navigation/types';
import type { ReaderNativeNavigation } from './jump-history-bridge';

/** Confirmation owners keep their cause and pass native work to the Reader execution adapter. */
export type ReaderNavigationCommand = (
  pdfWindow: PdfWindow,
  intent: NavigationIntent,
  perform: (navigation: ReaderNativeNavigation) => unknown,
) => NavigationExecution | null;

export interface ReaderNavigationDependencies {
  readonly reader: ReaderRuntime;
  readonly activePdfWindow: () => PdfWindow;
  readonly setActivePdfWindow: (pdfWindow: PdfWindow) => void;
  readonly syncViews: () => void;
  readonly scrollBoundary: (last: boolean, pdfWindow: PdfWindow) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

function asPdfWindow(window: Window | undefined): PdfWindow | null {
  return (window as PdfWindow | undefined) ?? null;
}

/**
 * Owns navigation-oriented Zotero Reader host seams.
 *
 * Input policy, counts, selection state, smooth-scroll behavior, and annotation mutations remain
 * in ReaderSession. This adapter only delegates history/zoom/page/search/split/focus operations
 * to the current Zotero Reader and resolves the active primary/secondary PDF window.
 */
export class ReaderNavigation {
  readonly #dependencies: ReaderNavigationDependencies;

  constructor(dependencies: ReaderNavigationDependencies) {
    this.#dependencies = dependencies;
  }

  zoom(direction: 'in' | 'out' | 'reset', steps: number): void {
    try {
      const internal = this.#dependencies.reader._internalReader;
      const zoom =
        direction === 'in'
          ? internal?.zoomIn
          : direction === 'out'
            ? internal?.zoomOut
            : internal?.zoomReset;
      if (typeof zoom !== 'function') {
        this.#dependencies.showStatus('Zoom unavailable', 1500);
        return;
      }
      const repeat = direction === 'reset' ? 1 : steps;
      for (let index = 0; index < repeat; index += 1) zoom.call(internal);
    } catch (error) {
      this.#dependencies.debug(`reader zoom ${direction} failed: ${String(error)}`);
      this.#dependencies.showStatus('Zoom unavailable', 1500);
    }
  }

  pageNavigationSupported(pdfWindow?: PdfWindow): boolean {
    const internal = this.#dependencies.reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    const last = internal?._lastView;
    const view = pdfWindow
      ? primary?._iframeWindow === pdfWindow
        ? primary
        : secondary?._iframeWindow === pdfWindow
          ? secondary
          : last?._iframeWindow === pdfWindow
            ? last
            : null
      : (last ?? primary);
    return typeof view?.navigateToNextPage === 'function';
  }

  navigatePage(
    direction: number,
    pdfWindow?: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported(pdfWindow)) {
      this.#dependencies.showStatus('✗ Page navigation not supported here', 1500);
      return;
    }
    const method = direction > 0 ? internal?.navigateToNextPage : internal?.navigateToPreviousPage;
    const step = (): void => {
      for (let index = 0; index < Math.abs(direction); index += 1) method?.call(internal);
    };
    if (navigation) navigation.runNative(step);
    else step();
  }

  /**
   * Resolves a counted page start, the first page, or the document bottom in the active view.
   * An uncounted last-page jump uses one native XYZ destination; count overrides the boundary.
   */
  navigateBoundary(
    count: number,
    last: boolean,
    pdfWindow: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported(pdfWindow)) {
      this.#dependencies.scrollBoundary(last, pdfWindow);
      return;
    }
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (!internal?.navigate || !outerWindow) {
      this.#dependencies.showStatus('✗ Page navigation not supported here', 1500);
      return;
    }
    let pageIndex = count > 0 ? count - 1 : 0;
    let bottom: readonly [number, number] | undefined;
    if (last && count === 0) {
      const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
      const pagesCount = viewer?.pagesCount;
      if (typeof pagesCount !== 'number' || !Number.isInteger(pagesCount) || pagesCount < 1) {
        this.#dependencies.showStatus('✗ Page navigation not supported here', 1500);
        return;
      }
      pageIndex = pagesCount - 1;
      const viewport = (viewer?._pages?.[pageIndex] ?? viewer?.getPageView?.(pageIndex))?.viewport;
      bottom = viewport?.convertToPdfPoint?.(0, viewport.height);
      if (!bottom || !Number.isFinite(bottom[0]) || !Number.isFinite(bottom[1])) {
        this.#dependencies.showStatus('✗ Page navigation not supported here', 1500);
        return;
      }
    }
    const request = cloneInto(
      bottom ? { dest: [pageIndex, { name: 'XYZ' }, bottom[0], bottom[1], null] } : { pageIndex },
      outerWindow,
    );
    if (navigation) {
      navigation.bindRequest(request);
      navigation.navigate(request);
    } else internal.navigate(request);
  }

  openSearch(pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (internal?.toggleFindPopup && outerWindow) {
      internal.toggleFindPopup(cloneInto({ open: true }, outerWindow));
      return;
    }
    const input = outerWindow?.document.querySelector<HTMLInputElement>(
      '.primary-view .find-popup input',
    );
    input?.focus();
    input?.select();
    pdfWindow.focus();
  }

  clearSearch(): void {
    const internal = this.#dependencies.reader._internalReader;
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (internal?.toggleFindPopup && outerWindow) {
      internal.toggleFindPopup(cloneInto({ open: false }, outerWindow));
      return;
    }
    const input = outerWindow?.document.querySelector<HTMLInputElement>('.find-popup input');
    if (input && outerWindow?.document.activeElement === input) input.blur();
  }

  find(
    next: boolean,
    pdfWindow?: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): NavigationOutcome | Promise<NavigationOutcome> | void {
    const internal = this.#dependencies.reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    const view = pdfWindow
      ? primary?._iframeWindow === pdfWindow
        ? primary
        : secondary?._iframeWindow === pdfWindow
          ? secondary
          : null
      : null;
    const active = pdfWindow
      ? view
        ? (view._findState?.active ??
          (view === primary
            ? internal?._state?.primaryViewFindState?.active
            : internal?._state?.secondaryViewFindState?.active))
        : false
      : primary?._findState?.active ||
        secondary?._findState?.active ||
        internal?._state?.primaryViewFindState?.active ||
        internal?._state?.secondaryViewFindState?.active;
    if (!active) {
      this.#dependencies.showStatus('No active search — press / to search', 1500);
      return { kind: 'unchanged' };
    }
    const find = next ? internal?.findNext : internal?.findPrevious;
    if (typeof find !== 'function') return { kind: 'unavailable' };
    const invoke = (): void => find.call(internal);
    if (navigation) {
      navigation.runNative(invoke);
      return navigation.waitForSearch();
    }
    invoke();
  }

  toggleSplit(type: 'horizontal' | 'vertical'): void {
    const internal = this.#dependencies.reader._internalReader;
    if (type === 'horizontal') internal?.toggleHorizontalSplit?.();
    else internal?.toggleVerticalSplit?.();
    this.#dependencies.syncViews();
  }

  canFocusDirection(direction: FocusDirection): boolean {
    if (this.#splitFocusTarget(direction)) return true;
    return (
      direction === 'right' &&
      typeof this.#dependencies.reader._window?.ZoteroContextPane?.focus === 'function'
    );
  }

  focusDirection(direction: FocusDirection): boolean {
    const target = this.#splitFocusTarget(direction);
    if (target) {
      try {
        const internal = this.#dependencies.reader._internalReader;
        if (internal?.focusView) internal.focusView(target.primary);
        else target.window.focus();
        this.#dependencies.setActivePdfWindow(target.window);
        return true;
      } catch (error) {
        this.#dependencies.debug(`reader split focus failed: ${String(error)}`);
        return false;
      }
    }
    if (direction !== 'right') return false;
    const pane = this.#dependencies.reader._window?.ZoteroContextPane;
    const focusContext = pane?.focus;
    if (!focusContext) return false;
    try {
      focusContext.call(pane);
      return true;
    } catch (error) {
      this.#dependencies.debug(`reader context focus failed: ${String(error)}`);
      return false;
    }
  }

  activatePdfWindow(pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    if (secondary) {
      const primary = pdfWindow !== secondary;
      const hostPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
      if (hostPrimary !== undefined && hostPrimary !== primary) internal?.focusView?.(primary);
    }
    this.#dependencies.setActivePdfWindow(pdfWindow);
  }

  activePdfWindow(): PdfWindow {
    const internal = this.#dependencies.reader._internalReader;
    const primary = asPdfWindow(internal?._primaryView?._iframeWindow);
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    const hostPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
    if (secondary && hostPrimary === false) return secondary;
    if (primary && hostPrimary === true) return primary;

    const current = this.#dependencies.activePdfWindow();
    if (current === secondary) return secondary;
    if (current === primary) return primary;

    const focused = Services.focus?.focusedWindow;
    if (focused === secondary) return secondary;
    if (focused === primary) return primary;
    return primary ?? secondary ?? current;
  }

  #splitFocusTarget(
    direction: FocusDirection,
  ): { readonly primary: boolean; readonly window: PdfWindow } | null {
    const internal = this.#dependencies.reader._internalReader;
    const primary = asPdfWindow(internal?._primaryView?._iframeWindow);
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    if (!primary || !secondary || !internal?.splitType) return null;

    const activePrimary = this.#dependencies.activePdfWindow() !== secondary;
    const targetPrimary =
      internal.splitType === 'vertical'
        ? direction === 'left' && !activePrimary
          ? true
          : direction === 'right' && activePrimary
            ? false
            : null
        : direction === 'up' && !activePrimary
          ? true
          : direction === 'down' && activePrimary
            ? false
            : null;
    if (targetPrimary === null) return null;
    return { primary: targetPrimary, window: targetPrimary ? primary : secondary };
  }
}
