import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderNavigation } from '../../src/reader/navigation';
import type {
  PdfWindow,
  ReaderRuntime,
  ReaderViewRuntime,
  ReaderNativeOutlineEntry,
  ReaderLinkPosition,
} from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
const originalServices = Reflect.get(globalThis, 'Services');
const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function pdfWindow(): PdfWindow {
  return {
    document: {
      querySelector: () => null,
    },
    focus: vi.fn(),
  } as unknown as PdfWindow;
}

function harness() {
  const cloneInto = vi.fn(<T>(value: T) => value);
  Reflect.set(globalThis, 'Components', { utils: { cloneInto } });
  const primary = pdfWindow();
  const secondary = pdfWindow();
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: primary } });

  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const zoomReset = vi.fn();
  const navigateToPreviousPage = vi.fn();
  const navigateToNextPage = vi.fn();
  const navigate = vi.fn();
  const toggleFindPopup = vi.fn();
  const findNext = vi.fn();
  const findPrevious = vi.fn();
  const toggleHorizontalSplit = vi.fn();
  const toggleVerticalSplit = vi.fn();
  const focusView = vi.fn();
  const focusContext = vi.fn();
  const primaryView = {
    _iframeWindow: primary,
    navigateToNextPage: vi.fn(),
    _findState: { active: true },
  } as ReaderViewRuntime;
  const secondaryView = { _iframeWindow: secondary } as ReaderViewRuntime;
  const outerDocument = {
    querySelector: () => null,
    activeElement: null,
  } as unknown as Document;
  const reader = {
    _iframeWindow: { document: outerDocument } as Window,
    _window: { ZoteroContextPane: { focus: focusContext } },
    _internalReader: {
      _primaryView: primaryView,
      _secondaryView: secondaryView,
      _lastView: primaryView,
      splitType: 'vertical',
      zoomIn,
      zoomOut,
      zoomReset,
      navigateToPreviousPage,
      navigateToNextPage,
      navigate,
      toggleFindPopup,
      findNext,
      findPrevious,
      toggleHorizontalSplit,
      toggleVerticalSplit,
      focusView,
    },
  } as unknown as ReaderRuntime;
  let active = primary;
  const syncViews = vi.fn();
  const scrollBoundary = vi.fn();
  const showStatus = vi.fn();
  const debug = vi.fn();
  const navigation = new ReaderNavigation({
    reader,
    activePdfWindow: () => active,
    setActivePdfWindow: (pdfWindow) => {
      active = pdfWindow;
    },
    syncViews,
    scrollBoundary,
    showStatus,
    debug,
  });

  return {
    cloneInto,
    navigation,
    reader,
    primary,
    secondary,
    syncViews,
    scrollBoundary,
    showStatus,
    debug,
    zoomIn,
    zoomOut,
    zoomReset,
    navigateToPreviousPage,
    navigateToNextPage,
    navigate,
    toggleFindPopup,
    findNext,
    findPrevious,
    toggleHorizontalSplit,
    toggleVerticalSplit,
    focusView,
    focusContext,
    active: () => active,
  };
}

describe('ReaderNavigation', () => {
  it.each([
    { name: 'primary', secondary: false, pages: 37 },
    { name: 'secondary', secondary: true, pages: 11 },
  ])(
    'preserves counted page targets and reaches the document bottom in the $name view',
    ({ secondary, pages }) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      const active = secondary ? test.secondary : test.primary;
      const view = (secondary ? internal._secondaryView : internal._primaryView)!;
      const pageHeight = 1000;
      const container = { scrollTop: 0, scrollHeight: pages * pageHeight, clientHeight: 600 };
      const viewport = {
        scale: 1,
        height: pageHeight,
        convertToPdfPoint: (x: number, y: number): readonly [number, number] =>
          secondary ? [y, x] : [x, pageHeight - y],
      };
      const viewer = {
        pagesCount: pages,
        container,
        currentPageNumber: 1,
        getPageView: () => ({ viewport }),
      };
      Reflect.set(active, 'PDFViewerApplication', { pdfViewer: viewer });
      Reflect.set(internal, '_lastView', view);
      Reflect.set(view, 'navigateToNextPage', () => {});
      Reflect.set(
        internal,
        'navigate',
        (location: {
          pageIndex?: number;
          dest?: readonly [number, { name: string }, number, number, null];
        }) => {
          const pageIndex = location.dest?.[0] ?? location.pageIndex!;
          const pageOffset = location.dest
            ? secondary
              ? location.dest[2]
              : pageHeight - location.dest[3]
            : 0;
          viewer.currentPageNumber = pageIndex + 1;
          container.scrollTop = Math.min(
            pageIndex * pageHeight + pageOffset,
            container.scrollHeight - container.clientHeight,
          );
        },
      );

      test.navigation.navigateBoundary(0, true, active);
      expect(viewer.currentPageNumber).toBe(pages);
      expect(container.scrollTop).toBe(container.scrollHeight - container.clientHeight);

      test.navigation.navigateBoundary(5, true, active);
      expect(viewer.currentPageNumber).toBe(5);
      expect(container.scrollTop).toBe(4000);

      test.navigation.navigateBoundary(0, false, active);
      expect(viewer.currentPageNumber).toBe(1);
      expect(container.scrollTop).toBe(0);

      test.navigation.navigateBoundary(9, false, active);
      expect(viewer.currentPageNumber).toBe(9);
      expect(container.scrollTop).toBe(8000);
    },
  );

  it('delegates zoom, page, search, and split operations to the current Reader host', () => {
    const test = harness();

    test.navigation.zoom('in', 2);
    test.navigation.zoom('out', 3);
    test.navigation.zoom('reset', 4);
    test.navigation.navigatePage(-2);
    test.navigation.navigatePage(3);
    test.navigation.openSearch(test.primary);
    test.navigation.clearSearch();
    test.navigation.find(true);
    test.navigation.find(false);
    test.navigation.toggleSplit('horizontal');
    test.navigation.toggleSplit('vertical');

    expect(test.zoomIn).toHaveBeenCalledTimes(2);
    expect(test.zoomOut).toHaveBeenCalledTimes(3);
    expect(test.zoomReset).toHaveBeenCalledOnce();
    expect(test.navigateToPreviousPage).toHaveBeenCalledTimes(2);
    expect(test.navigateToNextPage).toHaveBeenCalledTimes(3);
    expect(test.toggleFindPopup).toHaveBeenNthCalledWith(1, { open: true });
    expect(test.toggleFindPopup).toHaveBeenNthCalledWith(2, { open: false });
    expect(test.findNext).toHaveBeenCalledOnce();
    expect(test.findPrevious).toHaveBeenCalledOnce();
    expect(test.toggleHorizontalSplit).toHaveBeenCalledOnce();
    expect(test.toggleVerticalSplit).toHaveBeenCalledOnce();
    expect(test.syncViews).toHaveBeenCalledTimes(2);
    expect(test.scrollBoundary).not.toHaveBeenCalled();
    expect(test.showStatus).not.toHaveBeenCalled();
    expect(test.debug).not.toHaveBeenCalled();
  });

  it('owns active split resolution and directional focus without taking input policy', () => {
    const test = harness();

    expect(test.navigation.canFocusDirection('right')).toBe(true);
    expect(test.navigation.focusDirection('right')).toBe(true);
    expect(test.focusView).toHaveBeenLastCalledWith(false);
    expect(test.active()).toBe(test.secondary);

    Reflect.set(test.reader._internalReader ?? {}, '_lastViewPrimary', true);
    expect(test.navigation.activePdfWindow()).toBe(test.primary);
    Reflect.set(test.reader._internalReader ?? {}, '_lastViewPrimary', false);
    expect(test.navigation.activePdfWindow()).toBe(test.secondary);

    test.navigation.activatePdfWindow(test.primary);
    expect(test.focusView).toHaveBeenLastCalledWith(true);
    expect(test.active()).toBe(test.primary);

    Reflect.set(test.reader._internalReader ?? {}, '_secondaryView', undefined);
    Reflect.set(test.reader._internalReader ?? {}, 'splitType', null);
    expect(test.navigation.canFocusDirection('left')).toBe(false);
    expect(test.navigation.canFocusDirection('right')).toBe(true);
    expect(test.navigation.focusDirection('right')).toBe(true);
    expect(test.focusContext).toHaveBeenCalledOnce();
  });

  it('does not dispatch an active primary search from an inactive secondary view', () => {
    const test = harness();

    expect(test.navigation.find(true, test.secondary)).toEqual({
      kind: 'unchanged',
    });

    expect(test.findNext).not.toHaveBeenCalled();
    expect(test.showStatus).toHaveBeenCalledWith('No active search — press / to search', 1500);
  });

  it('fails closed for unavailable navigation and uses the injected document fallback', () => {
    const test = harness();
    const internal = test.reader._internalReader;
    if (!internal) throw new Error('Expected internal reader');
    Reflect.set(internal, '_lastView', undefined);
    Reflect.set(internal, '_primaryView', { _iframeWindow: test.primary });
    Reflect.set(internal, 'zoomOut', () => {
      throw new Error('reader reloaded');
    });

    test.navigation.zoom('out', 1);
    test.navigation.navigateBoundary(0, true, test.primary);
    test.navigation.find(true);

    expect(test.showStatus).toHaveBeenCalledWith('Zoom unavailable', 1500);
    expect(test.showStatus).toHaveBeenCalledWith('No active search — press / to search', 1500);
    expect(test.debug).toHaveBeenCalledWith('reader zoom out failed: Error: reader reloaded');
    expect(test.scrollBoundary).toHaveBeenCalledWith(true, test.primary);
  });

  it('loads the native authored Outline on first use without opening a sidebar, and traverses headings including collapsed subsections', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const location = (pageIndex: number, top: number) => ({
      position: { pageIndex, rects: [[0, top, 0, top]] },
    });
    const state = {
      sidebarOpen: false,
      sidebarView: 'annotations' as const,
      outline: null as ReaderNativeOutlineEntry[] | null,
    };
    Reflect.set(internal, '_state', state);
    const nativeNavigate = vi.fn(async (request: { position: ReaderLinkPosition }) => {
      viewer.currentPageNumber = request.position.pageIndex + 1;
      viewer._location = {
        pageNumber: viewer.currentPageNumber,
        top: request.position.rects[0][1],
        left: 0,
      };
    });
    const viewer = { currentPageNumber: 1, _location: { pageNumber: 1, top: 792, left: 0 } };
    Reflect.set(test.primary, 'PDFViewerApplication', { pdfViewer: viewer });
    Reflect.set(internal._primaryView!, 'navigate', nativeNavigate);
    Reflect.set(internal._primaryView!, 'setSidebarView', async () => {
      state.outline = [
        {
          title: '1 Introduction',
          location: location(0, 792),
          expanded: false,
          items: [{ title: '1.1 Background', location: location(0, 700), items: [] }],
        },
        { title: 'Figure 1 Workflow', location: location(1, 792), items: [] },
        { title: '2 Results', location: location(2, 792), items: [] },
      ];
    });
    await expect(
      test.navigation.traverseOutline('heading', 1, test.primary, () => true),
    ).resolves.toBe(true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(0, 700), { block: 'start' });
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(2, 792), { block: 'start' });
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(0, 792), { block: 'start' });
    await test.navigation.traverseOutline('heading', -1, test.primary, () => true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(2, 792), { block: 'start' });
    expect(state.sidebarOpen).toBe(false);
    expect(state.sidebarView).toBe('annotations');
    expect(test.cloneInto).toHaveBeenCalledWith(
      expect.objectContaining({ position: expect.any(Object) }),
      test.reader._iframeWindow,
    );
  });

  it('traverses figures and tables only from authored entries in the exact active secondary view and reports missing categories honestly', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const position = { pageIndex: 2, rects: [[0, 600, 0, 600]] };
    Reflect.set(internal, '_state', {
      outline: [
        { title: 'Figure 1 Workflow', location: { position }, items: [] },
        { title: 'Unknown root', location: { position }, items: [] },
      ],
    });
    const primaryNavigate = vi.fn();
    const secondaryNavigate = vi.fn();
    Reflect.set(internal._primaryView!, 'navigate', primaryNavigate);
    Reflect.set(internal._secondaryView!, 'navigate', secondaryNavigate);
    Reflect.set(internal, '_lastViewPrimary', false);
    await test.navigation.traverseOutline('figure', 1, test.secondary, () => true);
    await test.navigation.traverseOutline('figure', -1, test.secondary, () => true);
    expect(secondaryNavigate).toHaveBeenCalledTimes(2);
    expect(secondaryNavigate).toHaveBeenLastCalledWith({ position }, { block: 'start' });
    expect(primaryNavigate).not.toHaveBeenCalled();
    await expect(
      test.navigation.traverseOutline('table', 1, test.secondary, () => true),
    ).resolves.toBe(false);
    expect(secondaryNavigate).toHaveBeenCalledTimes(2);
    expect(test.showStatus).toHaveBeenCalledWith('✗ no tables in Outline', 2000);
  });

  it.each(['new input', 'split change', 'view replacement'] as const)(
    'cannot jump after delayed native outline loading and %s',
    async (change) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      const pending = Promise.withResolvers<void>();
      const state = { outline: null as ReaderNativeOutlineEntry[] | null };
      Reflect.set(internal, '_state', state);
      const navigate = vi.fn();
      Reflect.set(internal._primaryView!, 'navigate', navigate);
      Reflect.set(internal._primaryView!, 'setSidebarView', () => pending.promise);
      let current = true;
      const traversal = test.navigation.traverseOutline('heading', 1, test.primary, () => current);
      if (change === 'new input') current = false;
      else if (change === 'split change') Reflect.set(internal, '_lastViewPrimary', false);
      else Reflect.set(internal, '_primaryView', { _iframeWindow: test.primary, navigate });
      state.outline = [
        {
          title: '1 Results',
          location: { position: { pageIndex: 1, rects: [[0, 792, 0, 792]] } },
          items: [],
        },
      ];
      pending.resolve();
      await expect(traversal).resolves.toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
