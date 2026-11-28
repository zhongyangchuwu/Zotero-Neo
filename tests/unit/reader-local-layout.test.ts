import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRect } from '../../src/document-analysis/contracts';
import { documentCaptionIdentity } from '../../src/document-analysis/local-rules';
import { ReaderLocalLayout } from '../../src/reader/local-layout';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';

const OPS = { constructPath: 1, fill: 2 };
const PANELS: readonly DocumentRect[] = [
  [50, 420, 210, 620],
  [370, 420, 550, 620],
];
const PROSE = 'This section describes ordinary body text without any artwork.';

function item(str: string, x: number, bottom: number, width: number, size = 10) {
  return {
    str,
    width,
    fontName: 'f1',
    transform: [size, 0, 0, size, x, bottom + size * 0.2],
  };
}

function page(items = [item(PROSE, 50, 700, 465)], graphics: readonly DocumentRect[] = []) {
  return {
    view: [0, 0, 600, 800],
    getTextContent: vi.fn(async () => ({ items, styles: {} })),
    getOperatorList: vi.fn(async () => ({
      fnArray: graphics.map(() => OPS.constructPath),
      argsArray: graphics.map((bounds) => [OPS.fill, [], bounds]),
    })),
    cleanup: vi.fn(() => true),
  };
}

function harness(
  pages: readonly ReturnType<typeof page>[],
  importGlobalProperties?: (names: string[]) => void,
) {
  const bytes = new Uint8Array([12, 34]);
  const getData = vi.fn(async () => bytes);
  const getPage = vi.fn(async (number: number) => {
    const selected = pages[number - 1];
    if (!selected) throw new Error(`Unexpected page ${number}`);
    return selected;
  });
  const destroy = vi.fn(async () => {});
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: pages.length, getPage }),
    destroy,
  }));
  const sdt = vi.fn();
  vi.stubGlobal('Zotero', { SDT: { getReader: sdt } });
  vi.stubGlobal('Components', {
    utils: {
      cloneInto: (value: object) => value,
      waiveXrays: (value: object) => value,
      importGlobalProperties,
    },
  });
  vi.stubGlobal('ChromeUtils', {
    importESModule: () => ({ OPS, GlobalWorkerOptions: {}, getDocument }),
  });
  const pdf = { numPages: pages.length, fingerprints: ['live-fingerprint', null], getData };
  let visible = [1];
  let splitVisible = [2];
  const app = {
    pdfDocument: pdf,
    pdfViewer: { _getVisiblePages: () => ({ views: visible.map((id) => ({ id })) }) },
  };
  const primary = { document: {}, PDFViewerApplication: app } as unknown as PdfWindow;
  const overlay = { document: {} } as PdfWindow;
  const secondaryApp = {
    pdfDocument: { ...pdf },
    pdfViewer: { _getVisiblePages: () => ({ views: splitVisible.map((id) => ({ id })) }) },
  };
  const secondary = { document: {}, PDFViewerApplication: secondaryApp } as unknown as PdfWindow;
  const internal = {
    _primaryView: { _iframeWindow: primary },
    _secondaryView: { _iframeWindow: secondary },
  };
  let nextTask = 0;
  const tasks = new Set<number>();
  const schedule = (callback: () => void): number => {
    const id = ++nextTask;
    tasks.add(id);
    queueMicrotask(() => {
      if (tasks.delete(id)) callback();
    });
    return id;
  };
  const host = {
    Function,
    requestAnimationFrame: schedule,
    cancelAnimationFrame: (id: number) => tasks.delete(id),
    setTimeout: schedule,
    clearTimeout: (id: number) => tasks.delete(id),
  };
  const reader = { _window: host, _internalReader: internal, itemID: 21 } as ReaderRuntime;
  return {
    layout: new ReaderLocalLayout(reader),
    host,
    bytes,
    getData,
    getPage,
    getDocument,
    destroy,
    sdt,
    primary,
    secondary,
    overlay,
    show: (...pages: number[]) => {
      visible = pages;
    },
    showSplit: (...pages: number[]) => {
      splitVisible = pages;
    },
    reflow: () => Reflect.set(internal, '_primarySDTView', { _iframeWindow: overlay }),
    replacePdf: () => {
      app.pdfDocument = { ...pdf };
    },
    replaceSplitPdf: () => {
      secondaryApp.pdfDocument = { ...pdf, fingerprints: ['different-pdf', null] };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Reader-local PDF layout', () => {
  it('opens and releases the extraction document from a Bootstrap scope without DOM globals', async () => {
    const GeckoAbortController = AbortController;
    vi.stubGlobal('AbortController', undefined);
    const t = harness([page()], (names) => {
      if (names.includes('AbortController')) vi.stubGlobal('AbortController', GeckoAbortController);
    });
    await t.layout.ensureVisible(t.primary);
    expect(t.getPage).toHaveBeenCalledWith(1);
    t.layout.dispose();
    expect(t.destroy).toHaveBeenCalledOnce();
  });

  it('reads text on every page and operators only on caption candidates, then reuses the scan', async () => {
    const prose = page([item(PROSE, 50, 700, 465)], [[50, 500, 300, 630]]);
    // PDF.js can emit one visual line as several runs and in unrelated stream order.
    const figure = page(
      [
        item(' 2', 79, 390, 12),
        item('re', 69, 390, 10),
        item(': (a) Reference observations and (b) reconstructed observations.', 91, 390, 459),
        item('Fi', 50, 390, 9),
        item('gu', 59, 390, 10),
        item('(a)', 60, 600, 20, 9),
        item('(b)', 380, 600, 20, 9),
      ],
      PANELS,
    );
    const table = page([item('Table ', 50, 635, 30), item('IV: Reference results.', 80, 635, 200)]);
    const chinese = page([item('图', 50, 390, 10), item('二：流程', 60, 390, 55)]);
    const t = harness([prose, figure, table, chinese]);
    expect(t.layout.visibleRegions(t.primary)).toEqual([]);
    expect(t.getData).not.toHaveBeenCalled();
    const scanning = t.layout.figures();
    expect(t.layout.figures()).toBe(scanning);
    const regions = await scanning;
    const labels = regions
      .filter((region) => region.kind === 'caption')
      .map((caption) => documentCaptionIdentity(caption.text));
    expect(labels).toEqual([
      { kind: 'figure', label: '2' },
      { kind: 'table', label: 'IV' },
      { kind: 'figure', label: '二' },
    ]);
    const images = regions.filter((region) => region.kind === 'image');
    expect(images.map((region) => region.rect)).toEqual(
      PANELS.map((panel) => panel.map((coordinate) => expect.closeTo(coordinate, 0))),
    );
    expect(t.getPage.mock.calls).toEqual([[1], [2], [3], [4]]);
    expect(prose.getOperatorList).not.toHaveBeenCalled();
    for (const source of [prose, figure, table, chinese]) {
      expect(source.getTextContent).toHaveBeenCalledOnce();
      expect(source.cleanup).toHaveBeenCalledOnce();
    }
    for (const source of [figure, table, chinese])
      expect(source.getOperatorList).toHaveBeenCalledOnce();
    expect(await t.layout.figures()).toBe(regions);
    t.show(2);
    await t.layout.ensureVisible(t.primary);
    expect(figure.getOperatorList).toHaveBeenCalledOnce();
    expect(t.layout.visibleRegions(t.primary).some((region) => region.kind === 'image')).toBe(true);
    expect(t.getData).toHaveBeenCalledOnce();
    expect(t.getDocument).toHaveBeenCalledExactlyOnceWith({
      data: t.bytes,
      disableFontFace: true,
      isEvalSupported: false,
      wasmUrl: 'resource://zotero/reader/pdf/web/wasm/',
    });
    expect(t.sdt).not.toHaveBeenCalled();
    t.layout.dispose();
    expect(t.destroy).toHaveBeenCalledOnce();
  });

  it('loads only visible selections, gives explicit body and exclusion evidence, and checks splits and reflow', async () => {
    const prose = page(
      [
        item(PROSE, 60, 700, 460),
        item('1', 300, 10, 8),
        item('Input', 60, 500, 30),
        item('Output', 200, 450, 40),
      ],
      [[50, 420, 280, 550]],
    );
    const other = page([item('Another page of actual text.', 50, 690, 210)]);
    const t = harness([prose, other]);
    await Promise.all([t.layout.ensureVisible(t.primary), t.layout.ensureVisible(t.primary)]);
    expect(t.getPage.mock.calls).toEqual([[1]]);
    const result = t.layout.visibleRegions(t.primary);
    expect(result.map(({ text, flow }) => [text, flow])).toEqual([
      [PROSE, 'body'],
      ['Input', 'excluded'],
      ['Output', 'excluded'],
      ['1', 'excluded'],
    ]);
    expect(t.layout.visibleRegions(t.primary)).toBe(result);
    expect(t.layout.visibleRegions(t.primary, [1])).toBe(result);
    expect(t.layout.visibleRegions(t.secondary)).toEqual([]);
    await t.layout.ensureVisible(t.secondary);
    expect(other.getOperatorList).toHaveBeenCalledOnce();
    t.replaceSplitPdf();
    expect(t.layout.visibleRegions(t.secondary)).toEqual([]);
    t.reflow();
    expect(t.layout.visibleRegions(t.primary)).toEqual([]);
    expect(t.layout.visibleRegions(t.overlay)).toEqual([]);
    await t.layout.ensureVisible(t.overlay, [0, 1]);
    expect(t.layout.visibleRegions(t.overlay, [1, 0]).map((region) => region.pageIndex)).toEqual([
      0, 0, 0, 0, 1,
    ]);
    expect(t.getPage.mock.calls).toEqual([[1], [2]]);
    t.layout.dispose();
  });

  it('coalesces in-flight caption and visible demand for one page', async () => {
    const source = page([item('Table IV: Results', 50, 635, 160)]);
    const t = harness([source]);
    const started = Promise.withResolvers<void>();
    const operators = Promise.withResolvers<{ fnArray: number[]; argsArray: never[] }>();
    source.getOperatorList.mockImplementationOnce(() => {
      started.resolve();
      return operators.promise;
    });
    const scan = t.layout.figures();
    await started.promise;
    const visible = t.layout.ensureVisible(t.primary);
    operators.resolve({ fnArray: [], argsArray: [] });
    const [captions] = await Promise.all([scan, visible]);
    expect(captions.map((region) => region.text)).toEqual(['Table IV: Results']);
    expect(t.layout.visibleRegions(t.primary)[0]).toBe(captions[0]);
    expect(source.getTextContent).toHaveBeenCalledOnce();
    expect(source.getOperatorList).toHaveBeenCalledOnce();
    t.layout.dispose();
  });

  it('drops obsolete viewport work rather than extracting operators after a scroll', async () => {
    const first = page();
    const second = page();
    const t = harness([first, second]);
    const started = Promise.withResolvers<void>();
    const textPending = Promise.withResolvers<{
      items: ReturnType<typeof item>[];
      styles: object;
    }>();
    first.getTextContent.mockImplementationOnce(() => {
      started.resolve();
      return textPending.promise;
    });
    const original = t.layout.ensureVisible(t.primary);
    await started.promise;
    t.show(2);
    const visible = t.layout.ensureVisible(t.primary);
    textPending.resolve({ items: [item(PROSE, 50, 700, 465)], styles: {} });
    await Promise.all([original, visible]);
    expect(first.getOperatorList).not.toHaveBeenCalled();
    expect(second.getOperatorList).toHaveBeenCalledOnce();
    expect(t.layout.visibleRegions(t.primary).map((region) => region.pageIndex)).toEqual([1]);
    t.layout.dispose();
  });

  it('limits admission to the two most visible pages and preserves readiness for empty geometry', async () => {
    const t = harness([page([]), page(), page()]);
    t.show(3, 1, 2);
    const cold = t.layout.visibleSnapshot(t.primary)!;
    expect(cold.pages).toEqual([2, 0]);
    expect(cold.ready.size).toBe(0);
    await t.layout.prepareVisiblePage(t.primary, 1);
    expect(t.getPage).not.toHaveBeenCalled();
    await t.layout.prepareVisiblePage(t.primary, 0);
    const partial = t.layout.visibleSnapshot(t.primary)!;
    expect(partial).not.toBe(cold);
    expect(partial.ready.get(0)).toEqual([]);
    expect(partial.ready.has(2)).toBe(false);
    await t.layout.prepareVisiblePage(t.secondary, 1);
    t.show(1, 3, 2);
    expect(t.layout.visibleSnapshot(t.primary)).toBe(partial);

    await t.layout.prepareVisiblePage(t.primary, 2);
    expect(t.layout.visibleSnapshot(t.primary)?.ready.size).toBe(2);
    expect(t.getPage.mock.calls).toEqual([[1], [2], [3]]);
    t.show(2, 1, 3);
    expect(t.layout.visibleSnapshot(t.primary)?.ready.has(1)).toBe(true);
    t.layout.dispose();
  });

  it('does not cache geometry completed after the exact warm viewport is retired', async () => {
    const source = page();
    const t = harness([source, page()]);
    const started = Promise.withResolvers<void>();
    const operators = Promise.withResolvers<{ fnArray: number[]; argsArray: never[] }>();
    source.getOperatorList.mockImplementationOnce(() => {
      started.resolve();
      return operators.promise;
    });
    let wanted = true;
    const old = t.layout.prepareVisiblePage(t.primary, 0, undefined, () => wanted);
    await started.promise;
    wanted = false;
    t.show(2);
    await t.layout.prepareVisiblePage(t.primary, 1);
    operators.resolve({ fnArray: [], argsArray: [] });
    await old;
    t.show(1);
    expect(t.layout.visibleSnapshot(t.primary)?.ready.has(0)).toBe(false);
    await t.layout.prepareVisiblePage(t.primary, 0);
    expect(t.layout.visibleSnapshot(t.primary)?.ready.has(0)).toBe(true);
    expect(t.getPage.mock.calls).toEqual([[1], [2], [1]]);
    t.layout.dispose();
  });

  it('lets explicit caption navigation take over when a warmer is waiting for idle', async () => {
    const source = page([item('Figure 1: Overview', 50, 380, 200)]);
    const t = harness([source]);
    const idleRequested = Promise.withResolvers<void>();
    Reflect.set(t.host, 'requestIdleCallback', () => {
      idleRequested.resolve();
      return 1;
    });
    const cancelIdle = vi.fn();
    Reflect.set(t.host, 'cancelIdleCallback', cancelIdle);
    const warming = t.layout.prepareVisiblePage(t.primary, 0);
    await idleRequested.promise;
    expect(t.layout.visibleSnapshot(t.primary)?.ready.has(0)).toBe(false);
    const [captions] = await Promise.all([t.layout.figures(), warming]);
    expect(captions.map((caption) => caption.text)).toEqual(['Figure 1: Overview']);
    expect(t.layout.visibleSnapshot(t.primary)?.ready.has(0)).toBe(true);
    expect(source.getTextContent).toHaveBeenCalledOnce();
    expect(source.getOperatorList).toHaveBeenCalledOnce();
    expect(cancelIdle).toHaveBeenCalledOnce();
    t.layout.dispose();
  });

  it('keeps a visible admission snapshot current even when offscreen work evicts its LRU entry', async () => {
    const t = harness(Array.from({ length: 18 }, () => page()));
    await t.layout.prepareVisiblePage(t.primary, 0);
    const held = t.layout.visibleSnapshot(t.primary);
    expect(held?.ready.get(0)).toHaveLength(1);
    for (let page = 2; page <= 18; page++) {
      t.showSplit(page);
      await t.layout.ensureVisible(t.secondary);
    }
    expect(t.layout.visibleRegions(t.primary)).toEqual([]);
    expect(t.layout.visibleSnapshot(t.primary)).toBe(held);
    t.layout.dispose();
  });

  it('evicts least-recently used geometry instead of collecting every visited page', async () => {
    const t = harness(Array.from({ length: 17 }, () => page()));
    for (let number = 1; number <= 16; number++) {
      t.show(number);
      await t.layout.ensureVisible(t.primary);
    }
    t.show(1);
    await t.layout.ensureVisible(t.primary);
    expect(t.getPage).toHaveBeenCalledTimes(16);
    t.show(17);
    await t.layout.ensureVisible(t.primary);
    t.show(1);
    expect(t.layout.visibleRegions(t.primary)).toHaveLength(1);
    t.show(2);
    expect(t.layout.visibleRegions(t.primary)).toEqual([]);
    await t.layout.ensureVisible(t.primary);
    expect(t.getPage.mock.calls.slice(-2)).toEqual([[17], [2]]);
    t.layout.dispose();
  });

  it.each(['dispose', 'replace'] as const)(
    'does not publish late results after %s',
    async (cause) => {
      const first = page([item('Figure 1: Overview', 50, 380, 200)]);
      const later = page();
      const t = harness([first, later]);
      const started = Promise.withResolvers<void>();
      const operators = Promise.withResolvers<{ fnArray: number[]; argsArray: never[] }>();
      first.getOperatorList.mockImplementationOnce(() => {
        started.resolve();
        return operators.promise;
      });
      const scanning = t.layout.figures();
      await started.promise;
      if (cause === 'dispose') t.layout.dispose();
      else {
        t.replacePdf();
        expect(t.layout.isCurrent()).toBe(false);
      }
      await expect(scanning).resolves.toEqual([]);
      expect(t.destroy).toHaveBeenCalledOnce();
      operators.resolve({ fnArray: [], argsArray: [] });
      await operators.promise;
      expect(t.layout.visibleRegions(t.primary)).toEqual([]);
      expect(later.getTextContent).not.toHaveBeenCalled();
      t.layout.dispose();
      expect(t.destroy).toHaveBeenCalledOnce();
    },
  );
});
