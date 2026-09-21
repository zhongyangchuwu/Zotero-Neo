import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';
import { SelectionStore } from '../../src/main/selection-store';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

describe('Main Visual Selection', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('keeps Visual transient, commits all-or-none to Selection, and advances Normal Space', () => {
    const items = Array.from(
      { length: 5 },
      (_unused, index) => ({ id: 10 + index, libraryID: 1 }) as Zotero.Item,
    );
    let focused = 1;
    let pivot = 1;
    const selected = new Set<number>([0, 2]);
    const active = { id: 'item-tree-row-1' } as unknown as Element;
    const root = { contains: (node: unknown) => node === active } as HTMLElement;

    const select = vi.fn((index: number) => {
      pivot = index;
      focused = index;
      selected.clear();
      selected.add(index);
    });
    const shiftSelect = vi.fn((index: number) => {
      focused = index;
      selected.clear();
      const start = Math.min(pivot, index);
      const end = Math.max(pivot, index);
      for (let row = start; row <= end; row += 1) selected.add(row);
    });
    const toggleSelect = vi.fn((index: number) => {
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      pivot = index;
      focused = index;
    });
    const clearSelection = vi.fn(() => selected.clear());
    const moveFocused = vi.fn((index: number) => {
      focused = index;
      pivot = index;
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
      get focused() {
        return focused;
      },
      select,
      shiftSelect,
      toggleSelect,
      clearSelection,
    };
    const view = {
      domEl: root,
      rowCount: items.length,
      selection,
      tree: { _onSelection: moveFocused },
      getRow: (index: number) => ({ isObjectRow: true, ref: items[index] }),
      getRowIndexByID: (id: number) => {
        const index = items.findIndex((item) => item.id === id);
        return index < 0 ? false : index;
      },
      ensureRowIsVisible: vi.fn(),
    };
    const window = {
      document,
      ZoteroPane: { itemsView: view },
      setTimeout: (fn: () => void) => setTimeout(fn, 5000) as unknown as number,
      clearTimeout: (timer: number) =>
        clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    } as unknown as MainWindow;
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 10 });
    store.add({ libraryID: 1, itemID: 12 });
    const feature = new MainItemSelect(logger);

    expect(feature.enter(window)).toBe('entered');
    expect(store.values()).toEqual([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 12 },
    ]);
    expect([...selected]).toEqual([1]);

    feature.extend(window, 1, 2);
    expect([...selected]).toEqual([1, 2, 3]);
    expect(store.size).toBe(2);

    feature.swapEnds(window);
    expect([...selected]).toEqual([1, 2, 3]);

    feature.cancel(window, store);
    expect(new Set(selected)).toEqual(new Set([0, 2]));
    expect(focused).toBe(1);
    expect(store.size).toBe(2);

    expect(feature.enter(window)).toBe('entered');
    feature.extend(window, 1, 2);
    expect(feature.commit(window, store)).toBe(4);
    expect(store.values()).toEqual([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 12 },
      { libraryID: 1, itemID: 11 },
      { libraryID: 1, itemID: 13 },
    ]);
    expect(new Set(selected)).toEqual(new Set([0, 1, 2, 3]));
    expect(focused).toBe(3);

    expect(feature.toggleCursor(window, store)).toBe(true);
    expect(store.has({ libraryID: 1, itemID: 13 })).toBe(false);
    expect(store.size).toBe(3);
    expect(new Set(selected)).toEqual(new Set([0, 1, 2]));
    expect(focused).toBe(4);

    feature.removeWindow(window);
  });
});
