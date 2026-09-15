import { describe, expect, it, vi } from 'vitest';

import {
  ReaderFlash,
  buildFlashTextIndex,
  flashMatches,
  normalizeFlashText,
  type FlashTextSegment,
} from '../../src/reader/flash';
import type { PdfWindow, Pointer } from '../../src/reader/types';

function textNode(value: string): Text {
  return {
    nodeType: 3,
    data: value,
    length: value.length,
    isConnected: true,
    parentElement: null,
  } as unknown as Text;
}

function segment(node: Text): FlashTextSegment {
  return { textNode: node, text: node.data };
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('Flash text index', () => {
  it('normalizes NFKC and collapses whitespace', () => {
    expect(normalizeFlashText('  ﬁ\n\tfoo  ')).toBe('fi foo');
  });

  it('matches literals across PDF.js text-node boundaries', () => {
    const first = textNode('hel');
    const second = textNode('lo world');
    const index = buildFlashTextIndex([segment(first), segment(second)]);

    expect(index.text).toBe('hello world');
    expect(flashMatches(index, 'llo')).toEqual([
      { index: 2, pointer: { textNode: first, offset: 2 } },
    ]);
    expect(flashMatches(index, 'lo w')).toEqual([
      { index: 3, pointer: { textNode: second, offset: 0 } },
    ]);
  });

  it('uses smartcase without fuzzy or regex semantics', () => {
    const node = textNode('Alpha alpha ALPHA a.pha');
    const index = buildFlashTextIndex([segment(node)]);

    expect(flashMatches(index, 'alpha')).toHaveLength(3);
    expect(flashMatches(index, 'Alpha')).toEqual([
      { index: 0, pointer: { textNode: node, offset: 0 } },
    ]);
    expect(flashMatches(index, 'a.pha')).toEqual([
      { index: 18, pointer: { textNode: node, offset: 18 } },
    ]);
  });
});

interface TextSpec {
  readonly value: string;
  readonly left: number;
  readonly top: number;
}

function createFlashWindow(specs: readonly TextSpec[], focusIndex = 0) {
  const bodyChildren: HTMLElement[] = [];
  const geometry = new Map<Text, TextSpec>();
  const spans = specs.map((spec) => {
    const node = textNode(spec.value);
    geometry.set(node, spec);
    const span = {
      firstChild: node,
      getBoundingClientRect: () =>
        rect(spec.left, spec.top, spec.left + Math.max(10, spec.value.length * 8), spec.top + 16),
    } as unknown as HTMLElement;
    Reflect.set(node, 'parentElement', span);
    return { node, span };
  });
  let rangeNode: Text | null = null;
  let rangeOffset = 0;
  const document = {
    documentElement: { clientWidth: 800, clientHeight: 600 },
    body: {
      appendChild: (element: HTMLElement) => bodyChildren.push(element),
    },
    querySelectorAll: (selector: string) =>
      selector === '.textLayer span' ? spans.map((entry) => entry.span) : [],
    createElement: () => {
      const element = {
        dataset: {} as Record<string, string>,
        style: { cssText: '', left: '', top: '' },
        hidden: false,
        textContent: '',
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element as unknown as HTMLElement);
          if (index >= 0) bodyChildren.splice(index, 1);
        }),
      };
      return element as unknown as HTMLElement;
    },
    createRange: () => ({
      setStart: (node: Text, offset: number) => {
        rangeNode = node;
        rangeOffset = offset;
      },
      setEnd: () => {},
      getBoundingClientRect: () => {
        const spec = rangeNode ? geometry.get(rangeNode) : null;
        if (!spec) return rect(0, 0, 0, 0);
        const left = spec.left + Math.min(rangeOffset, spec.value.length) * 8;
        return rect(left, spec.top, left + 6, spec.top + 16);
      },
    }),
  };
  const selection = {
    focusNode: spans[focusIndex]?.node ?? null,
    focusOffset: 0,
  };
  const pdfWindow = {
    document,
    innerWidth: 800,
    innerHeight: 600,
    getSelection: () => selection,
    focus: vi.fn(),
  } as unknown as PdfWindow;
  return { pdfWindow, spans, bodyChildren };
}

function flashKey(key: string) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function flashHints(children: readonly HTMLElement[]): HTMLElement[] {
  return children.filter((element) => element.dataset.zoteroNeoFlashHint === '1');
}

function createFlash() {
  const activations: { mode: string; pointer: Pointer }[] = [];
  const statuses: string[] = [];
  const debug: string[] = [];
  const flash = new ReaderFlash({
    activate: (mode, _window, pointer) => activations.push({ mode, pointer }),
    showStatus: (message) => statuses.push(message),
    debug: (message) => debug.push(message),
  });
  return { flash, activations, statuses, debug };
}

describe('Reader Flash lifecycle', () => {
  it('freezes distance-ordered stable labels and requires an explicit label', () => {
    const created = createFlashWindow(
      [
        { value: 'target far', left: 500, top: 300 },
        { value: 'target near', left: 30, top: 30 },
      ],
      1,
    );
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'cursor');
    for (const key of 'target') flash.handleKey(flashKey(key), created.pdfWindow);
    flash.handleKey(flashKey('Enter'), created.pdfWindow);

    const hints = flashHints(created.bodyChildren);
    expect(hints).toHaveLength(2);
    expect(hints.map((hint) => hint.textContent)).toEqual(['A', 'S']);
    expect(activations).toHaveLength(0);

    flash.handleKey(flashKey('A'), created.pdfWindow);
    expect(activations).toHaveLength(1);
    expect(activations[0]?.mode).toBe('cursor');
    expect(activations[0]?.pointer.textNode).toBe(created.spans[1]?.node);
    expect(flash.isOpen).toBe(false);
  });

  it('returns from label stage to query editing with Backspace', () => {
    const created = createFlashWindow([{ value: 'target target', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'normal');
    for (const key of 'target') flash.handleKey(flashKey(key), created.pdfWindow);
    flash.handleKey(flashKey('Enter'), created.pdfWindow);
    expect(flashHints(created.bodyChildren)).toHaveLength(2);

    flash.handleKey(flashKey('Backspace'), created.pdfWindow);
    expect(flashHints(created.bodyChildren)).toHaveLength(0);
    expect(flash.isOpen).toBe(true);
    flash.handleKey(flashKey('Backspace'), created.pdfWindow);
    flash.handleKey(flashKey('Enter'), created.pdfWindow);
    expect(flashHints(created.bodyChildren)).toHaveLength(2);
  });

  it('cancels instead of reindexing when the viewport changes', () => {
    const created = createFlashWindow([{ value: 'visible text', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'normal');
    expect(flash.isOpen).toBe(true);

    flash.onViewportChange(created.pdfWindow);

    expect(flash.isOpen).toBe(false);
    expect(created.bodyChildren).toHaveLength(0);
  });

  it('cancels and yields an event that arrives from another split view', () => {
    const primary = createFlashWindow([{ value: 'primary', left: 20, top: 20 }]);
    const secondary = createFlashWindow([{ value: 'secondary', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(primary.pdfWindow, 'visual');
    const event = flashKey('j');

    expect(flash.handleKey(event, secondary.pdfWindow)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(flash.isOpen).toBe(false);
  });
});
