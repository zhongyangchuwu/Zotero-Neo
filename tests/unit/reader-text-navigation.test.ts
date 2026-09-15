import { describe, expect, it, vi } from 'vitest';

import { ReaderSession } from '../../src/reader/controller';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';

interface FakeText extends Text {
  data: string;
  length: number;
  isConnected: boolean;
  nodeType: number;
}

function text(value: string): FakeText {
  return {
    data: value,
    length: value.length,
    isConnected: true,
    nodeType: 3,
  } as FakeText;
}

function createTextSession(values: readonly string[]) {
  const textNodes = values.map(text);
  const appended: HTMLElement[] = [];
  const rangeState: { node: Text | null; offset: number } = { node: null, offset: 0 };
  const selectionState: {
    anchorNode: Node | null;
    anchorOffset: number;
    focusNode: Node | null;
    focusOffset: number;
    isCollapsed: boolean;
    rangeCount: number;
  } = {
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    isCollapsed: true,
    rangeCount: 0,
  };

  const selection = {
    get anchorNode() {
      return selectionState.anchorNode;
    },
    get anchorOffset() {
      return selectionState.anchorOffset;
    },
    get focusNode() {
      return selectionState.focusNode;
    },
    get focusOffset() {
      return selectionState.focusOffset;
    },
    get isCollapsed() {
      return selectionState.isCollapsed;
    },
    get rangeCount() {
      return selectionState.rangeCount;
    },
    removeAllRanges: vi.fn(() => {
      selectionState.anchorNode = null;
      selectionState.anchorOffset = 0;
      selectionState.focusNode = null;
      selectionState.focusOffset = 0;
      selectionState.isCollapsed = true;
      selectionState.rangeCount = 0;
    }),
    addRange: vi.fn(() => {
      selectionState.anchorNode = rangeState.node;
      selectionState.anchorOffset = rangeState.offset;
      selectionState.focusNode = rangeState.node;
      selectionState.focusOffset = rangeState.offset;
      selectionState.isCollapsed = true;
      selectionState.rangeCount = 1;
    }),
    modify: vi.fn(),
  } as unknown as Selection;

  const document = {
    defaultView: null as Window | null,
    body: {
      appendChild: (element: HTMLElement) => appended.push(element),
    },
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
    },
    querySelectorAll: (selector: string) => {
      if (selector === '.textLayer span')
        return textNodes.map((node) => ({ firstChild: node })) as unknown as NodeListOf<Element>;
      if (selector === '[data-zv-cursor]')
        return appended.filter(
          (element) => element.dataset.zvCursor === '1',
        ) as unknown as NodeListOf<Element>;
      return [] as unknown as NodeListOf<Element>;
    },
    querySelector: (selector: string) => {
      if (selector === '.textLayer span') {
        const node = textNodes[0];
        return node ? ({ firstChild: node } as unknown as Element) : null;
      }
      return null;
    },
    getElementById: () => null,
    createRange: () => ({
      setStart: (node: Text, offset: number) => {
        rangeState.node = node;
        rangeState.offset = offset;
      },
      collapse: () => {},
      getBoundingClientRect: () => ({
        left: 40,
        top: 60,
        right: 42,
        bottom: 74,
        width: 2,
        height: 14,
      }),
    }),
    createElement: () => {
      const element = {
        ownerDocument: document,
        textContent: '',
        dataset: {} as Record<string, string>,
        style: {
          cssText: '',
          display: '',
          left: '',
          top: '',
        },
        remove: vi.fn(() => {
          const index = appended.indexOf(element as unknown as HTMLElement);
          if (index >= 0) appended.splice(index, 1);
        }),
      };
      return element as unknown as HTMLElement;
    },
  } as unknown as Document;

  const container = {
    clientHeight: 600,
    scrollBy: vi.fn(),
  } as unknown as HTMLElement;
  const pdfWindow = {
    document,
    PDFViewerApplication: { pdfViewer: { container } },
    getSelection: () => selection,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    focus: vi.fn(),
  } as unknown as PdfWindow;
  Reflect.set(document as object, 'defaultView', pdfWindow);

  const controller = {
    dependencies: {
      preferences: {
        get: (_key: string, fallback: boolean | number | string) => fallback,
        has: () => false,
        set: () => {},
      },
      logger: { debug: () => {}, diagnostic: () => {} },
      delegateMain: () => {},
      openCommandPalette: () => {},
    },
    selection: () => null,
  };
  const reader = {
    _iframeWindow: { document } as unknown as Window,
    _internalReader: {
      _primaryView: { _iframeWindow: pdfWindow },
    },
  } as ReaderRuntime;
  const session = new ReaderSession({
    controller,
    reader,
    firstPdfWindow: pdfWindow,
    bindings: () => DEFAULT_BINDINGS,
    release: () => {},
  } as unknown as ConstructorParameters<typeof ReaderSession>[0]);

  return { session, pdfWindow, selection, selectionState, textNodes, appended };
}

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopImmediatePropagation = vi.fn();
  return {
    event: {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: null,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as KeyboardEvent,
    preventDefault,
    stopImmediatePropagation,
  };
}

describe('reader text hint navigation characterization', () => {
  it('labels each non-empty PDF text span in DOM order', () => {
    const { session, appended } = createTextSession(['Alpha', '   ', 'Beta']);

    session.focusAndHandle(keyEvent('c').event);

    expect(appended.map((element) => element.textContent)).toEqual(['A', 'S']);
    expect(session.state.mode).toBe('cursor');
  });

  it('activates an exact hint as a collapsed caret and keeps the requested mode', () => {
    const { session, selectionState, textNodes, appended } = createTextSession(['Alpha', 'Beta']);
    session.focusAndHandle(keyEvent('c').event);
    const event = keyEvent('a');

    session.focusAndHandle(event.event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(session.state.mode).toBe('cursor');
    expect(appended.filter((element) => element.dataset.zvCursor !== '1')).toHaveLength(0);
    expect(selectionState.focusNode).toBe(textNodes[0]);
    expect(selectionState.focusOffset).toBe(0);
    expect(session.state.visualAnchor).toEqual({ textNode: textNodes[0], offset: 0 });
  });

  it('cancels hint picking to Normal mode on Escape', () => {
    const { session, appended } = createTextSession(['Alpha']);
    session.focusAndHandle(keyEvent('v').event);
    const event = keyEvent('Escape');

    session.focusAndHandle(event.event);

    expect(session.state.mode).toBe('normal');
    expect(appended).toHaveLength(0);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('fails closed to Normal mode when the visible PDF has no selectable text', () => {
    const { session, appended } = createTextSession(['   ', '']);

    session.focusAndHandle(keyEvent('c').event);

    expect(session.state.mode).toBe('normal');
    expect(appended).toHaveLength(0);
  });
});
