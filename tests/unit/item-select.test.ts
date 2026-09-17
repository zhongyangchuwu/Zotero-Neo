import { describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

function keyEvent(key: string, target: EventTarget): KeyboardEvent {
  let prevented = false;
  return {
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('Main Item Select', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('uses Zotero native pivot/focus selection and distinguishes finish from cancel', () => {
    let keydown: EventListener | undefined;
    let pivot = 2;
    let focused = 2;
    let count = 1;
    const active = {
      id: 'item-tree-row-2',
      tagName: 'DIV',
      localName: 'div',
    } as unknown as Element;
    const root = { contains: (node: unknown) => node === active } as HTMLElement;
    const select = vi.fn((index: number) => {
      pivot = index;
      focused = index;
      count = 1;
    });
    const shiftSelect = vi.fn((index: number) => {
      focused = index;
      count = Math.abs(pivot - focused) + 1;
    });
    const ensureRowIsVisible = vi.fn();
    const badge = {
      id: '',
      style: { cssText: '', display: '' },
      textContent: '',
      remove: vi.fn(),
    } as unknown as HTMLElement;
    const document = {
      activeElement: active,
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
      getElementById: () => null,
      querySelector: () => null,
      createElementNS: () => badge,
      body: { append: vi.fn() },
      documentElement: { append: vi.fn() },
    } as unknown as Document;
    const selection = {
      get pivot() {
        return pivot;
      },
      set pivot(value: number) {
        pivot = value;
      },
      get focused() {
        return focused;
      },
      get count() {
        return count;
      },
      select,
      shiftSelect,
    };
    const window = {
      document,
      ZoteroPane: {
        itemsView: {
          domEl: root,
          rowCount: 10,
          selection,
          ensureRowIsVisible,
        },
      },
      setTimeout: (fn: () => void) => setTimeout(fn, 5000) as unknown as number,
      clearTimeout: (timer: number) =>
        clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    } as unknown as MainWindow;
    const feature = new MainItemSelect(logger);
    feature.addWindow(window);

    keydown?.(keyEvent('v', active));
    expect(select).toHaveBeenCalledWith(2);

    keydown?.(keyEvent('j', active));
    expect(shiftSelect).toHaveBeenLastCalledWith(3, false, false);
    expect(count).toBe(2);

    keydown?.(keyEvent('3', active));
    keydown?.(keyEvent('j', active));
    expect(shiftSelect).toHaveBeenLastCalledWith(6, false, false);
    expect(count).toBe(5);

    keydown?.(keyEvent('o', active));
    expect(pivot).toBe(6);
    expect(focused).toBe(2);
    expect(count).toBe(5);

    keydown?.(keyEvent('v', active));
    expect(count).toBe(5);

    keydown?.(keyEvent('v', active));
    keydown?.(keyEvent('2', active));
    keydown?.(keyEvent('j', active));
    expect(count).toBe(3);
    const focusedBeforeCancel = focused;
    keydown?.(keyEvent('Escape', active));
    expect(count).toBe(1);
    expect(focused).toBe(focusedBeforeCancel);

    feature.removeWindow(window);
  });
});
