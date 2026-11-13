import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { SelectionPanel, selectionPanelEntries } from '../../src/modules/worksets/selection-panel';
import { SelectionStore } from '../../src/modules/worksets/selection-store';
import { SelectionPanelRuntime } from '../../src/modules/worksets/selection-panel-runtime';
import type { NavigationExecution } from '../../src/navigation/types';
import type { SelectionPanelReactModel } from '../../src/modules/worksets/react-model';

const bridge = vi.hoisted(() => ({
  models: [] as unknown[],
  dispose: vi.fn(),
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: { model: unknown }) => {
    bridge.models.push(options.model);
    return {
      ready: Promise.resolve(),
      update: (model: unknown) => bridge.models.push(model),
      getElement: () => null,
      dispose: bridge.dispose,
    };
  },
}));

function openPanel(h: {
  window: MainWindow;
  session: {
    window: MainWindow;
    selection: SelectionStore;
    selectionPanel: SelectionPanelRuntime;
    theme: { add: () => () => void };
  };
  panel: SelectionPanel;
}): void {
  const createElement = () => ({
    id: '',
    tabIndex: 0,
    style: { cssText: '' },
    append: vi.fn(),
    remove: vi.fn(),
    focus: vi.fn(),
    addEventListener: vi.fn(),
  });
  Object.assign(h.window.document, {
    createElementNS: createElement,
    body: { append: vi.fn() },
  });
  h.session.selectionPanel.open = false;
  h.panel.open(h.window, h.session);
}

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  bridge.models.length = 0;
  bridge.dispose.mockClear();
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
  const selectionPanel = new SelectionPanelRuntime();
  selectionPanel.open = true;
  selectionPanel.refs = [...selection.values()];
  const session = { window, selection, selectionPanel, theme: { add: () => () => {} } };

  const selectionChanged = vi.fn();
  const debug = vi.fn();
  const navigation = vi.fn(
    (itemID: number, isCurrent: () => boolean): NavigationExecution => ({
      isCurrent,
      cancel: () => {},
      pending: true,
      result: Promise.resolve(selectItem(itemID)).then((selected) =>
        selected === false
          ? {
              kind: 'failed' as const,
              error: new Error('Library item selection failed'),
              recorded: false,
            }
          : { kind: 'completed' as const, evidence: 'settled-change' as const, recorded: false },
      ),
    }),
  );
  const panel = new SelectionPanel({ debug }, navigation, selectionChanged, () => true);
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

  it('executes reveal through the navigation port, closes on success and preserves Selection', async () => {
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
    expect(h.navigation).toHaveBeenCalledOnce();
  });

  it('keeps the panel open and reports a failed reveal', async () => {
    const selected = item(8);
    const h = harness([selected], []);
    const selectionBefore = h.session.selection.values();
    openPanel(h);
    h.selectItem.mockResolvedValueOnce(false);

    h.panel.handleKey(h.key('Enter'), h.window, h.session);
    await vi.waitFor(() =>
      expect((bridge.models.at(-1) as SelectionPanelReactModel).footer).toContain('Reveal failed'),
    );

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
    openPanel(h);
    const footer = (bridge.models.at(-1) as SelectionPanelReactModel).footer;

    const execution = h.navigation.mock.results[0]?.value;
    if (!execution || !execution.pending) throw new Error('Expected a pending reveal');
    finishSelection(false);
    await execution.result;
    expect(h.session.selectionPanel.open).toBe(true);
    expect((bridge.models.at(-1) as SelectionPanelReactModel).footer).toBe(footer);
  });
});

describe('Selection Panel React bridge', () => {
  it('projects plain data, updates selection and retires the mounted view on close', () => {
    const h = harness([item(1, 1, 'First'), item(2, 1, 'Second')], [1]);
    openPanel(h);
    expect((bridge.models.at(-1) as SelectionPanelReactModel).entries).toEqual([
      { title: 'First', state: 'visible', libraryID: 1, itemID: 1 },
      { title: 'Second', state: 'hidden', libraryID: 1, itemID: 2 },
    ]);
    h.panel.handleKey(h.key('j'), h.window, h.session);
    expect((bridge.models.at(-1) as SelectionPanelReactModel).selected).toBe(1);
    h.panel.handleKey(h.key('x'), h.window, h.session);
    expect((bridge.models.at(-1) as SelectionPanelReactModel).entries).toHaveLength(1);
    h.panel.close(h.session, false);
    expect(bridge.dispose).toHaveBeenCalledOnce();
  });
});
