import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderNavigation } from '../../src/reader/navigation';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
const originalServices = Reflect.get(globalThis, 'Services');

afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
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

  const navigateBack = vi.fn();
  const navigateForward = vi.fn();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const zoomReset = vi.fn();
  const navigateToPreviousPage = vi.fn();
  const navigateToNextPage = vi.fn();
  const navigateToFirstPage = vi.fn();
  const navigateToLastPage = vi.fn();
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
      navigateBack,
      navigateForward,
      zoomIn,
      zoomOut,
      zoomReset,
      navigateToPreviousPage,
      navigateToNextPage,
      navigateToFirstPage,
      navigateToLastPage,
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
    navigateBack,
    navigateForward,
    zoomIn,
    zoomOut,
    zoomReset,
    navigateToPreviousPage,
    navigateToNextPage,
    navigateToFirstPage,
    navigateToLastPage,
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
  it('delegates history, zoom, page, search, and split operations to the current Reader host', () => {
    const test = harness();

    test.navigation.navigateHistory('back');
    test.navigation.navigateHistory('forward');
    test.navigation.zoom('in', 2);
    test.navigation.zoom('out', 3);
    test.navigation.zoom('reset', 4);
    test.navigation.navigatePage(-2);
    test.navigation.navigatePage(3);
    test.navigation.navigateBoundary(0, false, test.primary);
    test.navigation.navigateBoundary(0, true, test.primary);
    test.navigation.navigateBoundary(4, false, test.primary);
    test.navigation.openSearch(test.primary);
    test.navigation.clearSearch();
    test.navigation.find(true);
    test.navigation.find(false);
    test.navigation.toggleSplit('horizontal');
    test.navigation.toggleSplit('vertical');

    expect(test.navigateBack).toHaveBeenCalledOnce();
    expect(test.navigateForward).toHaveBeenCalledOnce();
    expect(test.zoomIn).toHaveBeenCalledTimes(2);
    expect(test.zoomOut).toHaveBeenCalledTimes(3);
    expect(test.zoomReset).toHaveBeenCalledOnce();
    expect(test.navigateToPreviousPage).toHaveBeenCalledTimes(2);
    expect(test.navigateToNextPage).toHaveBeenCalledTimes(3);
    expect(test.navigateToFirstPage).toHaveBeenCalledOnce();
    expect(test.navigateToLastPage).toHaveBeenCalledOnce();
    expect(test.navigate).toHaveBeenCalledWith({ pageIndex: 3 });
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
    Reflect.set(internal, 'navigateBack', undefined);
    Reflect.set(internal, 'zoomOut', () => {
      throw new Error('reader reloaded');
    });

    test.navigation.navigateHistory('back');
    test.navigation.zoom('out', 1);
    test.navigation.navigateBoundary(0, true, test.primary);
    test.navigation.find(true);

    expect(test.showStatus).toHaveBeenCalledWith('History unavailable', 1500);
    expect(test.showStatus).toHaveBeenCalledWith('Zoom unavailable', 1500);
    expect(test.showStatus).toHaveBeenCalledWith('No active search — press / to search', 1500);
    expect(test.debug).toHaveBeenCalledWith('reader zoom out failed: Error: reader reloaded');
    expect(test.scrollBoundary).toHaveBeenCalledWith(true, test.primary);
  });
});
