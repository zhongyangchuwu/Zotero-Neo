import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import {
  currentMainItemCursorRef,
  mainItemRefAtRow,
  mainItemRowForRef,
  mainItemViewSettled,
  observeMainItemView,
  moveMainItemCursor,
  restoreMainItemCursor,
  visibleMainSelectionCount,
} from '../../src/main/host';

describe('Main item Cursor host adapter', () => {
  it('uses Zotero focus-only selection movement without collapsing native selection', () => {
    const select = vi.fn();
    const ensureRowIsVisible = vi.fn();
    const onSelection = vi.fn(
      (
        index: number,
        shiftSelect: boolean,
        toggleSelection: boolean,
        moveFocused: boolean,
        shouldDebounce?: boolean,
      ) => {
        expect(index).toBe(4);
        expect(shiftSelect).toBe(false);
        expect(toggleSelection).toBe(false);
        expect(moveFocused).toBe(true);
        expect(shouldDebounce).toBe(true);
      },
    );
    const window = {
      ZoteroPane: {
        itemsView: {
          rowCount: 8,
          tree: { _onSelection: onSelection },
          selection: { focused: 2, count: 3, select },
          ensureRowIsVisible,
        },
      },
    } as unknown as MainWindow;

    expect(moveMainItemCursor(window, 4, true)).toBe(true);
    expect(onSelection).toHaveBeenCalledOnce();
    expect(ensureRowIsVisible).toHaveBeenCalledWith(4);
    expect(select).not.toHaveBeenCalled();
  });

  it('clamps the cursor target and fails closed when the host seam is unavailable', () => {
    const onSelection = vi.fn();
    const available = {
      ZoteroPane: {
        itemsView: { rowCount: 3, tree: { _onSelection: onSelection } },
      },
    } as unknown as MainWindow;
    expect(moveMainItemCursor(available, 20)).toBe(true);
    expect(onSelection).toHaveBeenCalledWith(2, false, false, true, false);

    const unavailable = {
      ZoteroPane: { itemsView: { rowCount: 3, tree: {} } },
    } as unknown as MainWindow;
    expect(moveMainItemCursor(unavailable, 1)).toBe(false);
  });
  it('maps visible rows to stable item identities and restores Cursor after reordering', () => {
    const itemA = { id: 10, libraryID: 1 } as Zotero.Item;
    const itemB = { id: 11, libraryID: 1 } as Zotero.Item;
    const itemC = { id: 12, libraryID: 1 } as Zotero.Item;
    let rows = [
      { isObjectRow: true, ref: itemA },
      { isObjectRow: true, ref: itemB },
      { isObjectRow: true, ref: itemC },
    ];
    let focused = 1;
    const onSelection = vi.fn((index: number) => {
      focused = index;
    });
    const view = {
      get rowCount() {
        return rows.length;
      },
      tree: { _onSelection: onSelection },
      selection: {
        get focused() {
          return focused;
        },
      },
      getRow: (index: number) => rows[index],
      getRowIndexByID: (id: number) => {
        const index = rows.findIndex((row) => row.ref.id === id);
        return index < 0 ? false : index;
      },
      ensureRowIsVisible: vi.fn(),
    };
    const window = { ZoteroPane: { itemsView: view } } as unknown as MainWindow;

    expect(currentMainItemCursorRef(window)).toEqual({ libraryID: 1, itemID: 11 });
    expect(mainItemRefAtRow(window, 2)).toEqual({ libraryID: 1, itemID: 12 });

    const bookmark = currentMainItemCursorRef(window)!;
    rows = [rows[2]!, rows[0]!, rows[1]!];

    expect(mainItemRowForRef(window, bookmark)).toBe(2);
    expect(restoreMainItemCursor(window, bookmark)).toBe(true);
    expect(focused).toBe(2);
    expect(onSelection).toHaveBeenLastCalledWith(2, false, false, true, false);
  });

  it('observes settled item-tree selection and refresh lifecycle events with cleanup', () => {
    const selectListeners = new Set<() => void>();
    const refreshListeners = new Set<() => void>();
    const binding = (listeners: Set<() => void>) => ({
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
    });
    const view = {
      _loadingDeferredResolved: true,
      onSelect: binding(selectListeners),
      onRefresh: binding(refreshListeners),
    };
    const window = { ZoteroPane: { itemsView: view } } as unknown as MainWindow;
    const onSelect = vi.fn();
    const onRefresh = vi.fn();

    expect(mainItemViewSettled(window)).toBe(true);
    const cleanup = observeMainItemView(window, { onSelect, onRefresh });
    expect(selectListeners.size).toBe(1);
    expect(refreshListeners.size).toBe(1);

    [...selectListeners][0]!();
    [...refreshListeners][0]!();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();

    Reflect.set(view, '_loadingDeferredResolved', false);
    expect(mainItemViewSettled(window)).toBe(false);

    cleanup();
    expect(selectListeners.size).toBe(0);
    expect(refreshListeners.size).toBe(0);
  });

  it('counts only visible members and rejects an identity from the wrong library', () => {
    const itemA = { id: 10, libraryID: 1 } as Zotero.Item;
    const itemB = { id: 11, libraryID: 1 } as Zotero.Item;
    const rows = [
      { isObjectRow: true, ref: itemA },
      { isObjectRow: true, ref: itemB },
    ];
    const view = {
      rowCount: rows.length,
      tree: { _onSelection: vi.fn() },
      selection: { focused: 0 },
      getRow: (index: number) => rows[index],
      getRowIndexByID: (id: number) => {
        const index = rows.findIndex((row) => row.ref.id === id);
        return index < 0 ? false : index;
      },
    };
    const window = { ZoteroPane: { itemsView: view } } as unknown as MainWindow;

    expect(mainItemRowForRef(window, { libraryID: 2, itemID: 10 })).toBeUndefined();
    expect(
      visibleMainSelectionCount(window, [
        { libraryID: 1, itemID: 10 },
        { libraryID: 1, itemID: 10 },
        { libraryID: 1, itemID: 11 },
        { libraryID: 2, itemID: 10 },
        { libraryID: 1, itemID: 99 },
      ]),
    ).toBe(2);
  });
});
