import { cloneInto } from '../platform/cross-compartment';
import type { FocusDirection } from '../input/actions';
import type { PdfWindow, ReaderRuntime } from './types';

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

  navigateHistory(direction: 'back' | 'forward'): void {
    try {
      const internal = this.#dependencies.reader._internalReader;
      const navigate = direction === 'back' ? internal?.navigateBack : internal?.navigateForward;
      if (typeof navigate !== 'function') {
        this.#dependencies.showStatus('History unavailable', 1500);
        return;
      }
      navigate.call(internal);
    } catch (error) {
      this.#dependencies.debug(`reader history ${direction} failed: ${String(error)}`);
      this.#dependencies.showStatus('History unavailable', 1500);
    }
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

  pageNavigationSupported(): boolean {
    const internal = this.#dependencies.reader._internalReader;
    return typeof (internal?._lastView ?? internal?._primaryView)?.navigateToNextPage === 'function';
  }

  navigatePage(direction: number): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported()) {
      this.#dependencies.showStatus('✗ Page navigation not supported here', 1500);
      return;
    }
    const method = direction > 0 ? internal?.navigateToNextPage : internal?.navigateToPreviousPage;
    for (let index = 0; index < Math.abs(direction); index += 1) method?.call(internal);
  }

  navigateBoundary(count: number, last: boolean, pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported()) {
      this.#dependencies.scrollBoundary(last, pdfWindow);
      return;
    }
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (count > 0 && internal?.navigate && outerWindow) {
      internal.navigate(cloneInto({ pageIndex: count - 1 }, outerWindow));
    } else if (last) internal?.navigateToLastPage?.();
    else internal?.navigateToFirstPage?.();
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

  find(next: boolean): void {
    const internal = this.#dependencies.reader._internalReader;
    const active =
      internal?._primaryView?._findState?.active ||
      internal?._secondaryView?._findState?.active ||
      internal?._state?.primaryViewFindState?.active ||
      internal?._state?.secondaryViewFindState?.active;
    if (!active) {
      this.#dependencies.showStatus('No active search — press / to search', 1500);
      return;
    }
    if (next) internal?.findNext?.();
    else internal?.findPrevious?.();
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
