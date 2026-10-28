import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderSelectionRange } from '../../src/modules/reader-selection/selection-range';
import type { PdfWindow, ReaderMode } from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
let deadObjects = new WeakSet<object>();
beforeEach(() => {
  deadObjects = new WeakSet();
  Reflect.set(globalThis, 'Components', {
    utils: { isDeadWrapper: (value: object) => deadObjects.has(value) },
  });
});
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

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
  let style: HTMLStyleElement | null = null;
  const appendChild = vi.fn((element: HTMLStyleElement) => {
    style = element;
  });
  const cursorRemove = vi.fn();
  const styleRemove = vi.fn();
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
      const element = {
        dataset: {},
        textContent: '',
        remove: () => {
          styleRemove();
          if (style === element) style = null;
        },
      } as unknown as HTMLStyleElement;
      return element;
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
  Reflect.set(node, 'ownerDocument', document);
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
    styleRemove,
  };
}

function harness(
  initialMode: ReaderMode = 'visual',
  isCurrent: (view: PdfWindow) => boolean = () => true,
  captureView: (view: PdfWindow) => () => boolean = () => () => true,
) {
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
    isCurrent,
    captureView,
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
    expect(test.styleRemove).toHaveBeenCalledOnce();
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

  it('releases a destroyed Select view without blocking surviving-view cleanup', () => {
    const test = harness();
    const surviving = rangeWindow();
    test.owner.refresh(test.pdfWindow, false);
    test.owner.refresh(surviving.pdfWindow, false);
    const deadDocument = vi.fn(() => {
      throw new TypeError("can't access dead object");
    });
    Object.defineProperty(test.pdfWindow, 'document', { get: deadDocument });
    deadObjects.add(test.pdfWindow);

    test.owner.releaseView(test.pdfWindow);
    deadObjects.delete(test.pdfWindow);
    test.owner.leave();

    expect(deadDocument).not.toHaveBeenCalled();
    expect(surviving.removeAttribute).toHaveBeenCalledWith('data-zv-select-active');
    expect(surviving.cursorRemove).toHaveBeenCalled();
  });

  it('starts Flash when Select has no existing native range', () => {
    const test = harness('normal');
    Reflect.set(test.selection, 'isCollapsed', true);

    test.owner.enter(test.pdfWindow);

    expect(test.openFlash).toHaveBeenCalledWith(test.pdfWindow, 'visual-start');
    expect(test.mode()).toBe('normal');
  });
  it('reacquires anchors from the active split view and after leave', () => {
    const test = harness();
    const other = rangeWindow();
    test.owner.enter(test.pdfWindow);
    test.owner.swapEnds(other.pdfWindow);
    expect(other.setBaseAndExtent).toHaveBeenCalledWith(other.node, 3, other.node, 1);

    test.owner.leave();
    Reflect.set(test.selection, 'anchorOffset', 2);
    test.owner.activateFlashTarget('visual-end', test.pdfWindow, {
      start: { textNode: test.node, offset: 4 },
      end: { textNode: test.node, offset: 5 },
    });
    expect(test.setBaseAndExtent).toHaveBeenCalledWith(test.node, 2, test.node, 5);
  });

  it('rejects retired view callbacks and drains all view cleanup after a failure', () => {
    let current = true;
    const test = harness('visual', () => current);
    const other = rangeWindow();
    test.owner.enter(test.pdfWindow);
    test.owner.refresh(other.pdfWindow, false);
    const failure = new Error('marker removal failed');
    test.removeAttribute.mockImplementation(() => {
      throw failure;
    });
    current = false;
    test.owner.activateFlashTarget('visual-start', test.pdfWindow, {
      start: { textNode: test.node, offset: 0 },
      end: { textNode: test.node, offset: 1 },
    });
    expect(test.setBaseAndExtent).not.toHaveBeenCalled();
    expect(() => test.owner.dispose()).toThrow(failure);
    expect(test.cursorRemove).toHaveBeenCalled();
    expect(other.removeAttribute).toHaveBeenCalled();
    current = true;
    test.owner.modify(test.pdfWindow, 'forward', 'character');
    expect(test.modify).not.toHaveBeenCalled();
  });

  it('releases only the retired view anchor while preserving the surviving view', () => {
    const test = harness();
    const other = rangeWindow();
    test.owner.enter(test.pdfWindow);
    test.owner.refresh(other.pdfWindow, false);
    test.owner.releaseView(other.pdfWindow);
    test.owner.swapEnds(test.pdfWindow);
    expect(test.setBaseAndExtent).toHaveBeenCalledWith(test.node, 3, test.node, 1);
    test.owner.releaseView(test.pdfWindow);
    Reflect.set(test.selection, 'anchorOffset', 2);
    test.owner.activateFlashTarget('visual-end', test.pdfWindow, {
      start: { textNode: test.node, offset: 4 },
      end: { textNode: test.node, offset: 5 },
    });
    expect(test.setBaseAndExtent).toHaveBeenLastCalledWith(test.node, 2, test.node, 5);
  });

  it('keeps one style lease across refreshes and removes only the released view style', () => {
    const test = harness();
    const other = rangeWindow();
    test.owner.refresh(test.pdfWindow, false);
    test.owner.refresh(test.pdfWindow, false);
    test.owner.refresh(other.pdfWindow, false);
    expect(test.appendChild).toHaveBeenCalledOnce();
    test.owner.releaseView(test.pdfWindow);
    expect(test.styleRemove).toHaveBeenCalledOnce();
    expect(other.styleRemove).not.toHaveBeenCalled();
    test.owner.dispose();
    expect(other.styleRemove).toHaveBeenCalledOnce();
  });

  it('does not let a late decoration disposer remove a successor lease', () => {
    const test = harness();
    test.setAttribute.mockImplementationOnce(() => {
      test.owner.leave();
      test.owner.refresh(test.pdfWindow, false);
    });
    test.owner.refresh(test.pdfWindow, false);
    expect(test.pdfWindow.document.querySelector('style[data-zv-select-selection]')).not.toBeNull();
    expect(test.appendChild).toHaveBeenCalledTimes(2);
    test.owner.dispose();
    expect(test.pdfWindow.document.querySelector('style[data-zv-select-selection]')).toBeNull();
  });
  it('reacquires anchor and style when a native view changes on the same window', () => {
    let view = 0;
    const test = harness(
      'visual',
      () => true,
      () => {
        const captured = view;
        return () => view === captured;
      },
    );
    test.owner.enter(test.pdfWindow);
    view += 1;
    Reflect.set(test.selection, 'anchorOffset', 2);
    test.owner.activateFlashTarget('visual-end', test.pdfWindow, {
      start: { textNode: test.node, offset: 4 },
      end: { textNode: test.node, offset: 5 },
    });
    expect(test.setBaseAndExtent).toHaveBeenLastCalledWith(test.node, 2, test.node, 5);
    expect(test.styleRemove).toHaveBeenCalledOnce();
    expect(test.appendChild).toHaveBeenCalledTimes(2);
    test.owner.dispose();
    expect(test.styleRemove).toHaveBeenCalledTimes(2);
  });
});
