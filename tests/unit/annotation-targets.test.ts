import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerVisibleAnnotations, type PdfWindow } from '../../src/toolkit/reader';
import { readerCopyTargets } from '../../src/modules/reader-hints/copy-targets';
import type { ReaderLinkPosition } from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

interface Annotation {
  id: string;
  type: string;
  text?: string;
  comment?: string;
  _hidden?: boolean;
  position: {
    pageIndex: number;
    rects: number[][];
    nextPageRects?: number[][];
    rotation?: number;
  };
}

function annotation(id = 'A'): Annotation {
  return {
    id,
    type: 'highlight',
    text: '  Raw excerpt\nwith spacing 😀  ',
    comment: '<b>Raw comment</b>\r\nSecond line',
    position: { pageIndex: 0, rects: [[10, 300, 60, 320]] },
  };
}

function bounds(rect: readonly number[]): DOMRect {
  const [left = 0, top = 0, right = 0, bottom = 0] = rect;
  return {
    left,
    top,
    right,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

function harness(annotations = [annotation()]) {
  const ownerWindow = {} as Window;
  const document = {
    documentElement: { clientWidth: 800, clientHeight: 600 },
    defaultView: ownerWindow,
  };
  const element = (rect: number[]) => ({
    ownerDocument: document,
    isConnected: true,
    parentElement: null,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    rect,
    getBoundingClientRect() {
      return bounds(this.rect);
    },
  });
  const container = element([80, 40, 720, 620]);
  const pages = [
    { div: element([100, 50, 700, 850]), viewport: { scale: 2, height: 800 } },
    { div: element([100, 900, 700, 1700]), viewport: { scale: 2, height: 800 } },
  ];
  const window = {
    document,
    closed: false,
    frameElement: null as Element | null,
    innerWidth: 800,
    innerHeight: 600,
    getComputedStyle: (target: {
      style: { display: string; visibility: string; opacity: string };
    }) => target.style,
    PDFViewerApplication: { pdfViewer: { container, _pages: pages } },
  };
  // Native geometry runs in Reader's realm even when viewport functions are opaque to Chrome.
  const getClientRectForPopup = vi.fn((position: ReaderLinkPosition): readonly number[] => {
    const page = pages[position.pageIndex];
    const rect = position.rects[0];
    if (!page || !rect) throw new Error('Unavailable page or fragment');
    const [left, top] = page.div.rect;
    return [
      left! + rect[0]! * 2,
      top! + 800 - rect[3]! * 2,
      left! + rect[2]! * 2,
      top! + 800 - rect[1]! * 2,
    ];
  });
  const view = {
    _iframeWindow: window as unknown as Window,
    _annotations: annotations.slice(),
    _pages: pages.map((_page, index) => ({ _pageIndex: index, _originalPage: {} })),
    getClientRectForPopup,
  };
  const state = {
    annotations,
    filter: { query: '', colors: [] as string[], tags: [], authors: [], enabledTypes: null },
    showAnnotations: true,
    primaryReadingModeEnabled: false,
    secondaryReadingModeEnabled: false,
    selectedAnnotationIDs: ['preexisting-selection'],
  };
  const internal = { _state: state, _primaryView: view, _secondaryView: view };
  const reader = {
    itemID: 7,
    _isTabClosed: false,
    _iframeWindow: ownerWindow,
    _internalReader: internal,
  };
  const cloneInto = vi.fn(<T>(value: T, _target: Window) => structuredClone(value));
  Reflect.set(globalThis, 'Components', { utils: { cloneInto } });
  const read = () => readerVisibleAnnotations(reader, view, window as unknown as Window);
  return {
    annotations,
    reader,
    view,
    state,
    internal,
    window,
    ownerWindow,
    container,
    pages,
    cloneInto,
    read,
  };
}

describe('native visible annotation targets', () => {
  it('snapshots raw excerpt and comment independently without changing native selection', () => {
    const test = harness();
    const [target] = test.read();
    expect(target).toMatchObject({
      key: 'A',
      text: test.annotations[0]!.text,
      comment: test.annotations[0]!.comment,
      rect: [120, 210, 220, 250],
    });
    expect(test.cloneInto).toHaveBeenCalledWith(
      { pageIndex: 0, rects: [[10, 300, 60, 320]] },
      test.ownerWindow,
    );
    expect(test.state.selectedAnnotationIDs).toEqual(['preexisting-selection']);
    expect(test.view._annotations[0]).toBe(test.state.annotations[0]);
  });

  it('preserves missing and empty fields for the business role policy', () => {
    const empty = annotation('empty');
    delete empty.text;
    empty.comment = '';
    const excerpt = annotation('excerpt');
    delete excerpt.comment;
    const comment = annotation('comment');
    delete comment.text;
    const test = harness([empty, excerpt, comment]);
    expect(
      test.read().map(({ key, text, comment: value }) => ({ key, text, comment: value })),
    ).toEqual([
      { key: 'empty', text: '', comment: '' },
      { key: 'excerpt', text: excerpt.text, comment: '' },
      { key: 'comment', text: '', comment: comment.comment },
    ]);
  });

  it('uses only exact native filtered model members, not copies or hidden inventory', () => {
    const included = annotation('included');
    const filtered = annotation('filtered');
    const hidden = { ...annotation('hidden'), _hidden: true };
    const test = harness([included, filtered, hidden]);
    test.view._annotations = [included, hidden, structuredClone(filtered), annotation('unsaved')];
    expect(test.read().map(({ key }) => key)).toEqual(['included']);
    test.view._annotations = [];
    expect(test.read()).toEqual([]);
  });

  it('excludes offscreen and unrendered pages and clips to page, viewer and viewport', () => {
    const offscreen = annotation('offscreen');
    offscreen.position.pageIndex = 1;
    const test = harness([annotation(), offscreen]);
    expect(test.read().map(({ key }) => key)).toEqual(['A']);
    test.container.rect = [150, 230, 720, 620];
    expect(test.read()[0]?.rect).toEqual([150, 230, 220, 250]);
    test.view._pages = [{ _pageIndex: 1, _originalPage: {} }];
    expect(test.read()).toEqual([]);
  });

  it('does not create a visible anchor from a union of wholly offscreen fragments', () => {
    const source = annotation();
    source.position.rects = [
      [10, 380, 60, 395],
      [10, 10, 60, 20],
    ];
    const test = harness([source]);
    test.container.rect = [80, 100, 720, 600];
    expect(test.read()).toEqual([]);
    source.position.rects.push([10, 300, 60, 320]);
    expect(test.read()[0]?.rect).toEqual([120, 210, 220, 250]);
  });

  it('converts next-page fragments separately and returns the first genuinely visible fragment', () => {
    const source = annotation();
    source.position.rects = [[10, 10, 60, 20]];
    source.position.nextPageRects = [[10, 300, 60, 320]];
    const test = harness([source]);
    test.pages[1]!.div.rect = [100, 50, 700, 850];
    expect(test.read()[0]?.rect).toEqual([120, 210, 220, 250]);
    expect(test.view.getClientRectForPopup).toHaveBeenLastCalledWith({
      pageIndex: 1,
      rects: [[10, 300, 60, 320]],
    });
    test.pages[1]!.div.rect = [100, 900, 700, 1700];
    expect(test.read()).toEqual([]);
  });

  it('refreshes geometry after scroll and zoom, without changing the original snapshot rect', () => {
    const test = harness();
    const target = test.read()[0]!;
    test.pages[0]!.div.rect = [120, 70, 720, 870];
    expect(target.currentRect()).toEqual([140, 230, 240, 270]);
    expect(target.rect).toEqual([120, 210, 220, 250]);
    test.view.getClientRectForPopup.mockReturnValue([150, 240, 250, 280]);
    expect(target.currentRect()).toEqual([150, 240, 250, 280]);
    test.pages[0]!.div.rect = [100, 900, 700, 1700];
    expect(target.currentRect()).toBeNull();
  });

  it.each(['text', 'comment', 'type', 'id'] as const)('rejects stale %s snapshots', (field) => {
    const test = harness();
    const target = test.read()[0]!;
    test.annotations[0]![field] = 'changed';
    expect(target.currentRect()).toBeNull();
    expect(target.text).toBe('  Raw excerpt\nwith spacing 😀  ');
  });

  it('rejects in-place position changes and replacement/deleted model objects', () => {
    const test = harness();
    const target = test.read()[0]!;
    test.annotations[0]!.position.rects[0]![0] = 20;
    expect(target.currentRect()).toBeNull();
    const fresh = test.read()[0]!;
    test.state.annotations = [structuredClone(test.annotations[0]!)];
    expect(fresh.currentRect()).toBeNull();
    test.view._annotations = test.state.annotations.slice();
    const replaced = test.read()[0]!;
    test.state.annotations = [];
    expect(replaced.currentRect()).toBeNull();
  });

  it.each(['membership', 'hidden', 'filter replacement', 'filter mutation'])(
    'rejects stale native filtering through %s',
    (change) => {
      const test = harness();
      const target = test.read()[0]!;
      if (change === 'membership') test.view._annotations = [];
      if (change === 'hidden') test.annotations[0]!._hidden = true;
      if (change === 'filter replacement') test.state.filter = { ...test.state.filter };
      if (change === 'filter mutation') test.state.filter.colors.push('#ff6666');
      expect(target.currentRect()).toBeNull();
    },
  );

  it.each(['view', 'window', 'reader', 'realm', 'closed', 'showAnnotations', 'readingMode'])(
    'rejects stale exact-view ownership through %s',
    (change) => {
      const test = harness();
      const target = test.read()[0]!;
      if (change === 'view') test.internal._primaryView = { ...test.view };
      if (change === 'window') test.view._iframeWindow = {} as Window;
      if (change === 'reader') test.reader._internalReader = { ...test.internal };
      if (change === 'realm') test.reader._iframeWindow = {} as Window;
      if (change === 'closed') test.reader._isTabClosed = true;
      if (change === 'showAnnotations') test.state.showAnnotations = false;
      if (change === 'readingMode') test.state.primaryReadingModeEnabled = true;
      expect(target.currentRect()).toBeNull();
    },
  );

  it('uses the secondary view reading mode rather than primary view state', () => {
    const test = harness();
    test.internal._primaryView = { ...test.view };
    test.state.primaryReadingModeEnabled = true;
    expect(test.read()).toHaveLength(1);
    const target = test.read()[0]!;
    test.state.secondaryReadingModeEnabled = true;
    expect(target.currentRect()).toBeNull();
    expect(test.read()).toEqual([]);
  });

  it.each(['detached page', 'hidden page', 'hidden viewer', 'hidden frame', 'closed window'])(
    'omits nonvisible host geometry: %s',
    (change) => {
      const test = harness();
      const target = test.read()[0]!;
      if (change === 'detached page') test.pages[0]!.div.isConnected = false;
      if (change === 'hidden page') test.pages[0]!.div.style.visibility = 'hidden';
      if (change === 'hidden viewer') test.container.style.display = 'none';
      if (change === 'closed window') test.window.closed = true;
      if (change === 'hidden frame') {
        const frame = { ...test.container, style: { display: 'none' } };
        test.window.frameElement = frame as unknown as Element;
        Reflect.set(test.ownerWindow, 'getComputedStyle', (element: typeof frame) => element.style);
      }
      expect(target.currentRect()).toBeNull();
      expect(test.read()).toEqual([]);
    },
  );

  it.each([
    { type: 'ink' },
    { type: 'text', position: { pageIndex: 0, rects: [[10, 300, 60, 320]], rotation: 90 } },
    { position: { pageIndex: -1, rects: [[10, 300, 60, 320]] } },
    { position: { pageIndex: 0, rects: [] } },
    { position: { pageIndex: 0, rects: [[60, 300, 10, 320]] } },
    { position: { pageIndex: 0, rects: [[10, NaN, 60, 320]] } },
    { position: { pageIndex: 0, rects: [[10, 300, 60, 320]], nextPageRects: [] } },
  ])('omits unsupported annotation geometry: %j', (unsupported) => {
    const test = harness([{ ...annotation('unsupported'), ...unsupported }, annotation('valid')]);
    expect(test.read().map(({ key }) => key)).toEqual(['valid']);
  });

  it.each(['highlight', 'underline', 'note', 'image', 'text'])(
    'accepts native rectangular %s anchors without requiring both content roles',
    (type) => {
      const source = annotation();
      source.type = type;
      delete source.text;
      const test = harness([source]);
      expect(test.read()[0]).toMatchObject({ key: 'A', text: '', comment: source.comment });
    },
  );

  it('returns no targets for an empty native annotation inventory', () => {
    const test = harness([]);
    expect(test.read()).toEqual([]);
    expect(test.view.getClientRectForPopup).not.toHaveBeenCalled();
  });

  it.each(['viewer', 'page', 'rendered pages', 'owner realm', 'native state'])(
    'fails closed without required %s geometry or ownership',
    (missing) => {
      const test = harness();
      if (missing === 'viewer') Reflect.deleteProperty(test.window, 'PDFViewerApplication');
      if (missing === 'page') Reflect.deleteProperty(test.pages[0]!, 'div');
      if (missing === 'rendered pages') test.view._pages = [];
      if (missing === 'owner realm') Reflect.deleteProperty(test.reader, '_iframeWindow');
      if (missing === 'native state') Reflect.deleteProperty(test.internal, '_state');
      expect(test.read()).toEqual([]);
    },
  );

  it('fails closed on missing, invalid or throwing native conversion without hiding other models', () => {
    const test = harness([annotation('bad'), annotation('good')]);
    test.view.getClientRectForPopup.mockImplementationOnce(() => {
      throw new Error('Dead native geometry');
    });
    expect(test.read().map(({ key }) => key)).toEqual(['good']);
    const target = test.read()[0]!;
    test.view.getClientRectForPopup.mockReturnValue([0, 0, NaN, 40]);
    expect(target.currentRect()).toBeNull();
    expect(test.read()).toEqual([]);
    Reflect.deleteProperty(test.view, 'getClientRectForPopup');
    expect(test.read()).toEqual([]);
  });
});

describe('Reader copy source composition', () => {
  it('keeps an identifier, excerpt and comment as distinct intents at the same annotation anchor', () => {
    const model = annotation();
    model.text = '10.1234/foo';
    model.comment = 'Comment about this DOI';
    const test = harness([model]);
    Reflect.set(test.window.document, 'querySelectorAll', () => []);
    Reflect.set(test.view, '_pdfPages', {
      0: {
        overlays: [
          {
            type: 'external-link',
            position: model.position,
            url: 'https://doi.org/10.1234/foo',
          },
        ],
      },
    });
    const targets = readerCopyTargets(
      test.reader,
      test.view,
      test.window as unknown as PdfWindow,
      (key) => key,
    );
    expect(targets.map(({ value }) => value)).toEqual([
      { kind: 'doi', text: '10.1234/foo' },
      { kind: 'annotation-text', text: '10.1234/foo' },
      { kind: 'annotation-comment', text: 'Comment about this DOI' },
    ]);
    expect(targets[1]!.group).toBe(targets[2]!.group);
    expect(test.state.selectedAnnotationIDs).toEqual(['preexisting-selection']);
  });

  it('omits empty roles while preserving excerpt-only and comment-only annotations', () => {
    const empty = { ...annotation('empty'), text: ' ', comment: '\n' };
    const excerpt = { ...annotation('excerpt'), text: 'Only excerpt', comment: '' };
    const comment = { ...annotation('comment'), text: undefined, comment: 'Only comment' };
    const test = harness([empty, excerpt, comment]);
    Reflect.set(test.window.document, 'querySelectorAll', () => []);
    Reflect.set(test.view, '_pdfPages', {});
    const targets = readerCopyTargets(
      test.reader,
      test.view,
      test.window as unknown as PdfWindow,
      (key) => key,
    );
    expect(targets.map(({ value }) => value)).toEqual([
      { kind: 'annotation-text', text: 'Only excerpt' },
      { kind: 'annotation-comment', text: 'Only comment' },
    ]);
  });
});
