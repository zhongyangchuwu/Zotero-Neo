import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderMarks, type MarksHost } from '../../src/modules/reader-navigation/marks';
import type { ItemRuntime, PdfWindow, ReaderRuntime } from '../../src/reader/types';

const instances: ReaderMarks[] = [];
afterEach(() => {
  for (const marks of instances.splice(0)) marks.dispose();
  vi.unstubAllGlobals();
});

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
  const sourceLocations: Array<{ pageNumber: number; scrollTop: number }> = [];
  const successfulJumps: string[] = [];
  let current = true;
  let moduleCurrent = true;
  let presentationRevision = 0;
  let refreshPresentation = false;
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
  const preferenceListeners = new Map<string, Set<() => void>>();
  const host: MarksHost = {
    isCurrent: () => moduleCurrent,
    capturePresentation: () => {
      const revision = presentationRevision;
      return () => presentationRevision === revision;
    },
    onChange: () => {
      if (refreshPresentation) presentationRevision += 1;
    },
    preferences: {
      get: <T extends boolean | number | string>(key: string, fallback: T): T =>
        (preferenceValues.get(key) ?? fallback) as T,
      has: (key: string) => preferenceValues.has(key),
      set: (key: string, value: boolean | number | string) => {
        preferenceValues.set(key, value);
        for (const listener of preferenceListeners.get(key) ?? []) listener();
      },
      clear: (key: string) => {
        preferenceValues.delete(key);
        for (const listener of preferenceListeners.get(key) ?? []) listener();
      },
      observe: (key, listener) => {
        let listeners = preferenceListeners.get(key);
        if (!listeners) {
          listeners = new Set();
          preferenceListeners.set(key, listeners);
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    itemForReader: () =>
      ({
        key: 'attachment',
        getAnnotations: () => annotations,
        saveTx: vi.fn(async () => undefined),
      }) as ItemRuntime,
    schedule: () => {},
    showStatus: () => {},
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
  instances.push(marks);
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
    successfulJumps,
    viewer,
    setCurrent: (value: boolean) => {
      current = value;
    },
    supersedePresentation: () => {
      presentationRevision += 1;
    },
    setRefreshPresentation: (value: boolean) => {
      refreshPresentation = value;
    },
    setModuleCurrent: (value: boolean) => {
      moduleCurrent = value;
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

describe('shared persistent reader marks', () => {
  it('serializes interleaved changes across sessions and sibling attachments, including after close', async () => {
    const a = harness();
    const b = harness();
    const c = harness();
    const pending = Promise.withResolvers<void>();
    let saved = '';
    let saves = 0;
    const parent = {
      extra: 'unrelated\nzv-marks-pdf1: {"v":1,"marks":{"z":{"pageIndex":0,"ratio":0,"key":null}}}',
      saveTx: async () => {
        const snapshot = parent.extra;
        if (++saves === 1) await pending.promise;
        saved = snapshot;
      },
    };
    vi.stubGlobal('Zotero', { Items: { get: () => parent } });
    const first = { key: 'pdf1', parentItemID: 900 } as ItemRuntime;
    const second = { key: 'pdf2', parentItemID: 900 } as ItemRuntime;
    vi.spyOn(a.host, 'itemForReader').mockReturnValue(first);
    vi.spyOn(b.host, 'itemForReader').mockReturnValue(first);
    vi.spyOn(c.host, 'itemForReader').mockReturnValue(second);
    const otherReader = { itemID: 11 } as ReaderRuntime;
    for (const test of [a, b, c]) test.host.preferences.set('marks.persist', true);
    a.marks.load(a.reader);
    b.marks.load(b.reader);
    c.marks.load(otherReader);
    const refresh = vi.spyOn(b.host, 'onChange');
    const addA = a.marks.set(a.reader, a.pdfWindow, 'a', null);
    const addB = b.marks.set(b.reader, b.pdfWindow, 'b', null);
    const addOther = c.marks.set(otherReader, c.pdfWindow, 'x', null);
    expect(Object.keys(b.marks.values()).sort()).toEqual(['a', 'b', 'z']);
    expect(refresh).toHaveBeenCalled();
    const removeA = a.marks.delete(a.reader, 'a');
    const addC = b.marks.set(b.reader, b.pdfWindow, 'c', null);
    a.marks.dispose();
    pending.resolve();
    await Promise.all([addA, addB, addOther, removeA, addC]);
    const lines = saved.split('\n');
    const pdf1 = JSON.parse(
      lines.find((line) => line.startsWith('zv-marks-pdf1: '))!.split(': ')[1],
    );
    const pdf2 = JSON.parse(
      lines.find((line) => line.startsWith('zv-marks-pdf2: '))!.split(': ')[1],
    );
    expect(Object.keys(pdf1.marks).sort()).toEqual(['b', 'c', 'z']);
    expect(Object.keys(pdf2.marks)).toEqual(['x']);
    expect(lines).toContain('unrelated');
    await b.marks.clear(b.reader);
    expect(b.marks.values()).toEqual({});
    expect(parent.extra).not.toContain('zv-marks-pdf1: ');
    expect(parent.extra).toContain('zv-marks-pdf2: ');
  });

  it('retains accepted writes when the last subscriber closes before saving', async () => {
    const a = harness();
    const b = harness();
    const pending = Promise.withResolvers<void>();
    const attachment = {
      key: 'attachment',
      extra: '',
      saveTx: () => pending.promise,
    };
    vi.spyOn(a.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    vi.spyOn(b.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    a.host.preferences.set('marks.persist', true);
    b.host.preferences.set('marks.persist', true);
    a.marks.load(a.reader);
    const saving = a.marks.set(a.reader, a.pdfWindow, 'a', null);
    a.marks.dispose();
    b.marks.load(b.reader);
    expect(b.marks.values()).toHaveProperty('a');
    const clearing = b.marks.clear(b.reader);
    const adding = b.marks.set(b.reader, b.pdfWindow, 'b', null);
    pending.resolve();
    await Promise.all([saving, clearing, adding]);
    const payload = JSON.parse(attachment.extra.split('zv-marks-attachment: ')[1]);
    expect(Object.keys(payload.marks)).toEqual(['b']);
  });

  it('propagates clear to another live subscriber before a later add', async () => {
    const a = harness();
    const b = harness();
    const attachment = { key: 'attachment', extra: '', saveTx: async () => undefined };
    vi.spyOn(a.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    vi.spyOn(b.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    a.host.preferences.set('marks.persist', true);
    b.host.preferences.set('marks.persist', true);
    a.marks.load(a.reader);
    b.marks.load(b.reader);
    await a.marks.set(a.reader, a.pdfWindow, 'a', null);
    await b.marks.clear(b.reader);
    expect(a.marks.values()).toEqual({});
    await a.marks.set(a.reader, a.pdfWindow, 'b', null);
    expect(Object.keys(b.marks.values())).toEqual(['b']);
    expect(
      Object.keys(JSON.parse(attachment.extra.split('zv-marks-attachment: ')[1]).marks),
    ).toEqual(['b']);
  });

  it('joins already open readers when persistence is enabled', async () => {
    const a = harness();
    const b = harness();
    const attachment = { key: 'attachment', extra: '', saveTx: async () => undefined };
    vi.spyOn(a.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    vi.spyOn(b.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    a.marks.load(a.reader);
    b.marks.load(b.reader);
    const refresh = vi.spyOn(b.host, 'onChange');
    a.host.preferences.set('marks.persist', true);
    b.host.preferences.set('marks.persist', true);
    expect(refresh).toHaveBeenCalled();
    refresh.mockClear();
    await a.marks.set(a.reader, a.pdfWindow, 'a', null);
    expect(b.marks.values()).toHaveProperty('a');
    expect(refresh).toHaveBeenCalled();
    await expect(b.marks.jump(b.reader, b.pdfWindow, 'a', () => {})).resolves.toBe(true);
  });

  it('rejoins detached readers after persistence is switched back on', async () => {
    const a = harness();
    const b = harness();
    const attachment = { key: 'attachment', extra: '', saveTx: async () => undefined };
    vi.spyOn(a.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    vi.spyOn(b.host, 'itemForReader').mockReturnValue(attachment as ItemRuntime);
    a.host.preferences.set('marks.persist', true);
    b.host.preferences.set('marks.persist', true);
    a.marks.load(a.reader);
    b.marks.load(b.reader);
    await a.marks.set(a.reader, a.pdfWindow, 'a', null);
    a.host.preferences.set('marks.persist', false);
    b.host.preferences.set('marks.persist', false);
    await a.marks.set(a.reader, a.pdfWindow, 'local', null);
    expect(b.marks.values()).not.toHaveProperty('local');
    a.host.preferences.set('marks.persist', true);
    b.host.preferences.set('marks.persist', true);
    const refresh = vi.spyOn(b.host, 'onChange');
    await a.marks.set(a.reader, a.pdfWindow, 'b', null);
    expect(b.marks.values()).toHaveProperty('b');
    expect(refresh).toHaveBeenCalled();
    await expect(b.marks.jump(b.reader, b.pdfWindow, 'b', () => {})).resolves.toBe(true);
  });

  it('keeps marks session-local with persistence disabled', async () => {
    const a = harness();
    const b = harness();
    await a.marks.set(a.reader, a.pdfWindow, 'a', null);
    expect(b.marks.values()).toEqual({});
    await b.marks.set(b.reader, b.pdfWindow, 'b', null);
    await a.marks.clear(a.reader);
    expect(Object.keys(b.marks.values())).toEqual(['b']);
  });
});

describe('ReaderMarks persistence presentation', () => {
  it.each(['set', 'delete', 'clear'] as const)(
    'persists %s after a successor interaction without replacing its status',
    async (operation) => {
      const test = harness();
      await test.marks.set(test.reader, test.pdfWindow, 'a', null);
      test.host.preferences.set('marks.persist', true);
      const pending = Promise.withResolvers<void>();
      let storedExtra = '';
      const attachment: ItemRuntime & { extra: string } = {
        key: 'attachment',
        extra: 'zv-marks-attachment: {"v":1,"marks":{"a":{"pageIndex":1,"ratio":0.15,"key":null}}}',
        saveTx: async () => {
          await pending.promise;
          storedExtra = attachment.extra;
        },
      } as ItemRuntime & { extra: string };
      vi.spyOn(test.host, 'itemForReader').mockReturnValue(attachment);
      const status = vi.spyOn(test.host, 'showStatus');
      test.setRefreshPresentation(true);
      const mutation =
        operation === 'set'
          ? test.marks.set(test.reader, test.pdfWindow, 'b', null)
          : operation === 'delete'
            ? test.marks.delete(test.reader, 'a')
            : test.marks.clear(test.reader);
      test.supersedePresentation();
      test.host.showStatus('successor status');
      pending.resolve();
      await mutation;
      expect(status.mock.calls.map(([message]) => message)).toEqual(['successor status']);
      if (operation === 'set') {
        expect(JSON.parse(storedExtra.split('zv-marks-attachment: ')[1]).marks).toHaveProperty('b');
      } else {
        expect(storedExtra).toBe('');
      }
    },
  );

  it('keeps the refreshed presentation current until another interaction supersedes it', async () => {
    const test = harness();
    test.host.preferences.set('marks.persist', true);
    const pending = Promise.withResolvers<void>();
    vi.spyOn(test.host, 'itemForReader').mockReturnValue({
      key: 'attachment',
      saveTx: () => pending.promise,
    } as ItemRuntime);
    test.setRefreshPresentation(true);
    const status = vi.spyOn(test.host, 'showStatus');
    const mutation = test.marks.set(test.reader, test.pdfWindow, 'a', null);
    pending.resolve();
    await mutation;
    expect(status).toHaveBeenCalledWith(expect.stringContaining('mark a set'), 1200);
  });

  it('completes local fallback after an obsolete delayed extra failure', async () => {
    const test = harness();
    test.host.preferences.set('marks.persist', true);
    const pending = Promise.withResolvers<void>();
    vi.spyOn(test.host, 'itemForReader').mockReturnValue({
      key: 'attachment',
      saveTx: () => pending.promise,
    } as ItemRuntime);
    const status = vi.spyOn(test.host, 'showStatus');
    const mutation = test.marks.set(test.reader, test.pdfWindow, 'a', null);
    test.supersedePresentation();
    test.host.showStatus('successor status');
    pending.reject(new Error('extra unavailable'));
    await mutation;
    expect(JSON.parse(test.host.preferences.get('marks.data.10', '')).marks).toHaveProperty('a');
    expect(status.mock.calls.map(([message]) => message)).toEqual(['successor status']);
  });

  it('suppresses terminal failure and mutation status after a newer interaction', async () => {
    const test = harness();
    test.host.preferences.set('marks.persist', true);
    const pending = Promise.withResolvers<void>();
    vi.spyOn(test.host, 'itemForReader').mockReturnValue({
      key: 'attachment',
      saveTx: () => pending.promise,
    } as ItemRuntime);
    vi.spyOn(test.host.preferences, 'set').mockImplementation(() => {
      throw new Error('preference unavailable');
    });
    const status = vi.spyOn(test.host, 'showStatus');
    const mutation = test.marks.set(test.reader, test.pdfWindow, 'a', null);
    test.supersedePresentation();
    test.host.showStatus('successor status');
    pending.reject(new Error('extra unavailable'));
    await mutation;
    expect(test.marks.values()).toHaveProperty('a');
    expect(status.mock.calls.map(([message]) => message)).toEqual(['successor status']);
  });

  it('does not present terminal persistence failure after a standalone save is superseded', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', null);
    const pending = Promise.withResolvers<void>();
    vi.spyOn(test.host, 'itemForReader').mockReturnValue({
      key: 'attachment',
      saveTx: () => pending.promise,
    } as ItemRuntime);
    vi.spyOn(test.host.preferences, 'set').mockImplementation(() => {
      throw new Error('preference unavailable');
    });
    const status = vi.spyOn(test.host, 'showStatus');
    const saving = test.marks.save(test.reader);
    test.supersedePresentation();
    test.host.showStatus('successor status');
    pending.reject(new Error('extra unavailable'));
    await expect(saving).resolves.toBe('');
    expect(status.mock.calls.map(([message]) => message)).toEqual(['successor status']);
  });
});

describe('ReaderMarks jump behavior', () => {
  it('retires a pending traversal when the module becomes stale even if the jump remains current', async () => {
    const test = harness();
    test.annotations.push({ key: 'legacy', saveTx: vi.fn() });
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'a', 'legacy');
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    const pending = Promise.withResolvers<{ pageIndex: number; ratio: number }>();
    test.setAnnotationPageRatio(() => pending.promise);
    const select = vi.fn();
    const traversal = test.marks.traverse(test.reader, test.pdfWindow, 1, select);
    test.setModuleCurrent(false);
    pending.resolve({ pageIndex: 4, ratio: 0.7 });
    await expect(traversal).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(test.scrollToPageRatio).not.toHaveBeenCalled();
  });

  it('finishes an admitted save and fallback after disposal without restoring in-memory marks', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', null);
    const pending = Promise.withResolvers<void>();
    const attachment = { key: 'attachment', saveTx: () => pending.promise } as ItemRuntime;
    vi.spyOn(test.host, 'itemForReader').mockReturnValue(attachment);
    const saving = test.marks.save(test.reader);
    test.marks.dispose();
    pending.reject(new Error('extra unavailable'));
    await expect(saving).resolves.toBe('local');
    expect(JSON.parse(test.host.preferences.get('marks.data.10', ''))).toMatchObject({
      v: 1,
      marks: { a: { pageIndex: 1, key: null } },
    });
    expect(test.marks.values()).toEqual({});
  });

  it('does not execute a scheduled load retry after disposal', () => {
    const test = harness();
    test.host.preferences.set('marks.persist', true);
    const itemForReader = vi.spyOn(test.host, 'itemForReader').mockReturnValue(null);
    const schedule = vi.spyOn(test.host, 'schedule');
    test.marks.load(test.reader);
    const retry = schedule.mock.calls[0][1];
    test.marks.dispose();
    retry();
    expect(itemForReader).toHaveBeenCalledOnce();
    expect(test.marks.values()).toEqual({});
  });

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
  });

  it.each(['direct', 'next', 'previous'] as const)(
    'uses the saved position and clears selection for a deleted annotation via %s',
    async (path) => {
      const test = harness();
      await test.marks.set(test.reader, test.pdfWindow, 'a', 'deleted-annotation');
      test.setViewport(1, 400);
      const selectAnnotation = vi.fn();

      const moved =
        path === 'direct'
          ? test.marks.jump(test.reader, test.pdfWindow, 'a', selectAnnotation)
          : test.marks.traverse(
              test.reader,
              test.pdfWindow,
              path === 'next' ? 1 : -1,
              selectAnnotation,
            );
      await expect(moved).resolves.toBe(true);

      expect(test.sourceLocations).toEqual([{ pageNumber: 1, scrollTop: 400 }]);
      expect(selectAnnotation).toHaveBeenCalledWith(null);
      expect(test.pageNumber()).toBe(2);
      expect(test.container.scrollTop).toBe(1250);
      expect(test.successfulJumps).toEqual(['jump']);
    },
  );

  it('does not invoke the jump boundary for a missing mark', async () => {
    const test = harness();

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'x', () => {})).resolves.toBe(false);

    expect(test.sourceLocations).toEqual([]);
    expect(test.successfulJumps).toEqual([]);
  });

  it('does not report or record a no-op destination failure', async () => {
    const test = harness();
    await test.marks.set(test.reader, test.pdfWindow, 'a', null);
    test.scrollToPageRatio.mockResolvedValue(false);

    await expect(test.marks.jump(test.reader, test.pdfWindow, 'a', () => {})).resolves.toBe(false);

    expect(test.sourceLocations).toEqual([{ pageNumber: 2, scrollTop: 1150 }]);
    expect(test.successfulJumps).toEqual([]);
  });

  it.each(['floor', 'ceil'] as const)(
    'traverses document order and wraps despite %s-rounded scrolling',
    async (rounding) => {
      const test = harness();
      test.scrollToPageRatio.mockImplementation(async (_window, targetPage, ratio) => {
        test.setViewport(
          targetPage + 1,
          Math[rounding](
            Math.max(0, targetPage * 1000 + ratio * 1000 - test.container.clientHeight / 2),
          ),
        );
        return true;
      });
      Reflect.set(test.pdfWindow.document, 'querySelector', () => ({
        offsetTop: (test.viewer.currentPageNumber - 1) * 1000,
        offsetHeight: 1000,
      }));
      test.setViewport(3, 2250.5);
      await test.marks.set(test.reader, test.pdfWindow, 'a', null);
      test.setViewport(1, 250.5);
      await test.marks.set(test.reader, test.pdfWindow, 'z', null);
      test.setViewport(2, 1250.5);
      await test.marks.set(test.reader, test.pdfWindow, 'm', null);
      test.setViewport(1, 200);
      const firstScrollTop = Math[rounding](250.5);
      await test.marks.traverse(test.reader, test.pdfWindow, 1, () => {});
      expect([test.pageNumber(), test.container.scrollTop]).toEqual([1, firstScrollTop]);
      await test.marks.traverse(test.reader, test.pdfWindow, 1, () => {});
      expect([test.pageNumber(), test.container.scrollTop]).toEqual([2, 1000 + firstScrollTop]);
      await test.marks.traverse(test.reader, test.pdfWindow, 1, () => {});
      expect([test.pageNumber(), test.container.scrollTop]).toEqual([3, 2000 + firstScrollTop]);
      await test.marks.traverse(test.reader, test.pdfWindow, 1, () => {});
      expect([test.pageNumber(), test.container.scrollTop]).toEqual([1, firstScrollTop]);
      await test.marks.traverse(test.reader, test.pdfWindow, -1, () => {});
      expect([test.pageNumber(), test.container.scrollTop]).toEqual([3, 2000 + firstScrollTop]);
      expect(test.sourceLocations).toEqual([
        { pageNumber: 1, scrollTop: 200 },
        { pageNumber: 1, scrollTop: firstScrollTop },
        { pageNumber: 2, scrollTop: 1000 + firstScrollTop },
        { pageNumber: 3, scrollTop: 2000 + firstScrollTop },
        { pageNumber: 1, scrollTop: firstScrollTop },
      ]);
    },
  );

  it('resolves legacy annotation-linked bookmarks for document ordering and fences delayed resolution before selection or scroll', async () => {
    const test = harness();
    test.annotations.push({ key: 'legacy', saveTx: vi.fn() });
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'z', 'legacy');
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    const pending = Promise.withResolvers<{ pageIndex: number; ratio: number }>();
    test.setAnnotationPageRatio(() => pending.promise);
    const select = vi.fn();
    const traversal = test.marks.traverse(test.reader, test.pdfWindow, 1, select);
    test.setCurrent(false);
    pending.resolve({ pageIndex: 4, ratio: 0.7 });
    await expect(traversal).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(test.scrollToPageRatio).not.toHaveBeenCalled();
    expect(test.successfulJumps).toEqual([]);
  });

  it('orders a legacy annotation link by its resolved document position and keeps one managed-final jump', async () => {
    const test = harness();
    test.annotations.push({ key: 'legacy', saveTx: vi.fn() });
    Reflect.deleteProperty(test.pdfWindow, 'PDFViewerApplication');
    await test.marks.set(test.reader, test.pdfWindow, 'a', 'legacy');
    Reflect.set(test.pdfWindow, 'PDFViewerApplication', { pdfViewer: test.viewer });
    const resolve = vi.fn(async () => ({ pageIndex: 4, ratio: 0.7 }));
    test.setAnnotationPageRatio(resolve);
    const select = vi.fn();
    await expect(test.marks.traverse(test.reader, test.pdfWindow, 1, select)).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith('legacy');
    expect(test.pageNumber()).toBe(5);
    expect(test.container.scrollTop).toBe(4700);
    expect(test.successfulJumps).toEqual(['jump']);
    expect(test.sourceLocations).toEqual([{ pageNumber: 2, scrollTop: 1150 }]);
    expect(test.marks.values().a?.pageIndex).toBeNull();
  });

  it('reports no bookmarks without entering the managed jump boundary', async () => {
    const test = harness();
    await expect(test.marks.traverse(test.reader, test.pdfWindow, 1, () => {})).resolves.toBe(
      false,
    );
    expect(test.sourceLocations).toEqual([]);
  });
});
