import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { SelectionPanel, selectionPanelEntries } from '../../src/main/selection-panel';
import { SelectionStore } from '../../src/main/selection-store';
import { MainNavigation } from '../../src/main/navigation';
import { MainJumpHistory, MainJumpHistoryState } from '../../src/main/jump-history';
import { MainViewActions } from '../../src/main/view-actions';
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
  const tabs = {
    selectedID: 'reader-test',
    _tabs: [{ id: 'reader-test' }, { id: 'zotero-pane' }],
    select(id: string) {
      if (this._tabs.some((tab) => tab.id === id)) this.selectedID = id;
    },
  };
  const selectItem = vi.fn((_itemID: number): boolean | Promise<boolean> => {
    tabs.selectedID = 'zotero-pane';
    return true;
  });
  const window = {
    document: {
      activeElement: null,
      getElementById: () => null,
      querySelector: () => null,
    },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    Zotero_Tabs: tabs,
    ZoteroPane: {
      collectionsView: {
        selection: { count: 0, focused: 0, selected: new Set<number>() },
      },
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
    activePanel: 'items',
    status: { textContent: '', style: { display: '', color: '', background: '' } },
    cleanup: { add: vi.fn() },
    jumpHistory: new MainJumpHistoryState(),
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

  const selectionChanged = vi.fn();
  const debug = vi.fn();
  const logger = { debug, diagnostic: vi.fn() };
  const navigation = new MainNavigation(logger, () => {});
  const jumpHistory = new MainJumpHistory(
    logger,
    navigation,
    new MainViewActions(logger, navigation),
    { captureJumpLocation: () => null, restoreJumpLocation: async () => null },
  );
  const panel = new SelectionPanel({ debug }, jumpHistory, selectionChanged);
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
    jumpHistory,
    select,
    clearSelection,
    toggleSelect,
    moveFocused,
    selectItem,
    selectionChanged,
    debug,
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

  it('consumes removal/clear keys and mutates only the persistent SelectionStore', () => {
    const first = item(1);
    const second = item(2);
    const h = harness([first, second], [1, 2]);

    const remove = h.key('x');
    h.panel.handleKey(remove, h.window, h.session);
    expect(remove.preventDefault).toHaveBeenCalledOnce();
    expect(remove.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(remove.stopPropagation).toHaveBeenCalledOnce();
    expect(h.session.selection.values()).toEqual([{ libraryID: 1, itemID: 2 }]);
    expect(h.selectionChanged).toHaveBeenCalledOnce();
    expect(h.selectionChanged).toHaveBeenLastCalledWith(h.window, h.session);

    const clear = h.key('c');
    h.panel.handleKey(clear, h.window, h.session);
    expect(clear.preventDefault).toHaveBeenCalledOnce();
    expect(clear.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(clear.stopPropagation).toHaveBeenCalledOnce();
    expect(h.session.selection.empty).toBe(true);
    expect(h.selectionChanged).toHaveBeenCalledTimes(2);
    expect(h.selectionChanged).toHaveBeenLastCalledWith(h.window, h.session);
    expect(h.select).not.toHaveBeenCalled();
    expect(h.clearSelection).not.toHaveBeenCalled();
    expect(h.toggleSelect).not.toHaveBeenCalled();
    expect(h.moveFocused).not.toHaveBeenCalled();
  });

  it('keeps panel-only navigation presentation-neutral', () => {
    const first = item(1);
    const second = item(2);
    const h = harness([first, second], [1, 2]);
    const before = h.session.selection.values();

    for (const value of ['j', 'k', 'G', 'Home']) {
      h.panel.handleKey(h.key(value), h.window, h.session);
    }

    expect(h.session.selection.values()).toEqual(before);
    expect(h.selectionChanged).not.toHaveBeenCalled();
  });

  it('records a successful reveal, closes the panel and preserves Persistent Selection', async () => {
    const selected = item(7);
    const h = harness([selected], []);
    const selectionBefore = h.session.selection.values();
    const previousFocus = vi.fn();
    h.session.selectionPanel.previousElement = {
      isConnected: true,
      focus: previousFocus,
    } as unknown as HTMLElement;
    let finishSelection!: (selected: boolean) => void;
    h.selectItem.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishSelection = resolve)),
    );

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() => expect(h.selectItem).toHaveBeenCalledWith(selected.id));
    expect(h.session.selectionPanel.open).toBe(true);
    finishSelection(true);
    Reflect.set(Reflect.get(h.window, 'Zotero_Tabs')!, 'selectedID', 'zotero-pane');

    await vi.waitFor(() => expect(h.session.selectionPanel.open).toBe(false));
    expect(h.session.selection.values()).toEqual(selectionBefore);
    await expect(h.jumpHistory.back(h.window, h.session)).resolves.toBe(true);
    expect(Reflect.get(Reflect.get(h.window, 'Zotero_Tabs')!, 'selectedID')).toBe('reader-test');
    expect(previousFocus).not.toHaveBeenCalled();
  });

  it('does not record a failed reveal or close the panel', async () => {
    const selected = item(8);
    const h = harness([selected], []);
    const selectionBefore = h.session.selection.values();
    const footer = { textContent: '' } as HTMLElement;
    h.session.selectionPanel.footer = footer;
    h.selectItem.mockResolvedValueOnce(false);

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() =>
      expect(h.debug).toHaveBeenCalledWith(
        expect.stringContaining('Library item selection failed'),
      ),
    );

    expect(h.selectItem).toHaveBeenCalledWith(selected.id);
    expect(h.session.selectionPanel.open).toBe(true);
    expect(h.session.selection.values()).toEqual(selectionBefore);
    expect(footer.textContent).toContain('Reveal failed');
    await expect(h.jumpHistory.back(h.window, h.session)).resolves.toBe(false);
  });

  it('keeps overlapping failed reveals from creating a Back entry', async () => {
    const first = item(9);
    const second = item(10);
    const h = harness([first, second], []);
    const pending: {
      readonly itemID: number;
      resolve(value: boolean): void;
      reject(error: Error): void;
    }[] = [];
    h.selectItem.mockImplementation(
      (itemID: number) =>
        new Promise<boolean>((resolve, reject) => pending.push({ itemID, resolve, reject })),
    );
    const older = h.jumpHistory.requestLibrarySelection(
      h.window,
      h.session,
      first.id,
      h.window.ZoteroPane,
    );
    void older.result.catch(() => undefined);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    h.session.selectionPanel.selected = 1;
    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    expect(h.session.selectionPanel.open).toBe(true);
    expect(pending.map(({ itemID }) => itemID)).toEqual([first.id]);

    pending[0]!.reject(new Error('first reveal failed'));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!.reject(new Error('panel reveal failed'));
    await vi.waitFor(() =>
      expect(h.debug).toHaveBeenCalledWith(expect.stringContaining('Selection reveal failed')),
    );
    await older.result.catch(() => undefined);

    expect(pending.map(({ itemID }) => itemID)).toEqual([first.id, second.id]);
    await expect(h.jumpHistory.back(h.window, h.session)).resolves.toBe(false);
  });

  it('applies the newest reveal after earlier host work settles without recording a no-op', async () => {
    const first = item(11);
    const second = item(12);
    const h = harness([first, second], []);
    const pending: {
      readonly itemID: number;
      resolve(value: boolean): void;
      reject(error: Error): void;
    }[] = [];
    let selectedItemID: number | null = null;
    h.selectItem.mockImplementation(
      (itemID: number) =>
        new Promise<boolean>((resolve, reject) =>
          pending.push({
            itemID,
            resolve: (selected) => {
              if (selected) selectedItemID = itemID;
              resolve(selected);
            },
            reject,
          }),
        ),
    );
    const older = h.jumpHistory.requestLibrarySelection(
      h.window,
      h.session,
      first.id,
      h.window.ZoteroPane,
    );
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    h.session.selectionPanel.selected = 1;
    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    expect(pending.map(({ itemID }) => itemID)).toEqual([first.id]);
    pending[0]!.resolve(true);
    Reflect.set(Reflect.get(h.window, 'Zotero_Tabs')!, 'selectedID', 'zotero-pane');
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!.resolve(true);
    await vi.waitFor(() => expect(selectedItemID).toBe(second.id));
    await expect(older.result).resolves.toBe(false);

    expect(pending.map(({ itemID }) => itemID)).toEqual([first.id, second.id]);
    await expect(h.jumpHistory.back(h.window, h.session)).resolves.toBe(false);
  });
});
