import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderNavigation } from '../../src/modules/reader-navigation/navigation';
import { ReaderCaptionTargets } from '../../src/modules/reader-navigation/caption-targets';
import { ReaderNavigationHost } from '../../src/toolkit';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../fixtures/reader-native-types';
import type { ReaderNativeOutlineEntry, ReaderLinkPosition } from '../../src/reader/types';

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

function harness(itemID = 42) {
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
    itemID,
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
  const captions = new ReaderCaptionTargets(
    reader.itemID,
    () => {},
    debug,
    () => true,
  );
  const host = new ReaderNavigationHost({
    reader,
    activePdfWindow: () => active,
    setActivePdfWindow: (pdfWindow) => {
      active = pdfWindow;
    },
    syncViews,
    scrollBoundary,
    unavailable: (reason) =>
      showStatus(
        reason === 'zoom'
          ? 'Zoom unavailable'
          : reason === 'search'
            ? 'No active search — press / to search'
            : 'Page navigation unavailable',
        1500,
      ),
    debug,
  });
  const navigation = new ReaderNavigation({
    reader,
    captions,
    host,
    showStatus,
    debug,
  });

  return {
    cloneInto,
    host,
    navigation,
    reader,
    captions,
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

  it('owns active split resolution and directional focus without taking input policy', () => {
    const test = harness();

    expect(test.host.canFocusDirection('right')).toBe(true);
    expect(test.host.focusDirection('right')).toBe(true);
    expect(test.focusView).toHaveBeenLastCalledWith(false);
    expect(test.active()).toBe(test.secondary);

    Reflect.set(test.reader._internalReader ?? {}, '_lastViewPrimary', true);
    expect(test.host.activePdfWindow()).toBe(test.primary);
    Reflect.set(test.reader._internalReader ?? {}, '_lastViewPrimary', false);
    expect(test.host.activePdfWindow()).toBe(test.secondary);

    test.host.activatePdfWindow(test.primary);
    expect(test.focusView).toHaveBeenLastCalledWith(true);
    expect(test.active()).toBe(test.primary);

    Reflect.set(test.reader._internalReader ?? {}, '_secondaryView', undefined);
    Reflect.set(test.reader._internalReader ?? {}, 'splitType', null);
    expect(test.host.canFocusDirection('left')).toBe(false);
    expect(test.host.canFocusDirection('right')).toBe(true);
    expect(test.host.focusDirection('right')).toBe(true);
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
          title: 'Introduction',
          location: location(0, 792),
          expanded: false,
          items: [
            {
              title: 'Background',
              location: location(0, 700),
              matched: false,
              childMatched: false,
              items: [],
            },
          ],
        },
        { title: 'Related Work', location: location(1, 750), items: [], matched: false },
        { title: 'Figure 1 Workflow', location: location(1, 792), items: [] },
        { title: '5 Experiments', location: location(2, 792), items: [], active: true },
      ];
    });
    await expect(
      test.navigation.traverseOutline('heading', 1, test.primary, () => true),
    ).resolves.toBe(true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(0, 700), { block: 'start' });
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(nativeNavigate).toHaveBeenLastCalledWith(location(1, 750), { block: 'start' });
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

  it.each([
    {
      name: 'primary forward',
      secondary: false,
      direction: 1 as const,
      heights: [600, 900, 700],
      scale: 1,
    },
    {
      name: 'secondary forward',
      secondary: true,
      direction: 1 as const,
      heights: [1100, 650, 900],
      scale: 1.25,
    },
    {
      name: 'primary backward',
      secondary: false,
      direction: -1 as const,
      heights: [600, 900, 700],
      scale: 0.8,
    },
    {
      name: 'secondary backward',
      secondary: true,
      direction: -1 as const,
      heights: [1100, 650, 900],
      scale: 1.5,
    },
  ])(
    'aligns the destination heading page/start across unequal pages in $name',
    async ({ secondary, direction, heights, scale }) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      const loadCaptions = vi.spyOn(test.captions, 'load');
      const active = secondary ? test.secondary : test.primary;
      const view = secondary ? internal._secondaryView! : internal._primaryView!;
      const other = secondary ? internal._primaryView! : internal._secondaryView!;
      Reflect.set(internal, '_lastViewPrimary', !secondary);
      const offsets = [0, heights[0] * scale + 18, (heights[0] + heights[1]) * scale + 36];
      const sourcePage = direction > 0 ? 0 : 2;
      const targetTop = direction > 0 ? heights[1] - 45 : 40;
      const target = { pageIndex: 1, rects: [[35, targetTop - 12, 400, targetTop]] };
      const authored = { pageIndex: 0, rects: [[0, 70.401, 0, 70.401]] };
      const getBlocks = vi.fn(async () => [
        {
          type: 'heading',
          content: [{ text: '3.2Background' }],
          anchor: { pageRects: [[1, 35, targetTop - 12, 400, targetTop]] },
        },
      ]);
      const getReader = vi.fn(async () => ({ getTopLevelBlockCount: () => 1, getBlocks }));
      Reflect.set(globalThis, 'Zotero', { SDT: { getReader } });
      const container = {
        scrollTop: offsets[sourcePage] + (direction > 0 ? (heights[0] - 100) * scale : 25 * scale),
        scrollHeight: offsets[2] + heights[2] * scale,
        clientHeight: 300,
        clientTop: 0,
        clientLeft: 0,
        getBoundingClientRect: () => ({ top: 0, left: 0 }),
      };
      const pageViews = heights.map((height, index) => ({
        div: {
          getBoundingClientRect: () => ({ top: offsets[index] - container.scrollTop, left: 0 }),
        },
        viewport: {
          height: height * scale,
          scale,
          convertToPdfPoint: (x: number, y: number) => [x / scale, height - y / scale],
        },
      }));
      const viewer = { container, _pages: pageViews, currentPageNumber: sourcePage + 1 };
      Reflect.set(active, 'PDFViewerApplication', { pdfViewer: viewer });
      const nativeRect = (position: ReaderLinkPosition) => {
        const rect = position.rects[0];
        return [
          rect[0] * scale,
          offsets[position.pageIndex] +
            (heights[position.pageIndex] - Math.max(rect[1], rect[3])) * scale,
          rect[2] * scale,
          offsets[position.pageIndex] +
            (heights[position.pageIndex] - Math.min(rect[1], rect[3])) * scale,
        ];
      };
      const destinations: ReaderLinkPosition[] = [];
      Reflect.set(view, 'getPositionBoundingViewRect', nativeRect);
      // Native block:start uses the PDF rectangle's document top, then clamps to scroll bounds.
      Reflect.set(
        view,
        'navigate',
        async (
          { position }: { position: ReaderLinkPosition },
          options: { block?: string } = {},
        ) => {
          destinations.push(position);
          const rect = nativeRect(position);
          const top =
            options.block === 'start' ? rect[1] : rect[1] - container.clientHeight / 2 - 5;
          container.scrollTop = Math.max(
            0,
            Math.min(top, container.scrollHeight - container.clientHeight),
          );
          viewer.currentPageNumber =
            offsets.findLastIndex((offset) => offset <= container.scrollTop) + 1;
        },
      );
      const otherNavigate = vi.fn();
      Reflect.set(other, 'navigate', otherNavigate);
      Reflect.set(internal, '_state', {
        sidebarOpen: false,
        sidebarView: 'annotations',
        outline: [
          {
            title: 'Introduction',
            expanded: false,
            location: { position: { pageIndex: 0, rects: [[0, heights[0], 0, heights[0]]] } },
            items: [{ title: 'Background', location: { position: authored }, matched: false }],
          },
          { title: 'Discussion', location: { position: { pageIndex: 2, rects: [[0, 0, 0, 0]] } } },
        ],
      });
      const before = container.scrollTop;
      if (direction > 0) {
        expect(nativeRect(target)[1]).toBeGreaterThan(before);
        expect(nativeRect(target)[1]).toBeLessThan(before + container.clientHeight);
      }
      await expect(
        test.navigation.traverseOutline('heading', direction, active, () => true),
      ).resolves.toBe(true);
      expect(destinations).toEqual([target]);
      expect(container.scrollTop).toBeCloseTo(offsets[1] + (heights[1] - targetTop) * scale);
      expect(nativeRect(target)[1] - container.scrollTop).toBeCloseTo(0);
      expect(viewer.currentPageNumber).toBe(2);
      expect(heights[1] - (container.scrollTop - offsets[1]) / scale).toBeCloseTo(targetTop);
      expect(otherNavigate).not.toHaveBeenCalled();
      expect(loadCaptions).toHaveBeenCalledTimes(1);
      expect(getReader).toHaveBeenCalledTimes(1);
      expect(getBlocks).toHaveBeenCalledTimes(1);
      expect(test.cloneInto).toHaveBeenCalledWith(target, test.reader._iframeWindow);
      // Classification must also use the resolved geometry after landing, not the obsolete
      // previous-page bookmark, so both directions advance and globally wrap without repeats.
      await test.navigation.traverseOutline('heading', direction, active, () => true);
      await test.navigation.traverseOutline('heading', direction, active, () => true);
      expect(destinations.map((position) => position.pageIndex)).toEqual(
        direction > 0 ? [1, 2, 0] : [1, 0, 2],
      );
      expect(getReader).toHaveBeenCalledTimes(1);
      expect(getBlocks).toHaveBeenCalledTimes(1);
      expect(internal._state?.sidebarOpen).toBe(false);
      expect(internal._state?.sidebarView).toBe('annotations');
    },
  );

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
    Reflect.set(test.secondary, 'PDFViewerApplication', {
      pdfViewer: { _location: { pageNumber: 1, top: 792, left: 0 } },
    });
    await test.navigation.traverseOutline('figure', 1, test.secondary, () => true);
    await test.navigation.traverseOutline('figure', -1, test.secondary, () => true);
    expect(secondaryNavigate).toHaveBeenCalledTimes(2);
    expect(secondaryNavigate).toHaveBeenLastCalledWith({ position }, { block: 'start' });
    expect(primaryNavigate).not.toHaveBeenCalled();
    await expect(
      test.navigation.traverseOutline('table', 1, test.secondary, () => true),
    ).resolves.toBe(false);
    expect(secondaryNavigate).toHaveBeenCalledTimes(2);
  });

  it.each([
    { direction: 1 as const, rounded: 700, target: 600.4, scale: 1 },
    { direction: -1 as const, rounded: 700, target: 792, scale: 1 },
    { direction: 1 as const, rounded: 600, target: 792, scale: 1 },
    { direction: -1 as const, rounded: 600, target: 700.4, scale: 1 },
    { direction: -1 as const, rounded: 699, target: 792, scale: 0.5 },
  ])(
    'skips rounded same-page boundaries and wraps globally ($direction, $rounded)',
    async ({ direction, rounded, target, scale }) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      Reflect.set(internal, '_state', {
        outline: [
          {
            title: 'Introduction',
            location: { position: { pageIndex: 0, rects: [[0, 792, 0, 792]] } },
          },
          {
            title: 'Related Work',
            location: { position: { pageIndex: 0, rects: [[0, 700.4, 0, 700.4]] } },
          },
          {
            title: 'Experiments',
            active: true,
            location: { position: { pageIndex: 0, rects: [[0, 600.4, 0, 600.4]] } },
          },
        ],
      });
      Reflect.set(test.primary, 'PDFViewerApplication', {
        pdfViewer: {
          _location: { pageNumber: 1, top: rounded, left: 0 },
          getPageView: () => ({ viewport: { scale, height: 1000 } }),
        },
      });
      const navigate = vi.fn();
      Reflect.set(internal._primaryView!, 'navigate', navigate);
      await test.navigation.traverseOutline('heading', direction, test.primary, () => true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(
        { position: { pageIndex: 0, rects: [[0, target, 0, target]] } },
        { block: 'start' },
      );
    },
  );

  it('advances to a bottom-clamped heading once, then wraps instead of repeating its unreachable top', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const first = { position: { pageIndex: 0, rects: [[0, 792, 0, 792]] } };
    const last = { position: { pageIndex: 1, rects: [[0, 200, 0, 200]] } };
    Reflect.set(internal, '_state', {
      outline: [
        { title: 'Introduction', location: first },
        { title: 'Discussion', location: last },
      ],
    });
    const container = { scrollTop: 950, scrollHeight: 2000, clientHeight: 1000 };
    const viewer = { _location: { pageNumber: 2, top: 550, left: 0 }, container };
    Reflect.set(test.primary, 'PDFViewerApplication', { pdfViewer: viewer });
    Reflect.set(
      internal._primaryView!,
      'getPositionBoundingViewRect',
      (position: ReaderLinkPosition) => [
        0,
        position.pageIndex === 0 ? 0 : 1300,
        0,
        position.pageIndex === 0 ? 0 : 1300,
      ],
    );
    const navigate = vi.fn(async (request: { position: ReaderLinkPosition }) => {
      container.scrollTop = request.position.pageIndex === 0 ? 0 : 1000;
      viewer._location = {
        pageNumber: request.position.pageIndex + 1,
        top: request.position.pageIndex === 0 ? 792 : 500,
        left: 0,
      };
    });
    Reflect.set(internal._primaryView!, 'navigate', navigate);
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith(last, { block: 'start' });
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith(first, { block: 'start' });
    await test.navigation.traverseOutline('heading', -1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith(last, { block: 'start' });
    expect(navigate).toHaveBeenCalledTimes(3);
  });

  it('uses live PDF geometry without an Outline active-row or page-only fallback', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const next = { position: { pageIndex: 0, rects: [[0, 650, 0, 650]] } };
    Reflect.set(internal, '_state', {
      outline: [
        {
          title: 'Introduction',
          location: { position: { pageIndex: 0, rects: [[0, 750, 0, 750]] } },
        },
        { title: 'Related Work', location: next },
        {
          title: '5 Experiments',
          active: true,
          location: { position: { pageIndex: 5, rects: [[0, 750, 0, 750]] } },
        },
      ],
    });
    const viewer = {
      currentPageNumber: 1,
      container: {
        clientTop: 2,
        clientLeft: 0,
        getBoundingClientRect: () => ({ top: 100, left: 0 }),
      },
      getPageView: () => ({
        div: { getBoundingClientRect: () => ({ top: -198, left: 0 }) },
        viewport: {
          scale: 1,
          height: 1000,
          convertToPdfPoint: (x: number, y: number) => [x, 1000 - y],
        },
      }),
    };
    Reflect.set(viewer, '_location', { pageNumber: 1, top: 800, left: 0 });
    Reflect.set(test.primary, 'PDFViewerApplication', { pdfViewer: viewer });
    const navigate = vi.fn();
    Reflect.set(internal._primaryView!, 'navigate', navigate);
    await test.navigation.traverseOutline('heading', 1, test.primary, () => true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(next, { block: 'start' });

    Reflect.set(viewer, 'getPageView', undefined);
    Reflect.set(viewer, '_location', undefined);
    navigate.mockClear();
    await expect(
      test.navigation.traverseOutline('heading', 1, test.primary, () => true),
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('merges native bookmark and genuine SDT caption targets without repeating a figure identity', async () => {
    const test = harness();
    const nativeFigure = { pageIndex: 0, rects: [[0, 600, 0, 600]] };
    const figure = { pageIndex: 2, rects: [[50, 100, 500, 140]] };
    const table = { pageIndex: 3, rects: [[50, 400, 500, 440]] };
    const blocks = [
      {
        type: 'caption',
        content: [{ text: 'Figure 1: Overview' }],
        anchor: { pageRects: [[0, 50, 400, 500, 440]] },
      },
      {
        type: 'caption',
        content: [{ text: 'Figure 2: Model' }],
        anchor: { pageRects: [[2, 50, 100, 500, 140]] },
      },
      {
        type: 'caption',
        content: [{ text: 'Table 1: Results' }],
        anchor: { pageRects: [[3, 50, 400, 500, 440]] },
      },
    ];
    Reflect.set(globalThis, 'Zotero', {
      SDT: {
        getReader: async () => ({
          getTopLevelBlockCount: () => blocks.length,
          getBlocks: async () => blocks,
        }),
      },
    });
    const internal = test.reader._internalReader!;
    Reflect.set(internal, '_state', {
      outline: [{ title: 'Figure 1 Overview', location: { position: nativeFigure } }],
    });
    const viewer = { _location: { pageNumber: 1, top: 700, left: 0 } };
    Reflect.set(test.primary, 'PDFViewerApplication', { pdfViewer: viewer });
    const navigate = vi.fn(async ({ position }: { position: ReaderLinkPosition }) => {
      viewer._location = {
        pageNumber: position.pageIndex + 1,
        top: Math.max(position.rects[0][1], position.rects[0][3]),
        left: 0,
      };
    });
    Reflect.set(internal._primaryView!, 'navigate', navigate);
    await test.navigation.traverseOutline('figure', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith({ position: nativeFigure }, { block: 'start' });
    await test.navigation.traverseOutline('figure', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith({ position: figure }, { block: 'start' });
    await test.navigation.traverseOutline('table', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith({ position: table }, { block: 'start' });
  });

  it('lands a duplicate Figure identity at the supplied image region rather than its bookmark caption', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const region = { pageIndex: 1, rects: [[40, 480, 560, 760]] };
    const caption = { pageIndex: 1, rects: [[40, 440, 560, 460]] };
    const target = {
      kind: 'figure' as const,
      label: 'Figure 1',
      title: 'Figure 1: Overview',
      location: { position: region },
    };
    Reflect.set(internal, '_state', {
      outline: [{ title: 'Figure 1 Overview', location: { position: caption } }],
    });
    vi.spyOn(test.captions, 'load').mockResolvedValue([target]);
    const container = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 };
    const viewer = { container, _location: { pageNumber: 1, top: 900, left: 0 } };
    Reflect.set(test.primary, 'PDFViewerApplication', { pdfViewer: viewer });
    const nativeRect = (position: ReaderLinkPosition) => {
      const rect = position.rects[0];
      return [
        rect[0],
        1000 + 900 - Math.max(rect[1], rect[3]),
        rect[2],
        1000 + 900 - Math.min(rect[1], rect[3]),
      ];
    };
    Reflect.set(internal._primaryView!, 'getPositionBoundingViewRect', nativeRect);
    Reflect.set(
      internal._primaryView!,
      'navigate',
      async ({ position }: { position: ReaderLinkPosition }) => {
        container.scrollTop = Math.min(
          nativeRect(position)[1],
          container.scrollHeight - container.clientHeight,
        );
        viewer._location = {
          pageNumber: position.pageIndex + 1,
          top: 900 - (container.scrollTop - 1000),
          left: 0,
        };
      },
    );

    await expect(
      test.navigation.traverseOutline('figure', 1, test.primary, () => true),
    ).resolves.toBe(true);
    expect(viewer._location).toEqual({ pageNumber: 2, top: 760, left: 0 });
    expect(nativeRect(region)[1] - container.scrollTop).toBe(0);
    expect(nativeRect(caption)[1] - container.scrollTop).toBe(300);
    await test.navigation.navigateCaption(target, test.primary);
    expect(nativeRect(region)[1] - container.scrollTop).toBe(0);
  });

  it('replaces a table bookmark with the whole group even when its caption has the same top', async () => {
    const test = harness();
    const internal = test.reader._internalReader!;
    const position = { pageIndex: 1, rects: [[50, 740, 545, 770]] };
    const group = { pageIndex: 1, rects: [...position.rects, [50, 400, 545, 730]] };
    Reflect.set(internal, '_state', {
      outline: [{ title: 'Table 1: Results', location: { position } }],
    });
    vi.spyOn(test.captions, 'load').mockResolvedValue([
      {
        title: 'Table 1: Results',
        kind: 'table',
        label: '1',
        association: 'geometry',
        location: { position: group },
      },
    ]);
    Reflect.set(test.primary, 'PDFViewerApplication', {
      pdfViewer: { _location: { pageNumber: 1, top: 800, left: 0 } },
    });
    const navigate = vi.fn();
    Reflect.set(internal._primaryView!, 'navigate', navigate);
    await test.navigation.traverseOutline('table', 1, test.primary, () => true);
    expect(navigate).toHaveBeenLastCalledWith({ position: group }, { block: 'start' });
    expect(test.cloneInto).toHaveBeenCalledWith({ position: group }, test.reader._iframeWindow);
  });

  it('does not navigate when focus ownership retires during native caption processing', async () => {
    const test = harness();
    const pending = Promise.withResolvers<unknown>();
    Reflect.set(globalThis, 'Zotero', { SDT: { getReader: () => pending.promise } });
    const internal = test.reader._internalReader!;
    Reflect.set(internal, '_state', { outline: [] });
    Reflect.set(test.primary, 'PDFViewerApplication', {
      pdfViewer: { _location: { pageNumber: 1, top: 700, left: 0 } },
    });
    const navigate = vi.fn();
    Reflect.set(internal._primaryView!, 'navigate', navigate);
    let current = true;
    const request = test.navigation.traverseOutline('figure', 1, test.primary, () => current);
    await Promise.resolve();
    current = false;
    pending.resolve({
      getTopLevelBlockCount: () => 1,
      getBlocks: async () => [
        {
          type: 'caption',
          content: [{ text: 'Figure 1: Overview' }],
          anchor: { pageRects: [[1, 50, 100, 500, 140]] },
        },
      ],
    });
    await expect(request).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['new input', 'split change', 'view replacement'] as const)(
    'cannot jump after delayed native outline loading and %s',
    async (change) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      Reflect.set(test.primary, 'PDFViewerApplication', {
        pdfViewer: { _location: { pageNumber: 1, top: 792, left: 0 } },
      });
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

  it.each([
    { secondary: false, change: 'new input' },
    { secondary: false, change: 'split change' },
    { secondary: false, change: 'view replacement' },
    { secondary: true, change: 'new input' },
    { secondary: true, change: 'split change' },
    { secondary: true, change: 'view replacement' },
  ])(
    'retires heading landing after awaited initialization ($secondary, $change)',
    async ({ secondary, change }) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      const active = secondary ? test.secondary : test.primary;
      const view = secondary ? internal._secondaryView! : internal._primaryView!;
      Reflect.set(internal, '_lastViewPrimary', !secondary);
      Reflect.set(active, 'PDFViewerApplication', {
        pdfViewer: { _location: { pageNumber: 1, top: 792, left: 0 } },
      });
      Reflect.set(internal, '_state', {
        outline: [
          { title: 'Results', location: { position: { pageIndex: 1, rects: [[0, 750, 0, 750]] } } },
        ],
      });
      const pending = Promise.withResolvers<void>();
      Reflect.set(view, 'initializedPromise', pending.promise);
      const navigate = vi.fn();
      Reflect.set(view, 'navigate', navigate);
      let current = true;
      const traversal = test.navigation.traverseOutline('heading', 1, active, () => current);
      if (change === 'new input') current = false;
      else if (change === 'split change') Reflect.set(internal, '_lastViewPrimary', secondary);
      else
        Reflect.set(internal, secondary ? '_secondaryView' : '_primaryView', {
          _iframeWindow: active,
          navigate,
        });
      pending.resolve();
      await expect(traversal).resolves.toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { secondary: false, change: 'new input' },
    { secondary: false, change: 'split change' },
    { secondary: false, change: 'view replacement' },
    { secondary: true, change: 'new input' },
    { secondary: true, change: 'split change' },
    { secondary: true, change: 'view replacement' },
  ])(
    'cannot apply a heading anchor after native metadata await ($secondary, $change)',
    async ({ secondary, change }) => {
      const test = harness();
      const internal = test.reader._internalReader!;
      const active = secondary ? test.secondary : test.primary;
      const view = secondary ? internal._secondaryView! : internal._primaryView!;
      Reflect.set(internal, '_lastViewPrimary', !secondary);
      Reflect.set(active, 'PDFViewerApplication', {
        pdfViewer: { _location: { pageNumber: 1, top: 100, left: 0 } },
      });
      Reflect.set(internal, '_state', {
        outline: [
          { title: 'Results', location: { position: { pageIndex: 0, rects: [[0, 70, 0, 70]] } } },
        ],
      });
      const started = Promise.withResolvers<void>();
      const pending = Promise.withResolvers<unknown>();
      Reflect.set(globalThis, 'Zotero', {
        SDT: {
          getReader: () => {
            started.resolve();
            return pending.promise;
          },
        },
      });
      const headingPosition = vi.spyOn(test.captions, 'headingPosition');
      const navigate = vi.fn();
      Reflect.set(view, 'navigate', navigate);
      let current = true;
      const traversal = test.navigation.traverseOutline('heading', 1, active, () => current);
      await started.promise;
      if (change === 'new input') current = false;
      else if (change === 'split change') Reflect.set(internal, '_lastViewPrimary', secondary);
      else
        Reflect.set(internal, secondary ? '_secondaryView' : '_primaryView', {
          _iframeWindow: active,
          navigate,
        });
      pending.resolve({
        getTopLevelBlockCount: () => 1,
        getBlocks: async () => [
          {
            type: 'heading',
            content: [{ text: '1Results' }],
            anchor: { pageRects: [[1, 108, 700, 250, 716]] },
          },
        ],
      });
      await expect(traversal).resolves.toBe(false);
      expect(headingPosition).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
