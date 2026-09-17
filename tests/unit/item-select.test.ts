import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

describe('Main Item Select', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('mutates only Zotero native pivot/focus selection while Main owns modal input', () => {
    let pivot = 2;
    let focused = 2;
    let count = 1;
    const active = { id: 'item-tree-row-2' } as unknown as Element;
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
    const badge = {
      id: '',
      style: { cssText: '', display: '' },
      textContent: '',
      remove: vi.fn(),
    } as unknown as HTMLElement;
    const document = {
      activeElement: active,
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
        itemsView: { domEl: root, rowCount: 10, selection, ensureRowIsVisible: vi.fn() },
      },
      setTimeout: (fn: () => void) => setTimeout(fn, 5000) as unknown as number,
      clearTimeout: (timer: number) =>
        clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    } as unknown as MainWindow;
    const feature = new MainItemSelect(logger);

    expect(feature.enter(window)).toBe('entered');
    feature.extend(window, 1, 1, false);
    feature.extend(window, 1, 3, false);
    expect(count).toBe(5);
    feature.swapEnds(window);
    expect(pivot).toBe(6);
    expect(focused).toBe(2);
    expect(feature.finish(window)).toBe(5);

    feature.enter(window);
    feature.extend(window, 1, 2, false);
    const focusedBeforeCancel = focused;
    feature.cancel(window);
    expect(count).toBe(1);
    expect(focused).toBe(focusedBeforeCancel);
    feature.removeWindow(window);
  });
});
