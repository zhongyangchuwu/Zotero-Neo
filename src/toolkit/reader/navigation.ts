import { cloneInto, isDeadObject } from '../../platform/cross-compartment';
import type { FocusDirection } from '../../input/actions';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from '../../reader/types';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from './contracts';
import type {
  NativePdfWindow,
  NativeReaderRuntime,
  NativeReaderViewRuntime,
} from './private-types';
import type { ReaderNativeNavigation } from './history-bridge';
import type { NavigationOutcome } from '../../navigation/types';

export type ReaderNavigationUnavailable = 'zoom' | 'page' | 'search';
export interface ReaderNavigationHostDependencies {
  readonly reader: ReaderRuntime;
  readonly activePdfWindow: () => PdfWindow;
  readonly setActivePdfWindow: (window: PdfWindow) => void;
  readonly syncViews: () => void;
  readonly scrollBoundary: (last: boolean, window: PdfWindow) => void;
  readonly unavailable: (reason: ReaderNavigationUnavailable) => void;
  readonly debug: (message: string) => void;
}

export interface ReaderOutlineAccess {
  readonly view: ReaderViewRuntime;
  readonly outline: readonly ReaderNativeOutlineEntry[];
  isCurrent(): boolean;
}

/** Exact-view host delegation; action choice, traversal order and history policy stay in Reader. */
export class ReaderNavigationHost {
  readonly #dependencies: ReaderNavigationHostDependencies;
  readonly #reader: NativeReaderRuntime;
  #outlineLoading: {
    readonly view: NativeReaderViewRuntime;
    readonly promise: Promise<void>;
  } | null = null;

  constructor(dependencies: ReaderNavigationHostDependencies) {
    this.#dependencies = dependencies;
    this.#reader = dependencies.reader as NativeReaderRuntime;
  }

  #view(window: PdfWindow): NativeReaderViewRuntime | null {
    const internal = this.#reader._internalReader;
    return internal?._primaryView?._iframeWindow === window
      ? internal._primaryView
      : internal?._secondaryView?._iframeWindow === window
        ? internal._secondaryView
        : null;
  }

  /** Loads native Outline without opening the Sidebar, then fences both view identities. */
  async prepareOutline(
    window: PdfWindow,
    isCurrent: () => boolean,
  ): Promise<ReaderOutlineAccess | null> {
    const internal = this.#reader._internalReader;
    const view = this.#view(window);
    if (!view?.navigate) return null;
    if (view.initializedPromise) await view.initializedPromise;
    if (!isCurrent() || this.activePdfWindow() !== window) return null;
    const primary = internal?._primaryView;
    if (internal?._state?.outline == null && typeof primary?.setSidebarView === 'function') {
      let loading = this.#outlineLoading;
      if (!loading || loading.view !== primary) {
        loading = { view: primary, promise: Promise.resolve(primary.setSidebarView('outline')) };
        this.#outlineLoading = loading;
      }
      try {
        await loading.promise;
      } finally {
        if (this.#outlineLoading === loading) this.#outlineLoading = null;
      }
    }
    const current = (): boolean =>
      isCurrent() &&
      this.activePdfWindow() === window &&
      this.#reader._internalReader === internal &&
      internal?._primaryView === primary &&
      (view === internal?._primaryView || view === internal?._secondaryView);
    return current()
      ? { view, outline: internal?._state?.outline ?? [], isCurrent: current }
      : null;
  }

  /** Retains unrounded viewport position and native scroll-clamping semantics for traversal. */
  outlinePosition(
    window: PdfWindow,
  ): { readonly pageIndex: number; readonly top: number; readonly tolerance: number } | null {
    const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
    const location = viewer?._location;
    const pageNumber = location?.pageNumber ?? viewer?.currentPageNumber;
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1)
      return null;
    const pageIndex = pageNumber - 1;
    const page = viewer?._pages?.[pageIndex] ?? viewer?.getPageView?.(pageIndex);
    const container = viewer?.container;
    let top: number | undefined;
    if (container && page?.div && page.viewport?.convertToPdfPoint) {
      const containerRect = container.getBoundingClientRect();
      const pageRect = page.div.getBoundingClientRect();
      const point = page.viewport.convertToPdfPoint(
        Math.max(0, containerRect.left + container.clientLeft - pageRect.left),
        Math.max(0, containerRect.top + container.clientTop - pageRect.top),
      );
      if (Number.isFinite(point[1])) top = point[1];
    }
    const scale = page?.viewport?.scale;
    const rounding = scale && Number.isFinite(scale) && scale > 0 ? 1 / scale : 0;
    const tolerance = rounding + (top === undefined ? 0.5 : 0.01);
    top ??= location?.top;
    return top !== undefined && Number.isFinite(top) ? { pageIndex, top, tolerance } : null;
  }

  outlineTargetDistance(
    view: ReaderViewRuntime,
    position: ReaderLinkPosition,
    clonePosition: boolean,
  ): number | null {
    const nativeView = view as NativeReaderViewRuntime;
    const window = nativeView._iframeWindow as NativePdfWindow | undefined;
    const container = window?.PDFViewerApplication?.pdfViewer?.container;
    const outer = this.#reader._iframeWindow;
    if (
      !container ||
      !outer ||
      !nativeView.getPositionBoundingViewRect ||
      !Number.isFinite(container.scrollTop) ||
      !Number.isFinite(container.scrollHeight) ||
      container.clientHeight <= 0
    )
      return null;
    const nativePosition = clonePosition ? cloneInto(position, outer) : position;
    const top = nativeView.getPositionBoundingViewRect(nativePosition)[1];
    if (!Number.isFinite(top)) return null;
    const aligned = Math.max(0, Math.min(top!, container.scrollHeight - container.clientHeight));
    const distance = aligned - container.scrollTop;
    return Math.abs(distance) <= 1 ? 0 : distance;
  }

  navigatePosition(
    view: ReaderViewRuntime,
    location: { readonly position: ReaderLinkPosition },
  ): void | Promise<void> {
    const outer = this.#reader._iframeWindow;
    const nativeView = view as NativeReaderViewRuntime;
    if (!outer || !nativeView.navigate) return;
    return nativeView.navigate(
      cloneInto(location, outer),
      cloneInto({ block: 'start' as const }, outer),
    );
  }

  canNavigate(window: PdfWindow): boolean {
    return typeof this.#view(window)?.navigate === 'function';
  }

  navigateCaption(
    window: PdfWindow,
    location: { readonly position: ReaderLinkPosition },
  ): void | Promise<void> {
    const view = this.#view(window);
    if (!view || this.activePdfWindow() !== window) return;
    return this.navigatePosition(view, location);
  }

  zoom(direction: 'in' | 'out' | 'reset', steps: number): void {
    try {
      const internal = this.#reader._internalReader;
      const zoom =
        direction === 'in'
          ? internal?.zoomIn
          : direction === 'out'
            ? internal?.zoomOut
            : internal?.zoomReset;
      if (typeof zoom !== 'function') {
        this.#dependencies.unavailable('zoom');
        return;
      }
      const repeat = direction === 'reset' ? 1 : steps;
      for (let index = 0; index < repeat; index += 1) zoom.call(internal);
    } catch (error) {
      this.#dependencies.debug(`reader zoom ${direction} failed: ${String(error)}`);
      this.#dependencies.unavailable('zoom');
    }
  }

  pageNavigationSupported(window?: PdfWindow): boolean {
    const internal = this.#reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    const last = internal?._lastView;
    const view = window
      ? primary?._iframeWindow === window
        ? primary
        : secondary?._iframeWindow === window
          ? secondary
          : last?._iframeWindow === window
            ? last
            : null
      : (last ?? primary);
    return typeof view?.navigateToNextPage === 'function';
  }

  navigatePage(direction: number, window?: PdfWindow, navigation?: ReaderNativeNavigation): void {
    const internal = this.#reader._internalReader;
    if (!this.pageNavigationSupported(window)) {
      this.#dependencies.unavailable('page');
      return;
    }
    const method = direction > 0 ? internal?.navigateToNextPage : internal?.navigateToPreviousPage;
    const step = (): void => {
      for (let index = 0; index < Math.abs(direction); index += 1) method?.call(internal);
    };
    if (navigation) navigation.runNative(step);
    else step();
  }

  navigateBoundary(
    count: number,
    last: boolean,
    window: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): void {
    const internal = this.#reader._internalReader;
    if (!this.pageNavigationSupported(window)) {
      this.#dependencies.scrollBoundary(last, window);
      return;
    }
    const outer = this.#reader._iframeWindow;
    if (!internal?.navigate || !outer) {
      this.#dependencies.unavailable('page');
      return;
    }
    let pageIndex = count > 0 ? count - 1 : 0;
    let bottom: readonly [number, number] | undefined;
    if (last && count === 0) {
      const viewer = (window as NativePdfWindow).PDFViewerApplication?.pdfViewer;
      const pages = viewer?.pagesCount;
      if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1) {
        this.#dependencies.unavailable('page');
        return;
      }
      pageIndex = pages - 1;
      const viewport = (viewer?._pages?.[pageIndex] ?? viewer?.getPageView?.(pageIndex))?.viewport;
      bottom = viewport?.convertToPdfPoint?.(0, viewport.height);
      if (!bottom || !Number.isFinite(bottom[0]) || !Number.isFinite(bottom[1])) {
        this.#dependencies.unavailable('page');
        return;
      }
    }
    const request = cloneInto(
      bottom ? { dest: [pageIndex, { name: 'XYZ' }, bottom[0], bottom[1], null] } : { pageIndex },
      outer,
    );
    if (navigation) {
      navigation.bindRequest(request);
      navigation.navigate(request);
    } else internal.navigate(request);
  }

  openSearch(window: PdfWindow): void {
    const internal = this.#reader._internalReader;
    const outer = this.#reader._iframeWindow;
    if (internal?.toggleFindPopup && outer) {
      internal.toggleFindPopup(cloneInto({ open: true }, outer));
      return;
    }
    const input = outer?.document.querySelector<HTMLInputElement>(
      '.primary-view .find-popup input',
    );
    input?.focus();
    input?.select();
    window.focus();
  }

  clearSearch(): void {
    const internal = this.#reader._internalReader;
    const outer = this.#reader._iframeWindow;
    if (internal?.toggleFindPopup && outer) {
      internal.toggleFindPopup(cloneInto({ open: false }, outer));
      return;
    }
    const input = outer?.document.querySelector<HTMLInputElement>('.find-popup input');
    if (input && outer?.document.activeElement === input) input.blur();
  }

  find(
    next: boolean,
    window?: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): NavigationOutcome | Promise<NavigationOutcome> | void {
    const internal = this.#reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    const view = window ? this.#view(window) : null;
    const active = window
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
      this.#dependencies.unavailable('search');
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
    const internal = this.#reader._internalReader;
    if (type === 'horizontal') internal?.toggleHorizontalSplit?.();
    else internal?.toggleVerticalSplit?.();
    this.#dependencies.syncViews();
  }

  canFocusDirection(direction: FocusDirection): boolean {
    return (
      !!this.#splitFocusTarget(direction) ||
      (direction === 'right' &&
        typeof this.#reader._window?.ZoteroContextPane?.focus === 'function')
    );
  }

  focusDirection(direction: FocusDirection): boolean {
    const target = this.#splitFocusTarget(direction);
    if (target) {
      try {
        const internal = this.#reader._internalReader;
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
    const pane = this.#reader._window?.ZoteroContextPane;
    if (!pane?.focus) return false;
    try {
      pane.focus();
      return true;
    } catch (error) {
      this.#dependencies.debug(`reader context focus failed: ${String(error)}`);
      return false;
    }
  }

  activatePdfWindow(window: PdfWindow): void {
    const internal = this.#reader._internalReader;
    const secondary = internal?._secondaryView?._iframeWindow;
    if (secondary) {
      const primary = window !== secondary;
      const hostPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
      if (hostPrimary !== undefined && hostPrimary !== primary) internal?.focusView?.(primary);
    }
    this.#dependencies.setActivePdfWindow(window);
  }

  activePdfWindow(): PdfWindow {
    const internal = this.#reader._internalReader;
    const primary = internal?._primaryView?._iframeWindow;
    const secondary = internal?._secondaryView?._iframeWindow;
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
    const internal = this.#reader._internalReader;
    const primary = internal?._primaryView?._iframeWindow;
    const secondary = internal?._secondaryView?._iframeWindow;
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
    return targetPrimary === null
      ? null
      : { primary: targetPrimary, window: targetPrimary ? primary : secondary };
  }
}

/** Checks host Find focus without exposing its private selector to input policy. */
export function readerFindInputFocused(document: Document): boolean {
  const active = document.activeElement;
  return active?.tagName === 'INPUT' && !!active.closest('.find-popup');
}

/** Opens Find for the captured pane and returns a one-shot write for that native interaction. */
export function prepareReaderSelectionSearch(
  reader: ReaderRuntime,
  window: PdfWindow,
): ((text: string) => boolean) | null {
  const native = reader as NativeReaderRuntime;
  const internal = native._internalReader;
  const outer = native._iframeWindow;
  const primary = internal?._primaryView?._iframeWindow === window;
  const view = primary ? internal?._primaryView : internal?._secondaryView;
  if (!internal?.toggleFindPopup || !outer || view?._iframeWindow !== window) return null;
  const document = outer.document;
  const pdfDocument = window.document;
  const field = primary ? 'primaryViewFindState' : 'secondaryViewFindState';
  internal.toggleFindPopup(cloneInto({ primary, open: true }, outer));
  const expected = internal._state?.[field];
  if (!expected?.popupOpen) return null;
  let pending = true;
  return (text) => {
    if (!pending) return false;
    pending = false;
    if (
      isDeadObject(outer) ||
      isDeadObject(window) ||
      isDeadObject(view) ||
      native._internalReader !== internal ||
      native._iframeWindow !== outer ||
      outer.document !== document ||
      window.document !== pdfDocument ||
      (primary ? internal._primaryView : internal._secondaryView) !== view ||
      internal._state?.[field] !== expected
    )
      return false;
    const input = document.querySelector<HTMLInputElement>(
      `${primary ? '.primary-view' : '.secondary-view'} .find-popup input`,
    );
    if (!input || input.value !== (expected.query ?? '')) return false;
    input.value = text;
    input.dispatchEvent(new outer.Event('input', cloneInto({ bubbles: true }, outer)));
    return true;
  };
}
