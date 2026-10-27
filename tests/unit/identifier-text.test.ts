import { describe, expect, it } from 'vitest';
import { visiblePdfTextChunks } from '../../src/toolkit/reader';
import { identifierHintTargets } from '../../src/modules/reader-hints/identifier-targets';
import type { PdfWindow, ReaderViewRuntime } from '../../src/toolkit/reader';

interface TextSpec {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly top?: number;
  readonly bottom?: number;
  readonly rangeLeft?: number;
  readonly rangeRight?: number;
  readonly rangeTop?: number;
  readonly rangeBottom?: number;
  readonly charWidth?: number;
  readonly page?: string;
  readonly layer?: string;
  readonly container?: string;
  readonly visible?: boolean;
  readonly connected?: boolean;
}

interface FakeElement {
  readonly parentElement: FakeElement | null;
  readonly style: { readonly display: string; readonly visibility: string };
  readonly closest: (selector: string) => FakeElement | null;
  readonly getBoundingClientRect?: () => DOMRect;
  readonly firstChild?: Text;
  isConnected: boolean;
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createWindow(specs: readonly TextSpec[]) {
  const pages = new Map<string, FakeElement>();
  const layers = new Map<string, FakeElement>();
  const containers = new Map<string, FakeElement>();
  const geometry = new Map<Text, TextSpec>();
  const rangeOffsets: { readonly start: number; readonly end: number }[] = [];
  const spans: HTMLElement[] = [];

  const element = (parentElement: FakeElement | null): FakeElement => ({
    parentElement,
    style: { display: 'block', visibility: 'visible' },
    closest: () => null,
    isConnected: true,
  });

  for (const spec of specs) {
    const pageId = spec.page ?? 'page-1';
    const layerId = `${pageId}/${spec.layer ?? 'layer-1'}`;
    const containerId = `${layerId}/${spec.container ?? 'container-1'}`;
    let page = pages.get(pageId);
    if (!page) {
      page = element(null);
      pages.set(pageId, page);
    }
    let layer = layers.get(layerId);
    if (!layer) {
      layer = {
        ...element(page),
        closest: (selector) => (selector === '.page' ? page! : null),
      };
      layers.set(layerId, layer);
    }
    let container = containers.get(containerId);
    if (!container) {
      container = element(layer);
      containers.set(containerId, container);
    }

    const textNode = {
      nodeType: 3,
      data: spec.text,
      isConnected: spec.connected !== false,
      parentNode: null as unknown,
    } as unknown as Text;
    const span: FakeElement = {
      ...element(container),
      style: {
        display: spec.visible === false ? 'none' : 'inline',
        visibility: 'visible',
      },
      closest: (selector) => (selector === '.textLayer' ? layer! : null),
      getBoundingClientRect: () => rect(spec.left, spec.top ?? 10, spec.right, spec.bottom ?? 20),
      firstChild: textNode,
      isConnected: spec.connected !== false,
    };
    Reflect.set(textNode, 'parentNode', span);
    geometry.set(textNode, spec);
    spans.push(span as unknown as HTMLElement);
  }

  const document = {
    documentElement: { clientWidth: 1000, clientHeight: 1000 },
    querySelectorAll: (selector: string) => (selector === '.textLayer span' ? spans : []),
    createRange: () => {
      let textNode: Text | null = null;
      let start = 0;
      let end = 0;
      return {
        setStart: (node: Text, offset: number) => {
          textNode = node;
          start = offset;
        },
        setEnd: (_node: Text, offset: number) => {
          end = offset;
        },
        getClientRects: () => {
          if (!textNode) return [];
          const spec = geometry.get(textNode);
          if (!spec) return [];
          rangeOffsets.push({ start, end });
          const left = spec.rangeLeft ?? spec.left + start * (spec.charWidth ?? 4);
          const right = spec.rangeRight ?? spec.left + end * (spec.charWidth ?? 4);
          return [
            rect(
              left,
              spec.rangeTop ?? spec.top ?? 10,
              right,
              spec.rangeBottom ?? spec.bottom ?? 20,
            ),
          ];
        },
      };
    },
  };
  const window = {
    document,
    innerWidth: 1000,
    innerHeight: 1000,
    getComputedStyle: (target: FakeElement) => target.style,
  } as unknown as Window;

  const frameDocument = { defaultView: null as unknown as Window };
  const frameOwner = {
    document: frameDocument,
    closed: false,
    frameElement: null,
    getComputedStyle: (target: { style: Record<string, string> }) => target.style,
  };
  frameDocument.defaultView = frameOwner as unknown as Window;
  const frame = {
    ownerDocument: frameDocument,
    parentElement: null,
    isConnected: true,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
  };
  Reflect.set(window, 'frameElement', frame);
  return { window, rangeOffsets, frame };
}

describe('visible PDF identifier text chunks', () => {
  it('joins nearby same-line spans and inserts a space for a measured word gap', () => {
    const { window, rangeOffsets } = createWindow([
      { text: 'doi:', left: 10, right: 30 },
      { text: '10.1/a', left: 34, right: 58 },
    ]);

    const [chunk] = visiblePdfTextChunks(window);

    expect(chunk?.text).toBe('doi: 10.1/a');
    expect(chunk?.rects(0, 4)).toMatchObject([
      { left: 10, right: 26, top: 10, bottom: 20, width: 16, height: 10 },
    ]);
    expect(chunk?.rects(5, 9)).toMatchObject([
      { left: 34, right: 50, top: 10, bottom: 20, width: 16, height: 10 },
    ]);
    expect(rangeOffsets).toEqual([
      { start: 0, end: 4 },
      { start: 0, end: 4 },
    ]);
  });

  it('preserves original text and uses UTF-16 offsets without normalization', () => {
    const { window, rangeOffsets } = createWindow([{ text: 'A😀e\u0301', left: 10, right: 30 }]);

    const [chunk] = visiblePdfTextChunks(window);

    expect(chunk?.text).toBe('A😀e\u0301');
    expect(chunk?.rects(1, 3)).toMatchObject([
      { left: 14, right: 22, top: 10, bottom: 20, width: 8, height: 10 },
    ]);
    expect(rangeOffsets).toEqual([{ start: 1, end: 3 }]);
  });

  it('keeps distant, different-container, different-page, and different-line text separate', () => {
    const { window } = createWindow([
      { text: 'first', left: 10, right: 30 },
      { text: 'block', left: 31, right: 50, container: 'other' },
      { text: 'column', left: 300, right: 330 },
      { text: 'page', left: 10, right: 30, page: 'page-2' },
      { text: 'line', left: 10, right: 30, top: 40, bottom: 50, page: 'page-2' },
    ]);

    expect(visiblePdfTextChunks(window).map(({ text }) => text)).toEqual([
      'first',
      'block',
      'column',
      'page',
      'line',
    ]);
  });

  it.each([
    [
      { text: '10.1234/foo', left: 10, right: 54 },
      { text: '10.1234/foo', left: 10, right: 54 },
    ],
    [
      { text: '10.1234/fo', left: 100, right: 140 },
      { text: 'o', left: 96, right: 100 },
    ],
  ])('does not fabricate identifiers from overlapping or backwards spans', (first, second) => {
    const { window } = createWindow([first, second]);
    expect(visiblePdfTextChunks(window).map(({ text }) => text)).toEqual([first.text, second.text]);
  });

  it('keeps the native destination when it overlaps a later rectangle of a split-span DOI URL', () => {
    const { window } = createWindow([
      { text: 'https://doi.org/', left: 10, right: 74 },
      { text: '10.1234/foo', left: 74, right: 118 },
    ]);
    const overlay = {
      type: 'external-link' as const,
      position: { pageIndex: 0, rects: [[74, 10, 118, 20]] },
      url: 'https://example.org/native-destination',
    };
    const view = {
      _pdfPages: { 0: { overlays: [overlay] } },
      getClientRectForPopup: (position: typeof overlay.position) => position.rects[0],
    } as unknown as ReaderViewRuntime;
    const targets = identifierHintTargets(view, window as PdfWindow, 'follow');
    expect(targets.map(({ value }) => value)).toEqual([{ kind: 'native', overlay }]);
  });

  it('collapses identical overprinted text at one position without changing its identifier', () => {
    const { window } = createWindow([
      { text: '10.1234/foo', left: 10, right: 54 },
      { text: '10.1234/foo', left: 10, right: 54 },
    ]);
    const view = {
      _pdfPages: {},
      getClientRectForPopup: () => null,
    } as unknown as ReaderViewRuntime;
    const targets = identifierHintTargets(view, window as PdfWindow, 'copy');
    expect(targets.map(({ value }) => (value.kind === 'text' ? value.match.value : null))).toEqual([
      '10.1234/foo',
    ]);
  });

  it('filters hidden, disconnected, invalid, and off-viewport spans', () => {
    const { window } = createWindow([
      { text: 'hidden', left: 10, right: 30, visible: false },
      { text: 'detached', left: 10, right: 30, connected: false },
      { text: 'invalid', left: 10, right: 10 },
      { text: 'outside', left: 1100, right: 1120 },
    ]);

    expect(visiblePdfTextChunks(window)).toEqual([]);
  });

  it('returns no rectangles after source text changes or the source disconnects', () => {
    const { window } = createWindow([{ text: 'identifier', left: 10, right: 50 }]);
    const [chunk] = visiblePdfTextChunks(window);
    const span = window.document.querySelectorAll('.textLayer span')[0] as HTMLElement;
    const textNode = span.firstChild as Text;

    Reflect.set(textNode, 'data', 'changed');
    expect(chunk?.rects(0, 4)).toEqual([]);

    Reflect.set(textNode, 'data', 'identifier');
    Reflect.set(textNode, 'isConnected', false);
    expect(chunk?.rects(0, 4)).toEqual([]);
  });

  it('drops fresh range rectangles that are no longer visible', () => {
    const { window } = createWindow([
      {
        text: 'visible',
        left: 10,
        right: 40,
        rangeLeft: 1100,
        rangeRight: 1120,
      },
    ]);
    const [chunk] = visiblePdfTextChunks(window);

    expect(chunk?.rects(0, 4)).toEqual([]);
  });
});

describe('identifier targets in retained native PDF frames', () => {
  function retainedView() {
    const host = createWindow([{ text: '10.1000/retained', left: 10, right: 180 }]);
    const overlay = {
      type: 'external-link',
      url: 'https://example.invalid/retained',
      position: { pageIndex: 0, rects: [[300, 30, 450, 50]] },
    };
    const view = {
      _pdfPages: { 0: { overlays: [overlay] } },
      getClientRectForPopup: () => [300, 30, 450, 50],
    } as unknown as ReaderViewRuntime;
    return { ...host, view };
  }

  it.each(['copy', 'follow'] as const)(
    'omits text and scanned-PDF native-link targets from a hidden retained frame for %s',
    (intent) => {
      const h = retainedView();
      expect(
        identifierHintTargets(h.view, h.window as PdfWindow, intent).map(({ value }) => value.kind),
      ).toEqual(['text', 'native']);
      h.frame.style.visibility = 'hidden';
      expect(identifierHintTargets(h.view, h.window as PdfWindow, intent)).toEqual([]);
    },
  );

  it.each(['copy', 'follow'] as const)(
    'rejects admitted text and native-link targets when their iframe becomes hidden before %s confirmation',
    (intent) => {
      const h = retainedView();
      const targets = identifierHintTargets(h.view, h.window as PdfWindow, intent);
      h.frame.style.visibility = 'hidden';
      expect(targets.map((target) => target.currentRect())).toEqual([null, null]);
    },
  );
});
