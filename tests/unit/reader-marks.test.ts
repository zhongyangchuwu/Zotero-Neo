import { describe, expect, it, vi } from 'vitest';

import { ReaderMarks, type MarksHost } from '../../src/reader/marks';
import type { ItemRuntime, PdfWindow, ReaderRuntime } from '../../src/reader/types';

function harness() {
  let pageNumber = 2;
  let scrollTop = 1150;
  const container = { scrollTop, clientHeight: 200, scrollHeight: 6000 };
  const page = { offsetTop: 1000, offsetHeight: 1000 };
  const viewer = { currentPageNumber: pageNumber, container };
  const pdfWindow = {
    PDFViewerApplication: { pdfViewer: viewer },
    document: {
      getElementById: () => container,
      querySelector: () => page,
      scrollingElement: container,
      documentElement: container,
    },
  } as unknown as PdfWindow;
  const reader = { itemID: 10 } as ReaderRuntime;
  const annotations: ItemRuntime[] = [];
  const statuses: string[] = [];
  const sourceLocations: Array<{ pageNumber: number; scrollTop: number }> = [];
  const successfulJumps: string[] = [];
  let current = true;
  let resolveAnnotationPageRatio: MarksHost['annotationPageRatio'] = async () => ({
    pageIndex: 4,
    ratio: 0.7,
  });
  const scrollToPageRatio = vi.fn(async (_window: PdfWindow, targetPage: number, ratio: number) => {
    pageNumber = targetPage + 1;
    viewer.currentPageNumber = pageNumber;
    scrollTop = targetPage * 1000 + ratio * 1000;
    container.scrollTop = scrollTop;
    return true;
  });
  const scrollDocumentToRatio = vi.fn((_window: PdfWindow, ratio: number) => {
    scrollTop = ratio * 1000;
    container.scrollTop = scrollTop;
    return true;
  });
  const preferenceValues = new Map<string, boolean | number | string>();
  const host: MarksHost = {
    preferences: {
      get: <T extends boolean | number | string>(key: string, fallback: T): T =>
        (preferenceValues.get(key) ?? fallback) as T,
      has: (key: string) => preferenceValues.has(key),
      set: (key: string, value: boolean | number | string) => {
        preferenceValues.set(key, value);
      },
      clear: (key: string) => {
        preferenceValues.delete(key);
      },
    },
    itemForReader: () =>
      ({
        key: 'attachment',
        getAnnotations: () => annotations,
        saveTx: vi.fn(async () => undefined),
      }) as ItemRuntime,
    schedule: () => {},
    showStatus: (message) => statuses.push(message),
    log: () => {},
    scrollToPageRatio,
    scrollDocumentToRatio,
    pageNavigationSupported: () => true,
    annotationPageRatio: (window, annotation) => resolveAnnotationPageRatio(window, annotation),
    onJump: async (_window, perform) => {
      sourceLocations.push({
        pageNumber: viewer.currentPageNumber,
        scrollTop: container.scrollTop,
      });
      const moved = await perform(() => current);
      if (moved) successfulJumps.push('jump');
      return moved;
    },
  };
  const marks = new ReaderMarks(host);
  return {
    annotations,
    container,
    host,
    marks,
    pageNumber: () => pageNumber,
    pdfWindow,
    reader,
    scrollDocumentToRatio,
    scrollToPageRatio,
    sourceLocations,
    statuses,
    successfulJumps,
    viewer,
    setCurrent: (value: boolean) => {
      current = value;
    },
    setAnnotationPageRatio: (resolve: MarksHost['annotationPageRatio']) => {
      resolveAnnotationPageRatio = resolve;
    },
    setViewport: (nextPage: number, nextScrollTop: number) => {
      pageNumber = nextPage;
      viewer.currentPageNumber = nextPage;
      scrollTop = nextScrollTop;
      container.scrollTop = nextScrollTop;
    },
  };
}

describe('ReaderMarks jump behavior', () => {
  it('jumps from a visible page-and-ratio mark to its actual simulated viewport', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', null);
    test.setViewport(1, 400);

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', () => {})).resolves.toBe(true);

    expect(test.sourceLocations).toEqual([{ pageNumber: 1, scrollTop: 400 }]);
    expect(test.pageNumber()).toBe(2);
    expect(test.container.scrollTop).toBe(1250);
    expect(test.successfulJumps).toEqual(['jump']);
  });

  it('captures before annotation selection and includes asynchronous page resolution in the jump', async () => {
    const test = harness();
    const annotation = { key: 'annotation-a' } as ItemRuntime;
    test.annotations.push(annotation);
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'a', annotation.key);
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    test.setViewport(1, 350);
    const resolvePage = vi.fn(async (_window: PdfWindow, _annotation: ItemRuntime) => {
      await Promise.resolve();
      return { pageIndex: 4, ratio: 0.7 };
    });
    test.setAnnotationPageRatio(resolvePage);

    const selectAnnotation = vi.fn(() => test.setViewport(5, 4200));
    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', selectAnnotation)).resolves.toBe(
      true,
    );

    expect(test.sourceLocations).toEqual([{ pageNumber: 1, scrollTop: 350 }]);
    expect(test.pageNumber()).toBe(5);
    expect(test.container.scrollTop).toBe(4700);
    expect(test.successfulJumps).toEqual(['jump']);
  });

  it('does not report or record a jump when asynchronous annotation page resolution fails', async () => {
    const test = harness();
    const annotation = { key: 'annotation-a' } as ItemRuntime;
    test.annotations.push(annotation);
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'a', annotation.key);
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    test.setAnnotationPageRatio(async () => {
      throw new Error('page rendering failed');
    });

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', () => {})).resolves.toBe(false);

    expect(test.sourceLocations).toEqual([{ pageNumber: 2, scrollTop: 1150 }]);
    expect(test.pageNumber()).toBe(2);
    expect(test.container.scrollTop).toBe(1150);
    expect(test.successfulJumps).toEqual([]);
    expect(test.statuses).not.toContain('→ mark a');
  });

  it('stops after asynchronous page resolution when the jump is no longer current', async () => {
    const test = harness();
    const annotation = { key: 'annotation-a' } as ItemRuntime;
    test.annotations.push(annotation);
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'a', annotation.key);
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    test.setViewport(1, 350);
    const { promise: pendingPage, resolve: resolvePage } = Promise.withResolvers<{
      pageIndex: number;
      ratio: number;
    }>();
    test.setAnnotationPageRatio(async () => pendingPage);
    const selectAnnotation = vi.fn(() => test.setViewport(5, 4200));

    const jump = test.marks.jump(test.reader, test.pdfWindow, 'a', selectAnnotation);
    expect(test.sourceLocations).toEqual([{ pageNumber: 1, scrollTop: 350 }]);
    expect(selectAnnotation).toHaveBeenCalledWith(annotation.key);
    expect(test.pageNumber()).toBe(5);
    test.setCurrent(false);
    resolvePage({ pageIndex: 4, ratio: 0.7 });

    await expect(jump).resolves.toBe(false);

    expect(test.pageNumber()).toBe(5);
    expect(test.container.scrollTop).toBe(4200);
    expect(test.successfulJumps).toEqual([]);
    expect(test.statuses).not.toContain('→ mark a');
  });

  it('uses a saved page when the marked annotation was deleted and reports that outcome', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', 'deleted-annotation');
    test.setViewport(1, 400);
    const selectAnnotation = vi.fn();

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', selectAnnotation)).resolves.toBe(
      true,
    );

    expect(test.sourceLocations).toEqual([{ pageNumber: 1, scrollTop: 400 }]);
    expect(selectAnnotation).toHaveBeenCalledWith(null);
    expect(test.pageNumber()).toBe(2);
    expect(test.container.scrollTop).toBe(1250);
    expect(test.statuses).toContain('→ mark a · annotation gone');
    expect(test.successfulJumps).toEqual(['jump']);
  });

  it('does not invoke the jump boundary for a missing mark', async () => {
    const test = harness();

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'x', () => {})).resolves.toBe(false);

    expect(test.sourceLocations).toEqual([]);
    expect(test.successfulJumps).toEqual([]);
    expect(test.statuses).toContain('✗ mark x not set');
  });

  it('does not report or record a no-op destination failure', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', null);
    test.scrollToPageRatio.mockResolvedValue(false);

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', () => {})).resolves.toBe(false);

    expect(test.sourceLocations).toEqual([{ pageNumber: 2, scrollTop: 1150 }]);
    expect(test.successfulJumps).toEqual([]);
    expect(test.statuses).not.toContain('→ mark a');
  });
});
