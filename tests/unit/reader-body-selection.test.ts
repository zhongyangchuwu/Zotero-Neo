import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyTextAdmission } from '../../src/modules/reader-selection/body-text';
import { ReaderBodySelection } from '../../src/modules/reader-selection/body-selection';
import {
  leaseReaderTextAdmission,
  readerSelectedTextRanges,
  readerSelectionIsFiltered,
  readerSelectionText,
  readerTextNodeAllowed,
} from '../../src/toolkit/reader/text-admission';
import { leaseReaderPresentation } from '../../src/toolkit/reader/presentation';
import { computeSelectionPosition } from '../../src/toolkit/reader/selection-geometry';
import { readerTextBoundaryPosition, readerTextSpans } from '../../src/toolkit/reader/text-source';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import { textAdmissionFixture } from '../fixtures/reader-text-admission';

const originalComponents = Reflect.get(globalThis, 'Components');
const originalZotero = Reflect.get(globalThis, 'Zotero');
beforeEach(() => Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } }));
afterEach(() => {
  for (const [name, value] of [
    ['Components', originalComponents],
    ['Zotero', originalZotero],
  ] as const)
    if (value === undefined) Reflect.deleteProperty(globalThis, name);
    else Reflect.set(globalThis, name, value);
});
const chart: DocumentRegion = {
  id: 'chart',
  sourceBlock: { id: 'native:1', order: 1 },
  kind: 'image',
  pageIndex: 0,
  rect: [95, 765, 155, 785],
  text: '',
  format: 'text',
  flow: 'auxiliary',
  anchorPrecision: 'region',
};

describe('body text admission', () => {
  it('resolves an element caret across excluded text to the next or previous admitted edge', () => {
    const t = textAdmissionFixture();
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    const boundary = { nodeType: 1 } as Node;
    expect(readerTextBoundaryPosition(t.window, boundary, 1, 'forward')).toEqual({
      textNode: t.nodes[2],
      offset: 0,
    });
    expect(readerTextBoundaryPosition(t.window, boundary, 2, 'backward')).toEqual({
      textNode: t.nodes[0],
      offset: 5,
    });
    release();
  });
  it('excludes chart and margin text while keeping body formulas and unknown source geometry', () => {
    const accepts = bodyTextAdmission([
      chart,
      {
        ...chart,
        id: 'formula',
        sourceBlock: { id: 'native:2', order: 2 },
        kind: 'formula',
        rect: [0, 0, 50, 20],
      },
    ]);
    expect(accepts({ pageIndex: 0, rect: [100, 770, 150, 780], sourceBlockId: null })).toBe(false);
    expect(accepts({ pageIndex: 0, rect: [0, 0, 50, 20], sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: 1, rect: chart.rect, sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: null })).toBe(true);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: 'native:1' })).toBe(false);
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
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(false);
    current = false;
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    const second = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    first();
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(false);
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
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(false);
    release();
    expect(t.elements[1]!.getAttribute('data-zv-text-excluded')).toBeNull();
  });

  it('filters text and annotation geometry together, but leaves Normal-mode native selection unchanged', () => {
    const t = textAdmissionFixture();
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
    expect(readerTextSpans(t.window).map((span) => span.text)).toEqual(['alpha', 'omega']);
    expect(readerSelectionIsFiltered(t.window)).toBe(false);
    expect(readerSelectionText(t.window, t.selection)).toBe('alphaCHARTomega');
    t.document.documentElement.setAttribute('data-zv-select-active', '');
    expect(readerSelectionText(t.window, t.selection)).toBe('alpha omega');
    expect(
      readerSelectionText(t.window, {
        ...t.selection,
        toString: () => 'alpha\nomega',
      } as Selection),
    ).toBe('alpha\nomega');
    expect(readerSelectedTextRanges(t.window, t.selection)).toHaveLength(2);
    const computed = computeSelectionPosition(t.window, t.selection)!;
    expect(JSON.parse(computed.position!)).toEqual({
      pageIndex: 0,
      rects: [
        [10, 780, 50, 790],
        [10, 760, 50, 770],
      ],
    });
    t.document.documentElement.removeAttribute('data-zv-select-active');
    const native = computeSelectionPosition(t.window, t.selection)!;
    expect(JSON.parse(native.position!).rects).toHaveLength(3);
    release();
  });

  it('merges every admitted Reading Mode fragment and rejects partial native mapping', () => {
    const t = textAdmissionFixture(true);
    t.document.documentElement.setAttribute('data-zv-select-active', '');
    const release = leaseReaderTextAdmission(t.window, bodyTextAdmission([chart]), () => true);
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
    release();
  });

  it('loads layout only after an explicit request and retires a result when input ownership changes', async () => {
    const t = textAdmissionFixture();
    let invocation = true;
    const pending = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<void>();
    const getReader = vi.fn(async () => ({
      getMetadata: async () => {
        started.resolve();
        return pending.promise;
      },
      getCatalog: async () => ({ pages: [{ viewRect: [0, 0, 600, 800] }] }),
      getTopLevelBlockCount: () => 1,
      getBlocks: async () => [{ type: 'image', anchor: { pageRects: [[0, ...chart.rect]] } }],
    }));
    Reflect.set(globalThis, 'Zotero', {
      Items: {
        getAsync: async () => ({
          isPDFAttachment: () => true,
          getFilePathAsync: async () => '/owned.pdf',
        }),
      },
      Utilities: { Internal: { md5Async: async () => 'source' } },
      SDT: { getReader },
    });
    const status = vi.fn();
    const owner = new ReaderBodySelection({
      reader: { itemID: 1 },
      isCurrent: () => true,
      capturePresentation: () => () => invocation,
      captureView: () => () => true,
      showStatus: status,
      text: (s) => s,
      debug: vi.fn(),
    });
    owner.bind(t.window);
    expect(getReader).not.toHaveBeenCalled();
    const loading = owner.toggle(t.window);
    await started.promise;
    invocation = false;
    pending.resolve({ source: { hash: 'source' } });
    await loading;
    t.document.documentElement.setAttribute('data-zv-select-active', '');
    expect(readerSelectionIsFiltered(t.window)).toBe(false);
    invocation = true;
    await owner.toggle(t.window);
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(false);
    await owner.toggle(t.window);
    expect(readerTextNodeAllowed(t.window, t.nodes[1]!)).toBe(true);
    owner.dispose();
  });
});
