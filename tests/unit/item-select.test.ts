import { describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

function visualHost() {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    ref: { id: 100 + index, libraryID: 1 },
  }));
  const active = { id: 'item-tree-row-2' } as unknown as Element;
  const selection = {
    focused: 2,
    pivot: 2,
    selected: new Set([0, 6]),
    _updateTree: vi.fn(),
  };
  const tree = {
    _onSelection: vi.fn(
      (
        index: number,
        _shiftSelect: boolean,
        _toggleSelection: boolean,
        moveFocused: boolean,
      ) => {
        if (!moveFocused) return;
        selection.focused = index;
        selection.pivot = index;
      },
    ),
    invalidate: vi.fn(),
  };
  const badge = {
    id: '',
    style: { cssText: '', display: '' },
    textContent: '',
    remove: vi.fn(),
  } as unknown as HTMLElement;
  const itemsView = {
    rowCount: rows.length,
    domEl: { contains: (node: unknown) => node === active },
    tree,
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: string) => rows.findIndex((row) => row.ref.id === Number(id)),
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
    ZoteroPane: { itemsView },
    setTimeout: (fn: () => void) => setTimeout(fn, 5000) as unknown as number,
    clearTimeout: (timer: number) =>
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
  } as unknown as MainWindow;
  return { window, selection, tree, badge };
}

describe('Main Visual range', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('tracks anchor/head identities and makes grow then shrink reversible', () => {
    const host = visualHost();
    const feature = new MainItemSelect(logger);

    expect(feature.enter(host.window)).toBe('entered');
    expect(feature.target(host.window).map((ref) => ref.itemID)).toEqual([102]);
    expect([...host.selection.selected]).toEqual([2]);

    feature.extend(host.window, 1, 3);
    expect(feature.target(host.window).map((ref) => ref.itemID)).toEqual([102, 103, 104, 105]);
    expect([...host.selection.selected]).toEqual([2, 3, 4, 5]);
    expect(host.selection.focused).toBe(5);

    feature.extend(host.window, -1, 2);
    expect(feature.target(host.window).map((ref) => ref.itemID)).toEqual([102, 103]);
    expect([...host.selection.selected]).toEqual([2, 3]);
    expect(host.selection.focused).toBe(3);
  });

  it('swaps Visual endpoints without changing the represented range', () => {
    const host = visualHost();
    const feature = new MainItemSelect(logger);

    feature.enter(host.window);
    feature.extend(host.window, 1, 3);
    feature.swapEnds(host.window);

    expect(feature.target(host.window).map((ref) => ref.itemID)).toEqual([102, 103, 104, 105]);
    expect(host.selection.focused).toBe(2);
  });

  it('cancels transient Visual state without owning committed Selection', () => {
    const host = visualHost();
    const feature = new MainItemSelect(logger);

    feature.enter(host.window);
    feature.extend(host.window, 1, 2);
    expect(feature.active(host.window)).toBe(true);

    feature.cancel(host.window);
    expect(feature.active(host.window)).toBe(false);
    expect(feature.target(host.window)).toEqual([]);
    feature.removeWindow(host.window);
  });
});
