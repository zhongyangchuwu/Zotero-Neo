import { cloneInto } from '../platform/cross-compartment';
import type { FocusDirection } from '../input/actions';
import type { PdfWindow, ReaderRuntime } from './types';
import { outlineEntryKind } from './outline-presentation';
import type { ReaderNativeOutlineEntry, ReaderViewRuntime } from './types';
import {
  captionLabel,
  type ReaderCaptionTarget,
  type ReaderCaptionTargets,
} from './caption-targets';
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
  readonly captions: ReaderCaptionTargets;
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
  #outlineLoading: { readonly view: ReaderViewRuntime; readonly promise: Promise<void> } | null =
    null;

  constructor(dependencies: ReaderNavigationDependencies) {
    this.#dependencies = dependencies;
  }

  /** Uses authored, resolved Outline locations and the exact view's native history producer. */
  async traverseOutline(
    category: 'heading' | 'figure' | 'table',
    direction: -1 | 1,
    pdfWindow: PdfWindow,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    const internal = this.#dependencies.reader._internalReader;
    const view =
      internal?._primaryView?._iframeWindow === pdfWindow
        ? internal._primaryView
        : internal?._secondaryView?._iframeWindow === pdfWindow
          ? internal._secondaryView
          : null;
    if (!view?.navigate) {
      this.#dependencies.showStatus('✗ Outline navigation unavailable', 2000);
      return false;
    }
    if (view.initializedPromise) await view.initializedPromise;
    if (!isCurrent() || this.activePdfWindow() !== pdfWindow) return false;
    const primary = internal?._primaryView;
    if (internal?._state?.outline == null && typeof primary?.setSidebarView === 'function') {
      let loading = this.#outlineLoading;
      if (!loading || loading.view !== primary) {
        const promise = Promise.resolve(primary.setSidebarView('outline'));
        loading = { view: primary, promise };
        this.#outlineLoading = loading;
      }
      try {
        await loading.promise;
      } finally {
        if (this.#outlineLoading === loading) this.#outlineLoading = null;
      }
    }
    if (
      !isCurrent() ||
      this.activePdfWindow() !== pdfWindow ||
      this.#dependencies.reader._internalReader !== internal ||
      internal?._primaryView !== primary ||
      (view !== internal?._primaryView && view !== internal?._secondaryView)
    )
      return false;
    // Load native semantic anchors only on an explicit structural navigation request.
    const captions = await this.#dependencies.captions.load();
    if (
      !isCurrent() ||
      this.activePdfWindow() !== pdfWindow ||
      this.#dependencies.reader._internalReader !== internal ||
      internal?._primaryView !== primary ||
      (view !== internal?._primaryView && view !== internal?._secondaryView)
    )
      return false;
    const entries: {
      entry: ReaderNativeOutlineEntry;
      page: number;
      top: number;
      order: number;
      clonePosition: boolean;
    }[] = [];
    let order = 0;
    const visit = (
      outline: readonly ReaderNativeOutlineEntry[],
      depth: number,
      clonePosition = false,
    ): void => {
      for (const entry of outline) {
        const currentOrder = order++;
        const kind = outlineEntryKind(entry.title, depth);
        const heading = kind === 'section' || kind === 'subsection';
        // Some authored bookmarks precede their printed heading by a page. Keep their
        // hierarchy and identity, but land at the genuine semantic heading when available.
        const headingPosition =
          category === 'heading' && heading
            ? this.#dependencies.captions.headingPosition(entry)
            : null;
        const position = headingPosition ?? entry.location?.position;
        if (
          position &&
          Number.isInteger(position.pageIndex) &&
          position.pageIndex >= 0 &&
          Array.isArray(position.rects) &&
          (kind === category ||
            (category === 'heading' && (kind === 'section' || kind === 'subsection')))
        ) {
          let top = -Infinity;
          for (const rect of position.rects) {
            if (!Array.isArray(rect) || rect.length < 4 || !rect.every(Number.isFinite)) {
              top = -Infinity;
              break;
            }
            top = Math.max(top, rect[1], rect[3]);
          }
          if (Number.isFinite(top))
            entries.push({
              entry: headingPosition
                ? { ...entry, location: { position: headingPosition } }
                : entry,
              page: position.pageIndex,
              top,
              order: currentOrder,
              clonePosition: clonePosition || headingPosition !== null,
            });
        }
        if (entry.items) visit(entry.items, depth + 1, clonePosition);
      }
    };
    visit(internal?._state?.outline ?? [], 0);
    if (category !== 'heading') {
      const seen = new Map(
        entries.map((entry) => [`${entry.page}:${captionLabel(entry.entry.title)}`, entry]),
      );
      for (const caption of captions) {
        if (caption.kind !== category) continue;
        const key = `${caption.location.position.pageIndex}:${caption.label}`;
        const existing = seen.get(key);
        if (existing) {
          // A genuine Figure projection may start at its image, above the authored bookmark.
          // Keep the native identity/order unless the supplied region starts earlier.
          if (category === 'figure') {
            let top = -Infinity;
            for (const rect of caption.location.position.rects) {
              if (!Array.isArray(rect) || rect.length < 4 || !rect.every(Number.isFinite)) {
                top = -Infinity;
                break;
              }
              top = Math.max(top, rect[1], rect[3]);
            }
            if (Number.isFinite(top) && top > existing.top) {
              existing.entry = caption;
              existing.top = top;
              existing.clonePosition = true;
            }
          }
          continue;
        }
        visit([caption], 0, true);
        const added = entries[entries.length - 1];
        if (added && added.entry === caption) seen.set(key, added);
      }
    }
    if (!entries.length) {
      this.#dependencies.showStatus(
        `✗ no ${category === 'heading' ? 'headings in Outline' : category === 'figure' ? 'recognized figures' : 'recognized tables'}`,
        2000,
      );
      return false;
    }
    entries.sort((a, b) => a.page - b.page || b.top - a.top || a.order - b.order);
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (!outerWindow) return false;
    const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
    const location = viewer?._location;
    const pageNumber = location?.pageNumber ?? viewer?.currentPageNumber;
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1) {
      this.#dependencies.showStatus('✗ PDF position unavailable', 2000);
      return false;
    }
    const page = pageNumber - 1;
    const pageView = viewer?._pages?.[page] ?? viewer?.getPageView?.(page);
    const container = viewer?.container;
    const pageElement = pageView?.div;
    let top: number | undefined;
    // Prefer unrounded live viewport geometry; PDF.js rounds _location.top to whole PDF units.
    if (container && pageElement && pageView?.viewport?.convertToPdfPoint) {
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();
      const point = pageView.viewport.convertToPdfPoint(
        Math.max(0, containerRect.left + container.clientLeft - pageRect.left),
        Math.max(0, containerRect.top + container.clientTop - pageRect.top),
      );
      if (Number.isFinite(point[1])) top = point[1];
    }
    const scale = pageView?.viewport?.scale;
    const scrollRounding = scale && Number.isFinite(scale) && scale > 0 ? 1 / scale : 0;
    // Native scroll offsets can round by a CSS pixel, in addition to _location's PDF-unit rounding.
    const tolerance = scrollRounding + (top === undefined ? 0.5 : 0.01);
    top ??= location?.top;
    if (top === undefined || !Number.isFinite(top)) {
      this.#dependencies.showStatus('✗ PDF position unavailable', 2000);
      return false;
    }
    const currentTop = top;
    const relative = (entry: (typeof entries)[number]): number => {
      const position = entry.entry.location?.position;
      if (
        container &&
        position &&
        view.getPositionBoundingViewRect &&
        Number.isFinite(container.scrollTop) &&
        Number.isFinite(container.scrollHeight) &&
        container.clientHeight > 0
      ) {
        // Native Outline positions already belong to Reader; SDT projections belong to chrome.
        const nativePosition = entry.clonePosition ? cloneInto(position, outerWindow) : position;
        const targetTop = view.getPositionBoundingViewRect(nativePosition)[1];
        if (Number.isFinite(targetTop)) {
          // Mirror native block:start clamping: unreachable last-page tops must not trap traversal.
          const alignedTop = Math.max(
            0,
            Math.min(targetTop, container.scrollHeight - container.clientHeight),
          );
          const distance = alignedTop - container.scrollTop;
          return Math.abs(distance) <= 1 ? 0 : distance;
        }
      }
      if (entry.page !== page) return entry.page - page;
      const distance = currentTop - entry.top;
      return Math.abs(distance) <= tolerance ? 0 : distance;
    };
    let target = direction > 0 ? entries[0] : entries[entries.length - 1];
    if (direction > 0) target = entries.find((entry) => relative(entry) > 0) ?? target;
    else {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (relative(entries[index]) < 0) {
          target = entries[index];
          break;
        }
      }
    }
    if (!target?.entry.location || !isCurrent() || this.activePdfWindow() !== pdfWindow)
      return false;
    await view.navigate(
      cloneInto(target.entry.location, outerWindow),
      cloneInto({ block: 'start' as const }, outerWindow),
    );
    return isCurrent();
  }

  /** A caption choice uses the exact active view's native position/history producer. */
  async navigateCaption(target: ReaderCaptionTarget, pdfWindow: PdfWindow): Promise<void> {
    const internal = this.#dependencies.reader._internalReader;
    const view =
      internal?._primaryView?._iframeWindow === pdfWindow
        ? internal._primaryView
        : internal?._secondaryView?._iframeWindow === pdfWindow
          ? internal._secondaryView
          : null;
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (!view?.navigate || !outerWindow || this.activePdfWindow() !== pdfWindow) return;
    await view.navigate(
      cloneInto(target.location, outerWindow),
      cloneInto({ block: 'start' as const }, outerWindow),
    );
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
