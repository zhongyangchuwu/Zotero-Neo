import { describe, expect, it, vi } from 'vitest';

import {
  FLASH_TARGET_LIMIT,
  ReaderFlash,
  buildFlashTextIndex,
  flashContinuationLabels,
  flashMatches,
  normalizeFlashText,
  type FlashSelectionTarget,
  type FlashTextSegment,
} from '../../src/reader/flash';
import type { PdfWindow } from '../../src/reader/types';

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

  it('matches literal ranges across PDF.js text-node boundaries', () => {
    const first = textNode('hel');
    const second = textNode('lo world');
    const index = buildFlashTextIndex([segment(first), segment(second)]);

    expect(index.text).toBe('hello world');
    expect(flashMatches(index, 'llo')).toEqual([
      {
        index: 2,
        pointer: { textNode: first, offset: 2 },
        end: { textNode: second, offset: 2 },
      },
    ]);
    expect(flashMatches(index, 'lo w')).toEqual([
      {
        index: 3,
        pointer: { textNode: second, offset: 0 },
        end: { textNode: second, offset: 4 },
      },
    ]);
  });

  it('uses smartcase without fuzzy or regex semantics', () => {
    const node = textNode('Alpha alpha ALPHA a.pha');
    const index = buildFlashTextIndex([segment(node)]);

    expect(flashMatches(index, 'alpha')).toHaveLength(3);
    expect(flashMatches(index, 'Alpha')).toEqual([
      {
        index: 0,
        pointer: { textNode: node, offset: 0 },
        end: { textNode: node, offset: 5 },
      },
    ]);
    expect(flashMatches(index, 'a.pha')).toEqual([
      {
        index: 18,
        pointer: { textNode: node, offset: 18 },
        end: { textNode: node, offset: 23 },
      },
    ]);
  });

  it('excludes every letter that can continue the current query', () => {
    const node = textNode('taste table tax');
    const index = buildFlashTextIndex([segment(node)]);
    const matches = flashMatches(index, 'ta');

    expect([...flashContinuationLabels(index, 'ta', matches)].sort()).toEqual(['B', 'S', 'X']);
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
    createElement: (tag: string) => {
      const listeners = new Map<string, EventListener[]>();
      const element = {
        tagName: tag.toUpperCase(),
        dataset: {} as Record<string, string>,
        style: { cssText: '', left: '', top: '' },
        hidden: false,
        textContent: '',
        value: '',
        type: '',
        autocomplete: '',
        spellcheck: false,
        placeholder: '',
        addEventListener: (type: string, listener: EventListener) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        removeEventListener: (type: string, listener: EventListener) => {
          listeners.set(
            type,
            (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
          );
        },
        emit: (type: string, event: Partial<Event> = {}) => {
          const synthetic = { ...event, target: event.target ?? element } as Event;
          for (const listener of listeners.get(type) ?? []) listener(synthetic);
        },
        focus: vi.fn(),
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element as unknown as HTMLElement);
          if (index >= 0) bodyChildren.splice(index, 1);
        }),
      };
      return element as unknown as HTMLElement & {
        emit(type: string, event?: Partial<Event>): void;
      };
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

function flashKey(
  key: string,
  target: EventTarget | null = null,
  options: { isComposing?: boolean; keyCode?: number } = {},
) {
  return {
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: options.isComposing ?? false,
    keyCode: options.keyCode ?? 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function flashHints(children: readonly HTMLElement[]): HTMLElement[] {
  return children.filter((element) => element.dataset.zoteroNeoFlashHint === '1');
}

function flashPrompt(children: readonly HTMLElement[]): HTMLElement | undefined {
  return children.find((element) => element.dataset.zoteroNeoFlashPrompt === '1');
}

function flashInput(
  children: readonly HTMLElement[],
): (HTMLInputElement & { emit(type: string, event?: Partial<Event>): void }) | undefined {
  return children.find((element) => element.dataset.zoteroNeoFlashInput === '1') as
    | (HTMLInputElement & { emit(type: string, event?: Partial<Event>): void })
    | undefined;
}

function setFlashQuery(children: readonly HTMLElement[], value: string): void {
  const input = flashInput(children);
  if (!input) throw new Error('Expected Flash input');
  input.value = value;
  input.emit('input', { isComposing: false } as unknown as Partial<Event>);
}

function typeFlashKey(
  flash: ReaderFlash,
  created: ReturnType<typeof createFlashWindow>,
  key: string,
): KeyboardEvent {
  const input = flashInput(created.bodyChildren);
  if (!input) throw new Error('Expected Flash input');
  const event = flashKey(key, input);
  flash.handleKey(event, created.pdfWindow);
  if (!(event.preventDefault as ReturnType<typeof vi.fn>).mock.calls.length) {
    if (key === 'Backspace') input.value = Array.from(input.value).slice(0, -1).join('');
    else if (key.length === 1) input.value += key;
    input.emit('input', { isComposing: false } as unknown as Partial<Event>);
  }
  return event;
}

function createFlash() {
  const activations: { intent: string; target: FlashSelectionTarget }[] = [];
  const statuses: string[] = [];
  const debug: string[] = [];
  const flash = new ReaderFlash({
    activate: (intent, _window, target) => activations.push({ intent, target }),
    showStatus: (message) => statuses.push(message),
    debug: (message) => debug.push(message),
  });
  return { flash, activations, statuses, debug };
}

describe('Reader Flash lifecycle', () => {
  it('renders distance-ordered labels and returns the whole selected match', () => {
    const created = createFlashWindow(
      [
        { value: 'target far', left: 500, top: 300 },
        { value: 'target near', left: 30, top: 30 },
      ],
      1,
    );
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    for (const key of 'target') typeFlashKey(flash, created, key);

    const hints = flashHints(created.bodyChildren);
    expect(hints).toHaveLength(2);
    expect(hints.map((hint) => hint.textContent)).toEqual(['S', 'F']);
    expect(activations).toHaveLength(0);

    flash.handleKey(flashKey('S'), created.pdfWindow);
    expect(activations).toHaveLength(1);
    expect(activations[0]?.intent).toBe('visual-start');
    expect(activations[0]?.target.start.textNode).toBe(created.spans[1]?.node);
    expect(activations[0]?.target.start.offset).toBe(0);
    expect(activations[0]?.target.end.offset).toBe(6);
    expect(flash.isOpen).toBe(false);
  });

  it('keeps continuation letters for the query and reserves other letters for labels', () => {
    const created = createFlashWindow([
      { value: 'taste', left: 20, top: 20 },
      { value: 'table', left: 20, top: 50 },
    ]);
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    for (const key of 'ta') typeFlashKey(flash, created, key);

    const labels = flashHints(created.bodyChildren).map((hint) => hint.textContent);
    expect(labels).toHaveLength(2);
    expect(labels).not.toContain('S');
    expect(labels).not.toContain('B');
    typeFlashKey(flash, created, 's');
    expect(activations).toHaveLength(0);
    expect(flashPrompt(created.bodyChildren)?.textContent).toContain('tas (1)');

    flash.handleKey(flashKey('A'), created.pdfWindow);
    expect(activations).toHaveLength(1);
  });

  it('suppresses badge geometry when there are too many matches', () => {
    const created = createFlashWindow(
      Array.from({ length: FLASH_TARGET_LIMIT + 1 }, (_, index) => ({
        value: 'target',
        left: 20 + (index % 6) * 90,
        top: 20 + Math.floor(index / 6) * 24,
      })),
    );
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    for (const key of 'target') typeFlashKey(flash, created, key);

    expect(flashHints(created.bodyChildren)).toHaveLength(0);
    expect(flashPrompt(created.bodyChildren)?.textContent).toContain(
      `(${FLASH_TARGET_LIMIT + 1}) — type more`,
    );
  });

  it('supports fixed-width multi-character labels and Backspace out of label input', () => {
    const created = createFlashWindow(
      Array.from({ length: 30 }, (_, index) => ({
        value: 'target',
        left: 20 + (index % 6) * 90,
        top: 20 + Math.floor(index / 6) * 24,
      })),
    );
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    for (const key of 'target') typeFlashKey(flash, created, key);

    expect(flashHints(created.bodyChildren)[0]?.textContent).toBe('AA');
    flash.handleKey(flashKey('A'), created.pdfWindow);
    expect(activations).toHaveLength(0);
    expect(flashPrompt(created.bodyChildren)?.textContent).toContain('→ A');

    flash.handleKey(flashKey('Backspace'), created.pdfWindow);
    expect(flashHints(created.bodyChildren).filter((hint) => !hint.hidden)).toHaveLength(30);
    expect(flashPrompt(created.bodyChildren)?.textContent).toContain('target (30)');
  });

  it('lets Enter choose the nearest currently labeled endpoint', () => {
    const created = createFlashWindow(
      [
        { value: 'target far', left: 500, top: 300 },
        { value: 'target near', left: 30, top: 30 },
      ],
      1,
    );
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'visual-end');
    for (const key of 'target') typeFlashKey(flash, created, key);

    flash.handleKey(flashKey('Enter'), created.pdfWindow);

    expect(activations).toHaveLength(1);
    expect(activations[0]?.intent).toBe('visual-end');
    expect(activations[0]?.target.start.textNode).toBe(created.spans[1]?.node);
    expect(activations[0]?.target.end.offset).toBe(6);
  });

  it('uses purpose-specific prompts for Visual start and endpoint targeting', () => {
    const created = createFlashWindow([{ value: 'target', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    expect(flashPrompt(created.bodyChildren)?.textContent).toBe('SELECT START: …');
    flash.cancel();
    flash.open(created.pdfWindow, 'visual-end');
    expect(flashPrompt(created.bodyChildren)?.textContent).toBe('SELECT END: …');
  });

  it('commits CJK IME text through the real input without leaking candidate keys', () => {
    const created = createFlashWindow([{ value: '机器学习 方法', left: 20, top: 20 }]);
    const { flash, activations } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    const input = flashInput(created.bodyChildren);
    if (!input) throw new Error('Expected Flash input');

    input.emit('compositionstart');
    input.value = 'jiqi';
    input.emit('input', { isComposing: true } as unknown as Partial<Event>);
    expect(flashHints(created.bodyChildren)).toHaveLength(0);

    const enter = flashKey('Enter', input, { isComposing: true, keyCode: 229 });
    flash.handleKey(enter, created.pdfWindow);
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(activations).toHaveLength(0);

    input.value = '机器';
    input.emit('compositionend');
    input.emit('input', { isComposing: false } as unknown as Partial<Event>);
    expect(flashPrompt(created.bodyChildren)?.textContent).toContain('机器 (1)');
    expect(flashHints(created.bodyChildren)).toHaveLength(1);
  });

  it('leaves Backspace to the browser input instead of slicing UTF-16 query text', () => {
    const created = createFlashWindow([{ value: '😀 emoji', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    setFlashQuery(created.bodyChildren, '😀');
    const input = flashInput(created.bodyChildren);
    if (!input) throw new Error('Expected Flash input');

    const backspace = flashKey('Backspace', input);
    flash.handleKey(backspace, created.pdfWindow);
    expect(backspace.preventDefault).not.toHaveBeenCalled();
    input.value = '';
    input.emit('input', { isComposing: false } as unknown as Partial<Event>);
    expect(flashPrompt(created.bodyChildren)?.textContent).toBe('SELECT START: …');
  });

  it('cancels instead of reindexing when the viewport changes', () => {
    const created = createFlashWindow([{ value: 'visible text', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(created.pdfWindow, 'visual-start');
    expect(flash.isOpen).toBe(true);

    flash.onViewportChange(created.pdfWindow);

    expect(flash.isOpen).toBe(false);
    expect(created.bodyChildren).toHaveLength(0);
  });

  it('cancels and yields an event that arrives from another split view', () => {
    const primary = createFlashWindow([{ value: 'primary', left: 20, top: 20 }]);
    const secondary = createFlashWindow([{ value: 'secondary', left: 20, top: 20 }]);
    const { flash } = createFlash();
    flash.open(primary.pdfWindow, 'visual-end');
    const event = flashKey('j');

    expect(flash.handleKey(event, secondary.pdfWindow)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(flash.isOpen).toBe(false);
  });
});
