import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { SelectionPanel, selectionPanelEntries } from '../../src/main/selection-panel';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(id: number, libraryID = 1, title = `Item ${id}`): Zotero.Item {
  return {
    id,
    libraryID,
    getField: (field: string) => (field === 'title' ? title : ''),
  } as unknown as Zotero.Item;
}

function harness(items: readonly Zotero.Item[], visibleIDs: readonly number[]) {
  const byID = new Map(items.map((value) => [value.id, value]));
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => byID.get(id) ?? false },
  });

  const rows = visibleIDs.flatMap((id) => {
    const ref = byID.get(id);
    return ref ? [{ isObjectRow: true, ref }] : [];
  });
  let focused = 0;
  const select = vi.fn((index: number) => {
    focused = index;
  });
  const clearSelection = vi.fn();
  const toggleSelect = vi.fn();
  const moveFocused = vi.fn((index: number) => {
    focused = index;
  });
  const selectItem = vi.fn();
  const window = {
    document: { activeElement: null },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    ZoteroPane: {
      itemsView: {
        rowCount: rows.length,
        selection: {
          get focused() {
            return focused;
          },
          select,
          clearSelection,
          toggleSelect,
        },
        tree: { _onSelection: moveFocused },
        getRow: (index: number) => rows[index],
        getRowIndexByID: (id: number) => {
          const index = rows.findIndex((row) => row.ref.id === id);
          return index < 0 ? false : index;
        },
        ensureRowIsVisible: vi.fn(),
      },
      selectItem,
    },
  } as unknown as MainWindow;

  const selection = new SelectionStore();
  for (const value of items) selection.add({ libraryID: value.libraryID, itemID: value.id });
  const session = {
    window,
    selection,
    selectionPanel: {
      open: true,
      refs: [...selection.values()],
      selected: 0,
      commandBuffer: '',
      commandTimer: undefined,
      overlay: null,
      list: null,
      details: null,
      count: null,
      footer: null,
      previousElement: null,
      themeCleanup: null,
    },
  } as unknown as MainWindowSession;

  const panel = new SelectionPanel({ debug: vi.fn() });
  const key = (value: string): KeyboardEvent =>
    ({
      key: value,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    }) as unknown as KeyboardEvent;

  return {
    window,
    session,
    panel,
    select,
    clearSelection,
    toggleSelect,
    moveFocused,
    selectItem,
    key,
  };
}

describe('Selection Panel', () => {
  it('projects visible, hidden, and unavailable workset members without changing Selection', () => {
    const visible = item(1, 1, 'Visible paper');
    const hidden = item(2, 1, 'Hidden paper');
    const h = harness([visible, hidden], [1]);
    h.session.selection.add({ libraryID: 1, itemID: 99 });

    expect(selectionPanelEntries(h.window, h.session.selection.values())).toEqual([
      {
        ref: { libraryID: 1, itemID: 1 },
        title: 'Visible paper',
        state: 'visible',
      },
      {
        ref: { libraryID: 1, itemID: 2 },
        title: 'Hidden paper',
        state: 'hidden',
      },
      {
        ref: { libraryID: 1, itemID: 99 },
        title: 'Item 99',
        state: 'unavailable',
      },
    ]);
    expect(h.session.selection.size).toBe(3);
  });

  it('removes one workset member and clears the workset without deleting Zotero items', () => {
    const first = item(1);
    const second = item(2);
    const h = harness([first, second], [1, 2]);

    h.panel.handleKey(h.key('x'), h.window, h.session);
    expect(h.session.selection.values()).toEqual([{ libraryID: 1, itemID: 2 }]);
    expect(h.select).toHaveBeenCalledWith(1, false);

    h.panel.handleKey(h.key('c'), h.window, h.session);
    expect(h.session.selection.empty).toBe(true);
    expect(h.clearSelection).toHaveBeenCalled();
  });

  it('reveals the current member explicitly and closes the panel', () => {
    const selected = item(7);
    const h = harness([selected], []);

    h.panel.handleKey(h.key('Enter'), h.window, h.session);

    expect(h.selectItem).toHaveBeenCalledWith(7);
    expect(h.session.selectionPanel.open).toBe(false);
    expect(h.session.selection.values()).toEqual([{ libraryID: 1, itemID: 7 }]);
  });
});
