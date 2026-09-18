import { describe, expect, it, vi } from 'vitest';

import { ReaderSelectionRange } from '../../src/reader/selection-range';
import type { PdfWindow, ReaderMode } from '../../src/reader/types';

function textNode(value = 'abcdef'): Text {
  return {
    nodeType: 3,
    data: value,
    length: value.length,
    isConnected: true,
    compareDocumentPosition: () => 0,
  } as unknown as Text;
}

function rangeWindow() {
  const node = textNode();
  const modify = vi.fn();
  const setBaseAndExtent = vi.fn();
  const removeAttribute = vi.fn();
  const setAttribute = vi.fn();
  const appendChild = vi.fn();
  const cursorRemove = vi.fn();
  let style: HTMLStyleElement | null = null;
  const selection = {
    anchorNode: node,
    anchorOffset: 1,
    focusNode: node,
    focusOffset: 3,
    isCollapsed: false,
    rangeCount: 1,
    modify,
    setBaseAndExtent,
    getRangeAt: () => ({
      startContainer: node,
      startOffset: 1,
      endContainer: node,
      endOffset: 3,
    }),
  } as unknown as Selection;
  const document = {
    querySelector: (selector: string) => {
      if (selector === 'style[data-zv-select-selection]') return style;
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector === '[data-zv-cursor]' ? [{ remove: cursorRemove }] : [],
    createElement: (tag: string) => {
      if (tag !== 'style') throw new Error(`Unexpected tag: ${tag}`);
      style = { dataset: {}, textContent: '' } as unknown as HTMLStyleElement;
      return style;
    },
    createRange: () => ({
      setStart: vi.fn(),
      collapse: vi.fn(),
      getBoundingClientRect: () => ({
        width: 1,
        height: 1,
        top: 100,
        bottom: 101,
      }),
    }),
    documentElement: {
      appendChild,
      setAttribute,
      removeAttribute,
    },
  } as unknown as Document;
  const pdfWindow = {
    document,
    getSelection: () => selection,
  } as unknown as PdfWindow;
  return {
    node,
    selection,
    pdfWindow,
    modify,
    setBaseAndExtent,
    setAttribute,
    removeAttribute,
    appendChild,
    cursorRemove,
  };
}

function harness(initialMode: ReaderMode = 'visual') {
  const view = rangeWindow();
  let mode = initialMode;
  const invalidateNativeSelection = vi.fn();
  const noteOwner = vi.fn();
  const updateIndicator = vi.fn();
  const showStatus = vi.fn();
  const scrollBy = vi.fn();
  const openFlash = vi.fn();
  const container = { clientHeight: 600 } as HTMLElement;
  const owner = new ReaderSelectionRange({
    mode: () => mode,
    setModeVisual: () => {
      mode = 'visual';
    },
    invalidateNativeSelection,
    noteOwner,
    updateIndicator,
    showStatus,
    scrollContainer: () => container,
    scrollBy,
    openFlash,
  });
  return {
    ...view,
    owner,
    mode: () => mode,
    invalidateNativeSelection,
    noteOwner,
    updateIndicator,
    showStatus,
    scrollBy,
    openFlash,
  };
}

describe('ReaderSelectionRange', () => {
  it('owns the Select anchor while local motions invalidate stale native popup geometry', () => {
    const test = harness();

    test.owner.modify(test.pdfWindow, 'forward', 'character');

    expect(test.modify).toHaveBeenCalledWith('extend', 'forward', 'character');
    expect(test.invalidateNativeSelection).toHaveBeenCalledOnce();
    expect(test.noteOwner).toHaveBeenCalledOnce();
    expect(test.updateIndicator).toHaveBeenCalledOnce();
    expect(test.setAttribute).toHaveBeenCalledWith('data-zv-select-active', '');
    expect(test.appendChild).toHaveBeenCalledOnce();
    expect(test.scrollBy).not.toHaveBeenCalled();

    test.owner.leave();
    expect(test.removeAttribute).toHaveBeenCalledWith('data-zv-select-active');
  });

  it('adopts Flash targets, swaps endpoints, and cleans released view markers', () => {
    const test = harness('normal');
    const target = {
      start: { textNode: test.node, offset: 1 },
      end: { textNode: test.node, offset: 3 },
    };

    test.owner.activateFlashTarget('visual-start', test.pdfWindow, target);

    expect(test.mode()).toBe('visual');
    expect(test.invalidateNativeSelection).toHaveBeenCalledOnce();
    expect(test.setBaseAndExtent).toHaveBeenNthCalledWith(1, test.node, 1, test.node, 3);
    expect(test.showStatus).toHaveBeenCalledWith('✓ selection started', 650);

    test.owner.swapEnds(test.pdfWindow);
    expect(test.setBaseAndExtent).toHaveBeenNthCalledWith(2, test.node, 3, test.node, 1);

    test.owner.releaseView(test.pdfWindow);
    expect(test.removeAttribute).toHaveBeenCalledWith('data-zv-select-active');
  });

  it('starts Flash when Select has no existing native range', () => {
    const test = harness('normal');
    Reflect.set(test.selection, 'isCollapsed', true);

    test.owner.enter(test.pdfWindow);

    expect(test.openFlash).toHaveBeenCalledWith(test.pdfWindow, 'visual-start');
    expect(test.mode()).toBe('normal');
  });
});
