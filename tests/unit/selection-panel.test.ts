import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { SelectionPanel, selectionPanelEntries } from '../../src/main/selection-panel';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import type {
  NavigationExecution,
  NavigationIntent,
  NavigationOperation,
  NavigationOutcome,
} from '../../src/navigation/types';
import type { ShowInLibraryHost } from '../../src/operations/show-in-library';

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
  const navigation = {
    librarySelection: vi.fn((itemID: number, host: ShowInLibraryHost | undefined) => ({
      dispatch: 'serial-navigation' as const,
      start: () => ({
        kind: 'deferred' as const,
        settled: Promise.resolve(host?.selectItem?.(itemID)).then(
          (selected): NavigationOutcome =>
            selected === false
              ? { kind: 'failed', error: new Error('Library item selection failed') }
              : { kind: 'completed', evidence: 'settled-change' },
        ),
      }),
    })),
    execute: vi.fn(
      (
        _window: MainWindow,
        _session: MainWindowSession,
        intent: NavigationIntent,
        operation: NavigationOperation,
      ): NavigationExecution => {
        const completion = operation.start({
          token: { id: 1, epoch: 1, cause: intent.cause, surface: intent.surface },
          policy: { kind: 'ignore' },
          isCurrent: () => intent.context?.isCurrent?.() ?? true,
          cancel: () => {},
        });
        const settled =
          completion.kind === 'immediate'
            ? Promise.resolve(completion.outcome)
            : completion.settled;
        return {
          isCurrent: () => intent.context?.isCurrent?.() ?? true,
          cancel: () => {},
          pending: true,
          result: settled.then((outcome) => ({ ...outcome, recorded: false })),
        };
      },
    ),
  };
  const panel = new SelectionPanel({ debug }, navigation, selectionChanged);
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
    navigation,
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

  it('executes reveal through its event cause, closes on success and preserves Selection', async () => {
    const selected = item(7);
    const h = harness([selected], []);
    const selectionBefore = h.session.selection.values();
    let finishSelection!: (selected: boolean) => void;
    h.selectItem.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishSelection = resolve)),
    );

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() => expect(h.selectItem).toHaveBeenCalledWith(selected.id));
    expect(h.session.selectionPanel.open).toBe(true);
    finishSelection(true);
    await vi.waitFor(() => expect(h.session.selectionPanel.open).toBe(false));

    expect(h.session.selection.values()).toEqual(selectionBefore);
    expect(h.navigation.execute).toHaveBeenCalledOnce();
    expect(h.navigation.execute.mock.calls[0]?.[2]).toMatchObject({
      cause: { kind: 'event', event: 'main-selection-panel.reveal' },
      surface: 'main',
      context: { mainPanel: 'items' },
    });
  });

  it('keeps the panel open and reports a failed reveal', async () => {
    const selected = item(8);
    const h = harness([selected], []);
    const selectionBefore = h.session.selection.values();
    const footer = { textContent: '' } as HTMLElement;
    h.session.selectionPanel.footer = footer;
    h.selectItem.mockResolvedValueOnce(false);

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() => expect(footer.textContent).toContain('Reveal failed'));

    expect(h.selectItem).toHaveBeenCalledWith(selected.id);
    expect(h.session.selectionPanel.open).toBe(true);
    expect(h.session.selection.values()).toEqual(selectionBefore);
  });

  it('does not let an old reveal update a closed and reopened panel', async () => {
    const selected = item(9);
    const h = harness([selected], []);
    let finishSelection!: (selected: boolean) => void;
    h.selectItem.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishSelection = resolve)),
    );
    h.session.selectionPanel.overlay = { remove: vi.fn() } as unknown as HTMLElement;

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() => expect(h.selectItem).toHaveBeenCalledWith(selected.id));
    h.panel.close(h.session, false);
    const footer = { textContent: 'New panel' } as HTMLElement;
    h.session.selectionPanel.open = true;
    h.session.selectionPanel.overlay = { remove: vi.fn() } as unknown as HTMLElement;
    h.session.selectionPanel.refs = [{ libraryID: 1, itemID: selected.id }];
    h.session.selectionPanel.footer = footer;

    finishSelection(false);
    await vi.waitFor(() => expect(h.session.selectionPanel.open).toBe(true));
    expect(footer.textContent).toBe('New panel');
  });
});
