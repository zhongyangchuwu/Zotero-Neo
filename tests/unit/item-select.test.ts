import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';
import { SelectionStore } from '../../src/main/selection-store';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

function item(id: number): Zotero.Item {
  return { id, libraryID: 1 } as Zotero.Item;
}

function harness(focusedRow = 0) {
  const rows = [item(10), item(11), item(12), item(13), item(14)].map((ref) => ({
    isObjectRow: true,
    ref,
  }));
  let focused = focusedRow;
  let pivot = focusedRow;
  let selected = new Set<number>([focusedRow]);
  const active = { id: `item-tree-row-${focusedRow}` } as unknown as Element;
  const root = { contains: (node: unknown) => node === active } as HTMLElement;
  const badge = {
    id: '',
    style: { cssText: '', display: '' },
    textContent: '',
    remove: vi.fn(),
  } as unknown as HTMLElement;

  const select = vi.fn((index: number) => {
    pivot = index;
    focused = index;
    selected = new Set([index]);
  });
  const shiftSelect = vi.fn((index: number) => {
    focused = index;
    const first = Math.min(pivot, index);
    const last = Math.max(pivot, index);
    selected = new Set(Array.from({ length: last - first + 1 }, (_, offset) => first + offset));
  });
  const toggleSelect = vi.fn((index: number) => {
    focused = index;
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
  });
  const clearSelection = vi.fn(() => {
    selected.clear();
  });
  const onSelection = vi.fn(
    (index: number, _shiftSelect: boolean, toggleSelection: boolean, moveFocused: boolean) => {
      if (toggleSelection) toggleSelect(index);
      if (moveFocused) focused = index;
    },
  );

  const selection = {
    get pivot() {
      return pivot;
    },
    get focused() {
      return focused;
    },
    get count() {
      return selected.size;
    },
    select,
    shiftSelect,
    toggleSelect,
    clearSelection,
  };
  const view = {
    domEl: root,
    tree: { _onSelection: onSelection },
    rowCount: rows.length,
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: number) => {
      const index = rows.findIndex((row) => row.ref.id === id);
      return index < 0 ? false : index;
    },
    ensureRowIsVisible: vi.fn(),
  };
  const document = {
    activeElement: active,
    getElementById: () => null,
    querySelector: () => null,
    createElementNS: () => badge,
    body: { append: vi.fn() },
    documentElement: { append: vi.fn() },
  } as unknown as Document;
  const window = {
    document,
    ZoteroPane: { itemsView: view },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  } as unknown as MainWindow;

  return {
    window,
    rows,
    selection,
    selectedRows: () => [...selected].sort((left, right) => left - right),
    focusedRow: () => focused,
  };
}

function selectedIDs(store: SelectionStore): number[] {
  return store
    .values()
    .map((ref) => ref.itemID)
    .sort((left, right) => left - right);
}

describe('Main Visual Selection', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('toggles Cursor items into the workset and advances without collapsing it', () => {
    const host = harness(1);
    const store = new SelectionStore();
    const feature = new MainItemSelect(logger);

    expect(feature.toggleCursor(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([11]);
    expect(host.selectedRows()).toEqual([1]);
    expect(host.focusedRow()).toBe(2);

    expect(feature.toggleCursor(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([11, 12]);
    expect(host.selectedRows()).toEqual([1, 2]);
    expect(host.focusedRow()).toBe(3);
  });

  it('grows, shrinks and swaps Visual without mutating Selection, then cancels cleanly', () => {
    const host = harness(1);
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 10 });
    store.add({ libraryID: 1, itemID: 12 });
    const feature = new MainItemSelect(logger);

    expect(feature.enter(host.window, store)).toBe('entered');
    expect(host.selectedRows()).toEqual([1]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.extend(host.window, 1, 3, store);
    expect(host.selectedRows()).toEqual([1, 2, 3, 4]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.extend(host.window, -1, 2, store);
    expect(host.selectedRows()).toEqual([1, 2]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.swapEnds(host.window, store);
    expect(host.selectedRows()).toEqual([1, 2]);
    expect(host.focusedRow()).toBe(1);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.cancel(host.window, store);
    expect(selectedIDs(store)).toEqual([10, 12]);
    expect(host.selectedRows()).toEqual([0, 2]);
    expect(host.focusedRow()).toBe(1);
  });

  it('commits Visual with the all-or-none target rule', () => {
    const host = harness(1);
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 10 });
    store.add({ libraryID: 1, itemID: 12 });
    const feature = new MainItemSelect(logger);

    expect(feature.enter(host.window, store)).toBe('entered');
    feature.extend(host.window, 1, 2, store);
    expect(feature.finish(host.window, store)).toBe(3);
    expect(selectedIDs(store)).toEqual([10, 11, 12, 13]);
    expect(host.selectedRows()).toEqual([0, 1, 2, 3]);
    expect(host.focusedRow()).toBe(3);

    expect(feature.enter(host.window, store)).toBe('entered');
    feature.extend(host.window, -1, 2, store);
    expect(feature.finish(host.window, store)).toBe(3);
    expect(selectedIDs(store)).toEqual([10]);
    expect(host.selectedRows()).toEqual([0]);
    expect(host.focusedRow()).toBe(1);
  });
});
