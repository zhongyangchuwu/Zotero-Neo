import { afterEach, describe, expect, it, vi } from 'vitest';

import { MainJumpHistoryState } from '../../src/main/jump-history';
import { ReaderJumpHistoryBridge } from '../../src/reader/jump-history-bridge';
import { ReaderJumpHostAdapter } from '../../src/reader/jump-host';
import { ReaderNavigation } from '../../src/reader/navigation';
import type {
  PdfWindow,
  ReaderPdfHistoryLocationRuntime,
  ReaderRuntime,
  ReaderViewRuntime,
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
  Reflect.set(globalThis, 'Components', {
    utils: { cloneInto: <T>(value: T) => value },
  });
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
  ])('preserves mixed boundary jump locations in the $name view', ({ secondary, pages }) => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const active = secondary ? test.secondary : test.primary;
    const view = (secondary ? internal._secondaryView : internal._primaryView)!;
    const viewer = { pagesCount: pages, _location: { pageNumber: 1, top: 800, left: 0 } };
    Reflect.set(active, 'PDFViewerApplication', { pdfViewer: viewer });
    Reflect.set(internal, '_lastView', view);
    Reflect.set(view, 'navigateToNextPage', () => {});
    Reflect.set(test.reader, 'tabID', 'reader-tab');
    Reflect.set(test.reader, 'itemID', 7);
    Reflect.set(globalThis, 'Zotero', {
      Items: { get: () => ({ id: 7, libraryID: 1, isAttachment: () => true }) },
    });

    const location = (pageIndex: number): ReaderPdfHistoryLocationRuntime => ({
      dest: [pageIndex, { name: 'XYZ' }, 0, 800, null],
    });
    const nativeHistory: {
      _currentLocation: ReaderPdfHistoryLocationRuntime;
      save: (location: ReaderPdfHistoryLocationRuntime, transient?: boolean) => unknown;
    } = {
      _currentLocation: location(0),
      save: (next) => {
        nativeHistory._currentLocation = next;
      },
    };
    Reflect.set(view, '_history', nativeHistory);
    const navigate = (pageIndex: number, hard: boolean) => {
      viewer._location = { pageNumber: pageIndex + 1, top: 800, left: 0 };
      nativeHistory.save(location(pageIndex), !hard);
    };
    Reflect.set(internal, 'navigate', ({ pageIndex }: { pageIndex: number }) =>
      navigate(pageIndex, true),
    );
    // Native first/last-page events do not save discrete history points.
    Reflect.set(internal, 'navigateToFirstPage', () => navigate(0, false));
    Reflect.set(internal, 'navigateToLastPage', () => navigate(pages - 1, false));
    const history = new MainJumpHistoryState();
    const bridge = new ReaderJumpHistoryBridge({
      reader: test.reader,
      host: new ReaderJumpHostAdapter(),
      record: (source, destination) => history.append(source, destination, history.invalidate()),
      debug: test.debug,
    });
    bridge.sync();
    try {
      test.navigation.navigateBoundary(5, false, active);
      test.navigation.navigateBoundary(0, true, active);
      test.navigation.navigateBoundary(0, false, active);
      test.navigation.navigateBoundary(9, false, active);

      expect(viewer._location.pageNumber).toBe(9);
      expect(
        history.locations.map((entry) => (entry.kind === 'reader' ? entry.position : null)),
      ).toEqual(
        [0, 4, pages - 1, 0, 8].map((pageIndex) => ({
          primary: !secondary,
          pageIndex,
          top: 800,
          left: 0,
        })),
      );
    } finally {
      bridge.dispose();
    }
  });

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
});
