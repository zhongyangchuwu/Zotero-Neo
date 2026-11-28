import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyTextAdmission } from '../../src/modules/reader-selection/body-text';
import {
  ReaderBodySelection,
  type BodySelectionHost,
} from '../../src/modules/reader-selection/body-selection';
import {
  beginReaderTextSelection,
  captureReaderTextAdmission,
  leaseReaderTextAdmission,
  readerSelectedTextRanges,
  readerSelectionIsFiltered,
  readerSelectionText,
  readerTextNodeAllowed,
  validateReaderSelection,
} from '../../src/toolkit/reader/text-admission';
import { leaseReaderPresentation } from '../../src/toolkit/reader/presentation';
import { computeSelectionPosition } from '../../src/toolkit/reader/selection-geometry';
import { readerTextBoundaryPosition, readerTextSpans } from '../../src/toolkit/reader/text-source';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import type { ReaderVisibleLayout } from '../../src/reader/local-layout';
import { textAdmissionFixture } from '../fixtures/reader-text-admission';
const originalComponents = Reflect.get(globalThis, 'Components');
beforeEach(() => Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } }));
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});
const chart: DocumentRegion = {
  id: 'chart',
  kind: 'image',
  pageIndex: 0,
  rect: [95, 765, 155, 785],
  text: '',
  format: 'text',
  flow: 'auxiliary',
  anchorPrecision: 'region',
};

function bodyHost(layout: BodySelectionHost['layout']): BodySelectionHost {
  return {
    layout,
    isCurrent: () => true,
    captureView: () => () => true,
    debug: vi.fn(),
  };
}

function selectionFixture(reading = false) {
  const t = textAdmissionFixture(reading);
  const root = t.document.documentElement;
  const styles = new Set<object>();
  Reflect.set(root, 'appendChild', (style: object) => styles.add(style));
  Reflect.set(t.document, 'createElement', () => ({
    setAttribute: () => {},
    remove() {
      styles.delete(this);
    },
  }));

  let marker: object | null = {};
  const layer = { querySelector: () => marker };
  const [firstPage] = Reflect.get(t.window, 'PDFViewerApplication').pdfViewer._pages;
  Reflect.set(firstPage, 'div', { querySelector: () => layer });
  let layerNodes = t.nodes;
  const createTreeWalker = t.document.createTreeWalker.bind(t.document);
  Reflect.set(t.document, 'createTreeWalker', (node: Node, flags: number) => {
    if (node !== (layer as unknown as Node)) return createTreeWalker(node, flags);
    let index = 0;
    return { nextNode: () => layerNodes[index++] ?? null };
  });
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  Reflect.set(t.window, 'requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++next, fn);
    return next;
  });
  Reflect.set(t.window, 'cancelAnimationFrame', (id: number) => frames.delete(id));
  Reflect.set(t.window, 'setTimeout', (fn: () => void) => {
    timers.set(++next, fn);
    return next;
  });
  Reflect.set(t.window, 'clearTimeout', (id: number) => timers.delete(id));
  const frame = (): void => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  };
  const afterPaint = (): void => {
    const callbacks = [...timers.values()];
    timers.clear();
    for (const callback of callbacks) callback();
  };
  return {
    ...t,
    styles,
    frame,
    afterPaint,
    paint: () => {
      frame();
      afterPaint();
    },
    render: (complete = true) => {
      marker = complete ? {} : null;
    },
    renderedNodes: (nodes: Text[]) => {
      layerNodes = nodes;
    },
  };
}

function layoutFixture(regions?: readonly DocumentRegion[]) {
  let snapshot: ReaderVisibleLayout = {
    pages: [0],
    ready: new Map(regions ? [[0, regions]] : []),
  };
  let current = true;
  const layout = {
    ensureVisible: vi.fn(async () => {}),
    visibleRegions: () => [],
    visibleSnapshot: vi.fn(() => snapshot),
    isCurrent: () => current,
    prepareVisiblePage: vi.fn<BodySelectionHost['layout']['prepareVisiblePage']>(async () => {}),
  } satisfies BodySelectionHost['layout'];
  return {
    layout,
    publish: (next: ReaderVisibleLayout) => {
      snapshot = next;
    },
    retire: () => {
      current = false;
    },
  };
}

describe('body text admission', () => {
  it('keeps body text in overlapping exclusion boxes and never expands a mask to an object group', () => {
    const accepts = bodyTextAdmission([
      {
        ...chart,
        id: 'table',
        kind: 'table',
        rect: [90, 740, 160, 790],
        sourceObject: { id: 'table:1', kind: 'table' },
      },
      {
        ...chart,
        id: 'caption',
        kind: 'caption',
        rect: [90, 700, 160, 720],
        sourceObject: { id: 'table:1', kind: 'table' },
      },
      { ...chart, id: 'body', kind: 'text', flow: 'body', rect: [95, 750, 155, 760] },
    ]);
    expect(accepts({ pageIndex: 0, rect: [100, 751, 150, 759], sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: 0, rect: [100, 725, 150, 735], sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: 0, rect: [100, 770, 150, 780], sourceBlockId: null })).toBe(false);
  });

  it('excludes a rotated label by its local ink and leaves unmapped Reading Mode identity open', () => {
    const margin = { ...chart, kind: 'text' as const, flow: 'excluded' as const };
    const accepts = bodyTextAdmission([
      { ...margin, rect: [17, 248, 37, 257] },
      { ...margin, rect: [17, 257, 37, 263.7] },
    ]);
    expect(accepts({ pageIndex: 0, rect: [70, 430, 520, 440], sourceBlockId: null })).toBe(true);
    expect(
      accepts({
        pageIndex: 0,
        rect: [15, 248, 39, 263.7],
        sourceBlockId: null,
        vertical: true,
      }),
    ).toBe(false);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: 'native:0' })).toBe(true);
  });

  it('refuses a filtered snapshot after source change, lease replacement, selection change or view retirement', async () => {
    const t = selectionFixture();
    const pending = Promise.withResolvers<boolean>();
    let validate: () => boolean | Promise<boolean> = () => true;
    const release = leaseReaderTextAdmission(
      t.window,
      bodyTextAdmission([chart]),
      () => true,
      () => validate(),
    );
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    validate = () => pending.promise;
    const checking = validateReaderSelection(t.window);
    const successor = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    pending.resolve(true);
    expect(await checking).toBe(false);
    expect(readerSelectionIsFiltered(t.window)).toBe(true);
    release();
    successor();
    end();
    validate = () => true;
    const failed = leaseReaderTextAdmission(
      t.window,
      bodyTextAdmission([chart]),
      () => true,
      () => validate(),
    );
    const endFailed = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    validate = () => false;
    expect(await validateReaderSelection(t.window)).toBe(false);
    expect(t.styles.size).toBe(0);
    endFailed();
    failed();
    let current = true;
    validate = () => true;
    const retired = leaseReaderTextAdmission(
      t.window,
      bodyTextAdmission([chart]),
      () => current,
      () => validate(),
    );
    const endRetired = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    validate = () => {
      current = false;
      return true;
    };
    expect(await validateReaderSelection(t.window)).toBe(false);
    endRetired();
    retired();
    validate = () => true;
    const changed = leaseReaderTextAdmission(
      t.window,
      bodyTextAdmission([chart]),
      () => true,
      () => validate(),
    );
    const endChanged = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    validate = () => {
      Reflect.set(t.selection, 'focusOffset', 1);
      return true;
    };
    expect(await validateReaderSelection(t.window)).toBe(false);
    endChanged();
    changed();
  });

  it.each(['source', 'layout'] as const)(
    'refuses a filtered write when its %s changes before the next viewport refresh',
    async (changed) => {
      const t = selectionFixture();
      const { layout, publish, retire } = layoutFixture([chart]);
      const owner = new ReaderBodySelection(bodyHost(layout));
      owner.refreshLayout(t.window);
      t.paint();
      const held = captureReaderTextAdmission(t.window)!;
      const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
      expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(false);
      expect(await validateReaderSelection(t.window)).toBe(true);

      t.render();
      owner.refreshLayout(t.window);
      t.paint();
      expect(held.current()).toBe(true);
      expect(await validateReaderSelection(t.window)).toBe(true);
      if (changed === 'source') retire();
      else publish({ pages: [1], ready: new Map() });
      expect(held.current()).toBe(false);
      expect(await validateReaderSelection(t.window)).toBe(false);
      expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
      end();
      owner.dispose();
    },
  );
  it('resolves an element caret across excluded text to the next or previous admitted edge', () => {
    const t = selectionFixture();
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    const boundary = { nodeType: 1 } as Node;
    expect(readerTextBoundaryPosition(t.window, boundary, 1, 'forward')).toEqual({
      textNode: t.nodes[2],
      offset: 0,
    });
    expect(readerTextBoundaryPosition(t.window, boundary, 2, 'backward')).toEqual({
      textNode: t.nodes[0],
      offset: 5,
    });
    end();
    release();
  });
  it('excludes chart and margin text while keeping body formulas and unknown source geometry', () => {
    const accepts = bodyTextAdmission([
      chart,
      {
        ...chart,
        id: 'formula',
        kind: 'formula',
        rect: [0, 0, 50, 20],
      },
    ]);
    expect(accepts({ pageIndex: 0, rect: [100, 770, 150, 780], sourceBlockId: null })).toBe(false);
    expect(accepts({ pageIndex: 0, rect: [0, 0, 50, 20], sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: 1, rect: chart.rect, sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: 'native:1' })).toBe(true);
    expect(accepts({ pageIndex: 0, rect: [NaN, 770, 150, 780], sourceBlockId: null })).toBe(true);
    const excluded = bodyTextAdmission([{ ...chart, kind: 'text', flow: 'excluded' }]);
    expect(excluded({ pageIndex: 0, rect: chart.rect, sourceBlockId: null })).toBe(false);
    expect(accepts({ pageIndex: 0, rect: [140, 770, 200, 780], sourceBlockId: null })).toBe(true);
    // Leading extends beyond native ink, but the center and text column still match.
    expect(accepts({ pageIndex: 0, rect: [100, 760, 150, 790], sourceBlockId: null })).toBe(false);
    const footer = bodyTextAdmission([
      { ...chart, kind: 'footer', flow: 'excluded', rect: [303.51, 39.96, 308.49, 48.6] },
    ]);
    expect(
      footer({ pageIndex: 0, rect: [303.486, 38.091, 309.057, 52], sourceBlockId: null }),
    ).toBe(false);
  });

  it('restores owned attributes, contains stale callbacks, and does not let old cleanup retire a successor', () => {
    const t = textAdmissionFixture();
    let current = true;
    t.elements[1]!.setAttribute('data-zv-text-excluded', 'external');
    const first = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => current);
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBe('external');
    current = false;
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    const second = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    first();
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBe('external');
    second();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBe('external');
  });

  it('restores detached text before pruning so a recycled page cannot inherit an old marker', () => {
    const t = textAdmissionFixture();
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    readerTextNodeAllowed(t.window, t.nodes[1]!);
    Reflect.set(t.elements[1]!, 'isConnected', false);
    for (let i = 0; i < 128; i++) readerTextNodeAllowed(t.window, t.nodes[0]!);
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
    Reflect.set(t.elements[1]!, 'isConnected', true);
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBeNull();
    release();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
  });

  it('filters text and annotation geometry together, but leaves Normal-mode native selection unchanged', () => {
    const t = selectionFixture();
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    expect(readerTextSpans(t.window).map((span) => span.text)).toEqual(['alpha', 'CHART', 'omega']);
    expect(readerSelectionIsFiltered(t.window)).toBe(false);
    expect(readerSelectionText(t.window, t.selection)).toBe('alphaCHARTomega');
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    expect(readerTextSpans(t.window).map((span) => span.text)).toEqual(['alpha', 'omega']);
    expect(readerSelectionText(t.window, t.selection)).toBe('alpha omega');
    expect(readerSelectedTextRanges(t.window, t.selection)).toHaveLength(2);
    const computed = computeSelectionPosition(t.window, t.selection)!;
    expect(JSON.parse(computed.position!)).toEqual({
      pageIndex: 0,
      rects: [
        [10, 780, 50, 790],
        [10, 760, 50, 770],
      ],
    });
    end();
    const native = computeSelectionPosition(t.window, t.selection)!;
    expect(JSON.parse(native.position!).rects).toHaveLength(3);
    release();
  });

  it('merges every admitted Reading Mode fragment and rejects partial native mapping', () => {
    const t = selectionFixture(true);
    const release = leaseReaderTextAdmission(
      t.window,
      (source) => source.sourceBlockId !== 'native:1',
      () => true,
    );
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    const mapping = vi.fn((range: Range) => ({
      position: {
        pageIndex: 0,
        rects: [range.startContainer === t.nodes[0] ? [10, 780, 50, 790] : [10, 760, 50, 770]],
      },
      sortIndex: range.startContainer === t.nodes[0] ? '00000|00001|00010' : '00000|00003|00030',
      pageLabel: 'i',
    }));
    const unlease = leaseReaderPresentation(
      t.window,
      { getAnnotationFromRange: mapping },
      () => true,
    );
    const result = computeSelectionPosition(t.window, t.selection)!;
    expect(mapping).toHaveBeenCalledTimes(2);
    expect(JSON.parse(result.position!).rects).toHaveLength(2);
    expect(result.pageLabel).toBe('i');
    mapping.mockImplementationOnce(() => null as never);
    expect(computeSelectionPosition(t.window, t.selection)).toMatchObject({
      position: null,
      failure: 'invalid-geometry',
    });
    const mapped = (pageIndex: number, nextPageRects?: number[][]) => ({
      position: {
        pageIndex,
        rects: [[10, 10, 50, 20]],
        ...(nextPageRects ? { nextPageRects } : {}),
      },
      sortIndex: `${pageIndex}|00001|00010`,
      pageLabel: String(pageIndex + 1),
    });
    mapping.mockImplementationOnce(() => mapped(0)).mockImplementationOnce(() => mapped(2));
    expect(computeSelectionPosition(t.window, t.selection)).toMatchObject({
      position: null,
      failure: 'unsupported-page-span',
    });
    mapping
      .mockImplementationOnce(() => mapped(0, [[10, 10, 50, 20]]))
      .mockImplementationOnce(() => mapped(2));
    expect(computeSelectionPosition(t.window, t.selection)).toMatchObject({
      position: null,
      failure: 'unsupported-page-span',
    });
    unlease();
    end();
    release();
  });

  it('waits for rendered text and a paint, coalesces scroll, and never takes over a cold gesture', async () => {
    const t = selectionFixture();
    t.render(false);
    const { layout, publish } = layoutFixture();
    const pending = Promise.withResolvers<void>();
    layout.prepareVisiblePage.mockReturnValueOnce(pending.promise);
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    owner.refreshLayout(t.window);
    expect(layout.visibleSnapshot).not.toHaveBeenCalled();
    t.frame();
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();
    t.afterPaint();
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();

    t.render();
    owner.refreshLayout(t.window);
    t.frame();
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();
    t.afterPaint();
    expect(layout.prepareVisiblePage).toHaveBeenCalledOnce();
    expect(beginReaderTextSelection(t.window, t.nodes[0]!)).toBeNull();
    for (let i = 0; i < 5; i++) owner.refreshLayout(t.window);
    t.paint();
    expect(layout.prepareVisiblePage).toHaveBeenCalledOnce();
    publish({ pages: [0], ready: new Map([[0, [chart]]]) });
    pending.resolve();
    await pending.promise;
    t.paint();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBeNull();
    expect(t.styles.size).toBe(0);
    expect(readerSelectionText(t.window, t.selection)).toBe('alphaCHARTomega');
    expect(beginReaderTextSelection(t.window, t.nodes[1]!)).toBeNull();
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    expect(readerSelectionText(t.window, t.selection)).toBe('alpha omega');
    end();
    owner.dispose();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
  });

  it('retires pending work for a page left behind and admits only the replacement page', async () => {
    const t = selectionFixture();
    const pages = Reflect.get(t.window, 'PDFViewerApplication').pdfViewer._pages;
    pages.push({ ...pages[0] });
    const { layout, publish } = layoutFixture();
    const pending = Promise.withResolvers<void>();
    layout.prepareVisiblePage
      .mockReturnValueOnce(pending.promise)
      .mockImplementationOnce(async () => {
        publish({ pages: [1], ready: new Map([[1, []]]) });
      });
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    publish({ pages: [1], ready: new Map() });
    owner.refreshLayout(t.window);
    t.paint();
    expect(layout.prepareVisiblePage).toHaveBeenCalledOnce();
    expect(layout.prepareVisiblePage.mock.calls[0]?.[3]?.()).toBe(false);

    pending.resolve();
    await pending.promise;
    t.paint();
    await Promise.resolve();
    t.paint();
    const held = captureReaderTextAdmission(t.window)!;
    const ink = { rect: chart.rect, sourceBlockId: null };
    expect(held.ready({ ...ink, pageIndex: 0 })).toBe(false);
    expect(held.ready({ ...ink, pageIndex: 1 })).toBe(true);
    expect(held.current()).toBe(true);
    owner.dispose();
  });

  it('cancels an exact view before paint and cannot publish afterward from a retired request', async () => {
    const t = selectionFixture();
    const { layout, publish } = layoutFixture();
    const pending = Promise.withResolvers<void>();
    layout.prepareVisiblePage.mockReturnValueOnce(pending.promise);
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.frame();
    owner.releaseView(t.window);
    t.afterPaint();
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();

    owner.refreshLayout(t.window);
    t.paint();
    expect(layout.prepareVisiblePage).toHaveBeenCalledOnce();
    owner.releaseView(t.window);
    expect(layout.prepareVisiblePage.mock.calls[0]?.[3]?.()).toBe(false);
    publish({ pages: [0], ready: new Map([[0, [chart]]]) });
    pending.resolve();
    await pending.promise;
    t.paint();
    expect(captureReaderTextAdmission(t.window)).toBeNull();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();

    owner.refreshLayout(t.window);
    t.paint();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBeNull();
    owner.dispose();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
  });

  it('treats computed empty geometry as ready without masking or rescanning the page', () => {
    const t = selectionFixture();
    const { layout } = layoutFixture([]);
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    const end = beginReaderTextSelection(t.window, t.nodes[0]!);
    expect(end).not.toBeNull();
    expect(t.elements.every((element) => !element.getAttribute('data-zv-text-excluded'))).toBe(
      true,
    );
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();
    end?.();
    owner.dispose();
  });

  it('yields between chunks before marking text near the end of a large painted layer', () => {
    const t = selectionFixture();
    t.renderedNodes([...Array<Text>(500).fill(t.nodes[0]!), t.nodes[1]!]);
    const { layout } = layoutFixture([chart]);
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
    for (let i = 0; i < 5; i++) t.paint();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBeNull();
    owner.dispose();
  });

  it('keeps unmapped native Reading Mode text selectable without requesting layout', () => {
    const t = selectionFixture(true);
    const { layout } = layoutFixture();
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    expect(beginReaderTextSelection(t.window, t.nodes[0]!)).toBeNull();
    expect(readerSelectionText(t.window, t.selection)).toBe('alphaCHARTomega');
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();
    owner.dispose();
  });

  it('filters only complete visible Reading Mode blocks whose source page is ready', async () => {
    const t = selectionFixture(true);
    Reflect.set(t.window, 'innerHeight', 29);
    const map = vi.fn((range: Range) => ({
      position: {
        pageIndex: 0,
        rects: [range.startContainer === t.nodes[1] ? chart.rect : [10, 780, 50, 790]],
      },
      sortIndex: '00000|00001|00010',
      pageLabel: '1',
    }));
    const release = leaseReaderPresentation(t.window, { getAnnotationFromRange: map }, () => true);
    const { layout, publish } = layoutFixture();
    layout.prepareVisiblePage.mockImplementationOnce(async () => {
      publish({ pages: [0], ready: new Map([[0, [chart]]]) });
    });
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    expect(beginReaderTextSelection(t.window, t.nodes[0]!)).toBeNull();
    await Promise.resolve();
    t.paint();
    expect(layout.prepareVisiblePage).toHaveBeenCalledExactlyOnceWith(
      t.window,
      0,
      [0],
      expect.any(Function),
    );
    expect(map).toHaveBeenCalledTimes(2);
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).not.toBeNull();
    expect(beginReaderTextSelection(t.window, t.nodes[1]!)).toBeNull();
    expect(beginReaderTextSelection(t.window, t.nodes[2]!)).toBeNull();
    expect(readerSelectionText(t.window, t.selection)).toBe('alphaCHARTomega');
    const end = beginReaderTextSelection(t.window, t.nodes[0]!)!;
    expect(readerSelectionText(t.window, t.selection)).toBe('alpha omega');
    release();
    expect(await validateReaderSelection(t.window)).toBe(false);
    end();
    owner.dispose();
  });

  it('keeps ambiguous native fragments selectable without warming their pages', () => {
    const t = selectionFixture(true);
    const map = vi.fn(() => ({
      position: { pageIndex: 0, rects: [chart.rect], nextPageRects: [chart.rect] },
      sortIndex: '00000|00001|00010',
      pageLabel: '1',
    }));
    const release = leaseReaderPresentation(t.window, { getAnnotationFromRange: map }, () => true);
    const { layout } = layoutFixture();
    const owner = new ReaderBodySelection(bodyHost(layout));
    owner.refreshLayout(t.window);
    t.paint();
    expect(map).toHaveBeenCalledTimes(3);
    expect(layout.prepareVisiblePage).not.toHaveBeenCalled();
    expect(beginReaderTextSelection(t.window, t.nodes[0]!)).toBeNull();
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    release();
    owner.dispose();
  });
});
