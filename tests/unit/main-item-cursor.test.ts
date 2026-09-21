import { describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  mainCursorItemRef,
  mainItemRefAtRow,
  mainItemRowIndex,
  moveMainItemCursor,
  visibleMainItemRefs,
} from '../../src/main/host';

function itemWindow() {
  const rows = [
    { ref: { id: 10, libraryID: 1 } },
    { ref: { id: 11, libraryID: 1 } },
    { ref: { id: 12, libraryID: 2 } },
  ];
  const selection = {
    focused: 1,
    pivot: 1,
    selected: new Set([0, 2]),
  };
  const onSelection = vi.fn(
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
  );
  const itemsView = {
    rowCount: rows.length,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: string) => rows.findIndex((row) => row.ref.id === Number(id)),
    selection,
    tree: { _onSelection: onSelection },
    ensureRowIsVisible: vi.fn(),
  };
  const window = {
    ZoteroPane: { itemsView },
  } as unknown as MainWindow;
  return { window, rows, selection, itemsView, onSelection };
}

describe('Main item cursor host adapter', () => {
  it('maps visible rows and focused cursor to stable item identities', () => {
    const host = itemWindow();

    expect(mainItemRefAtRow(host.window, 1)).toEqual({ libraryID: 1, itemID: 11 });
    expect(mainCursorItemRef(host.window)).toEqual({ libraryID: 1, itemID: 11 });
    expect(visibleMainItemRefs(host.window)).toEqual([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 11 },
      { libraryID: 2, itemID: 12 },
    ]);
    expect(mainItemRowIndex(host.window, 12)).toBe(2);
    expect(mainItemRowIndex(host.window, 99)).toBeUndefined();
  });

  it('uses Zotero focus-only movement without changing native selected rows', () => {
    const host = itemWindow();
    const selectedBefore = [...host.selection.selected];

    expect(moveMainItemCursor(host.window, 2, true)).toBe(true);

    expect(host.onSelection).toHaveBeenCalledWith(2, false, false, true, true);
    expect(host.selection.focused).toBe(2);
    expect(host.selection.pivot).toBe(2);
    expect([...host.selection.selected]).toEqual(selectedBefore);
  });

  it(
    'fails closed instead of collapsing selection when focus-only host seams are unavailable',
    () => {
    const selection = {
      focused: 1,
      pivot: 1,
      selected: new Set([0, 1]),
    };
    const select = vi.fn();
    const window = {
      ZoteroPane: {
        itemsView: {
          rowCount: 3,
          selection: { ...selection, select },
          tree: {},
        },
      },
    } as unknown as MainWindow;

      expect(moveMainItemCursor(window, 2)).toBe(false);
      expect(select).not.toHaveBeenCalled();
    },
  );

  it('supports the equivalent private focused/pivot seam as a guarded fallback', () => {
    const update = vi.fn();
    const invalidate = vi.fn();
    const ensure = vi.fn();
    const selection = {
      focused: 0,
      pivot: 0,
      selected: new Set([0, 2]),
      _updateTree: update,
    };
    const window = {
      ZoteroPane: {
        itemsView: {
          rowCount: 3,
          selection,
          tree: { invalidateRow: invalidate },
          ensureRowIsVisible: ensure,
        },
      },
    } as unknown as MainWindow;

    expect(moveMainItemCursor(window, 1, true)).toBe(true);
    expect(selection.focused).toBe(1);
    expect(selection.pivot).toBe(1);
    expect([...selection.selected]).toEqual([0, 2]);
    expect(update).toHaveBeenCalledWith(true);
    expect(invalidate).toHaveBeenCalledWith(0);
    expect(invalidate).toHaveBeenCalledWith(1);
    expect(ensure).toHaveBeenCalledWith(1);
  });
});
