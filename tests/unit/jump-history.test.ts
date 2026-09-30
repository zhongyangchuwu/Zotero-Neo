import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { activeContextNoteItem } from '../../src/main/host';
import { MainJumpHistory, MainJumpHistoryState } from '../../src/main/jump-history';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import { MainNavigation } from '../../src/main/navigation';
import type { MainViewActions } from '../../src/main/view-actions';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(id: number): Zotero.Item {
  return { id, libraryID: 1 } as Zotero.Item;
}

function harness(isSessionCurrent: () => boolean = () => true) {
  const firstItem = item(10);
  const secondItem = item(20);
  const items = new Map([
    [firstItem.id, firstItem],
    [secondItem.id, secondItem],
  ]);
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => items.get(id) ?? false },
    Reader: {
      getByTabID: (tabID: string) => (tabID.startsWith('reader-') ? { itemID: 10 } : null),
    },
  });

  const scopeRows = [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }];
  const selectedScopes = new Set([0, 1]);
  let scopeFocused = 1;
  let resolveScopeSelection: (() => void) | undefined;
  let deferScopeSelection = false;
  const selectScope = vi.fn((index: number) => {
    selectedScopes.clear();
    selectedScopes.add(index);
    scopeFocused = index;
  });
  const toggleScope = vi.fn((index: number) => {
    if (selectedScopes.has(index)) selectedScopes.delete(index);
    else selectedScopes.add(index);
  });
  const selectScopeByID = vi.fn((id: string) => {
    const index = scopeRows.findIndex((row) => row.id === id);
    if (index < 0) return;
    if (deferScopeSelection) {
      return new Promise<void>((resolve) => {
        resolveScopeSelection = () => {
          selectScope(index);
          resolve();
        };
      });
    }
    selectScope(index);
  });

  const itemRows = [firstItem, secondItem].map((ref) => ({ isObjectRow: true, ref }));
  let itemFocused = 0;
  const selectItemCursor = vi.fn((index: number) => {
    itemFocused = index;
  });
  const moveItemCursor = vi.fn((index: number) => {
    itemFocused = index;
  });
  const quickSearch = { value: 'alpha', searchTextbox: { value: 'alpha', select: vi.fn() } };
  const tabs = {
    selectedID: 'zotero-pane',
    _tabs: [
      { id: 'zotero-pane' },
      { id: 'reader-A' },
      { id: 'reader-B' },
      { id: 'reader-C' },
      { id: 'reader-D' },
      { id: 'note-A' },
    ],
    getTabInfo(id?: string) {
      if (id === 'zotero-pane') return { type: 'library' };
      if (id?.startsWith('note-')) return { type: 'note' };
      if (id?.startsWith('reader-')) return { type: 'reader' };
      return undefined;
    },
    select(id: string) {
      if (this._tabs.some((tab) => tab.id === id)) this.selectedID = id;
    },
  };
  const document = {
    activeElement: null,
    getElementById: (id: string) => (id === 'zotero-tb-search' ? quickSearch : null),
    querySelector: () => null,
  };
  const noteEditorFocus = {} as unknown as Element;
  const window = {
    document,
    Zotero_Tabs: tabs,
    ZoteroPane: {
      collectionsView: {
        selection: {
          get focused() {
            return scopeFocused;
          },
          get count() {
            return selectedScopes.size;
          },
          selected: selectedScopes,
          select: selectScope,
          toggleSelect: toggleScope,
          clearSelection: () => selectedScopes.clear(),
        },
        getRow: (index: number) => scopeRows[index],
        getRowIndexByID: (id: string) => {
          const index = scopeRows.findIndex((row) => row.id === id);
          return index < 0 ? false : index;
        },
        selectByID: selectScopeByID,
      },
      itemsView: {
        rowCount: itemRows.length,
        selection: {
          get focused() {
            return itemFocused;
          },
          select: selectItemCursor,
        },
        tree: { _onSelection: moveItemCursor },
        getRow: (index: number) => itemRows[index],
        getRowIndexByID: (id: number) => {
          const index = itemRows.findIndex((row) => row.ref.id === id);
          return index < 0 ? false : index;
        },
        ensureRowIsVisible: vi.fn(),
      },
      getSelectedItems: () => [],
    },
  } as unknown as MainWindow;

  let quickText = 'alpha';
  let tags = ['one', 'two'];
  let advancedSearch = false;
  let canApplyQuickSearch = true;
  const viewActions = {
    state: vi.fn(() => ({
      quickSearchText: quickText,
      tags: [...tags],
      advancedSearch,
    })),
    applyQuickSearch: vi.fn(async (_window: MainWindow, text: string) => {
      if (!canApplyQuickSearch) return false;
      quickText = text;
      quickSearch.value = text;
      quickSearch.searchTextbox.value = text;
      return true;
    }),
    applyTagFilter: vi.fn(async (_window: MainWindow, next: readonly string[]) => {
      tags = [...next];
      return 1;
    }),
    closeAdvancedSearch: vi.fn(async () => {
      advancedSearch = false;
      return true;
    }),
  } as unknown as MainViewActions;

  let panel: 'collections' | 'items' = 'items';
  const status = vi.fn();
  const navigation = {
    panel: vi.fn(() => panel),
    focusPanel: vi.fn((_window: MainWindow, _session: MainWindowSession, next: typeof panel) => {
      panel = next;
      return true;
    }),
    afterTabSwitch: vi.fn(),
    status,
  } as unknown as MainNavigation;
  const selection = new SelectionStore();
  selection.add({ libraryID: 1, itemID: 99 });
  const session = {
    window,
    selection,
    activePanel: 'items',
    jumpHistory: new MainJumpHistoryState(),
  } as unknown as MainWindowSession;
  const history = new MainJumpHistory({ debug: vi.fn() } as never, navigation, viewActions, () =>
    isSessionCurrent(),
  );

  return {
    window,
    session,
    history,
    viewActions,
    tabs,
    selectedScopes,
    selection,
    secondItem,
    status,
    selectScopeByID,
    toggleScope,
    applyQuickSearch: viewActions.applyQuickSearch,
    quickText: () => quickText,
    tags: () => tags,
    advancedSearch: () => advancedSearch,
    panel: () => panel,
    cursor: () => itemFocused,
    setTab: (id: string) => {
      tabs.selectedID = id;
    },
    setScopes: (ids: readonly string[]) => {
      selectedScopes.clear();
      for (const id of ids) {
        const index = scopeRows.findIndex((row) => row.id === id);
        if (index >= 0) selectedScopes.add(index);
      }
    },
    setQuickText: (text: string) => {
      quickText = text;
      quickSearch.value = text;
      quickSearch.searchTextbox.value = text;
    },
    focusQuickSearch: () => {
      Reflect.set(document, 'activeElement', quickSearch);
    },
    setCursor: (index: number) => {
      itemFocused = index;
    },
    setTags: (next: readonly string[]) => {
      tags = [...next];
    },
    setAdvancedSearch: (value: boolean) => {
      advancedSearch = value;
    },
    setQuickSearchAvailable: (value: boolean) => {
      canApplyQuickSearch = value;
    },
    setPanel: (next: typeof panel) => {
      panel = next;
    },
    focusContextNote: () => {
      Reflect.set(document, 'activeElement', noteEditorFocus);
      Reflect.set(window, 'ZoteroContextPane', {
        activeEditor: {
          item: secondItem,
          contains: (node: Node | null) => node === noteEditorFocus,
        },
      });
    },
    deferScopeSelection: () => {
      deferScopeSelection = true;
    },
    allowScopeSelection: () => {
      deferScopeSelection = false;
    },
    resolveScopeSelection: () => resolveScopeSelection?.(),
  };
}

describe('Main jump history', () => {
  it('truncates Forward after returning to B and explicitly jumping to D', async () => {
    const h = harness();

    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-B')).result;
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-C')).result;
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');

    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-D')).result;
    expect(h.tabs.selectedID).toBe('reader-D');
    await expect(h.history.forward(h.window, h.session)).resolves.toBe(false);
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');
    await expect(h.history.forward(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-D');
  });

  it('enforces Back and Forward bounds and ignores successful no-op opens', async () => {
    const h = harness();
    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
    await expect(h.history.forward(h.window, h.session)).resolves.toBe(false);

    await h.history.requestNavigation(h.window, h.session, () => true).result;
    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);

    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
    await expect(h.history.forward(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
    await expect(h.history.forward(h.window, h.session)).resolves.toBe(false);
  });

  it('processes rapid Back and Forward presses sequentially', async () => {
    const h = harness();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-B')).result;
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-C')).result;

    const firstBack = h.history.back(h.window, h.session);
    const secondBack = h.history.back(h.window, h.session);
    await expect(firstBack).resolves.toBe(true);
    await expect(secondBack).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');

    const firstForward = h.history.forward(h.window, h.session);
    const secondForward = h.history.forward(h.window, h.session);
    await expect(firstForward).resolves.toBe(true);
    await expect(secondForward).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-C');
  });

  it('runs Back after a pending explicit jump commits its destination', async () => {
    const h = harness();
    let finishJump!: () => void;
    const jump = h.history.requestNavigation(
      h.window,
      h.session,
      () =>
        new Promise<void>((resolve) => {
          finishJump = () => {
            h.setTab('reader-A');
            resolve();
          };
        }),
    );
    await vi.waitFor(() => expect(finishJump).toBeTypeOf('function'));
    const back = h.history.back(h.window, h.session);
    finishJump();

    await expect(jump.result).resolves.toBe(true);
    await expect(back).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    expect(h.session.jumpHistory.index).toBe(0);
  });

  it('keeps independent stacks for two windows using one controller history service', async () => {
    const first = harness();
    const second = harness();
    await first.history.requestNavigation(first.window, first.session, () =>
      first.setTab('reader-A'),
    ).result;
    await first.history.requestNavigation(second.window, second.session, () =>
      second.setTab('reader-B'),
    ).result;

    await expect(first.history.back(first.window, first.session)).resolves.toBe(true);
    expect(first.tabs.selectedID).toBe('zotero-pane');
    expect(second.tabs.selectedID).toBe('reader-B');
    await expect(first.history.back(second.window, second.session)).resolves.toBe(true);
    expect(second.tabs.selectedID).toBe('zotero-pane');
    expect(first.session.jumpHistory.locations).toHaveLength(2);
    expect(second.session.jumpHistory.locations).toHaveLength(2);
  });

  it('restores Main scope, filters, Cursor and focus across a Reader tab without changing Selection', async () => {
    const h = harness();
    h.setPanel('collections');
    const selectionBefore = h.selection.values();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;

    h.setScopes(['C3']);
    h.setQuickText('changed');
    h.setTags(['new']);
    h.setAdvancedSearch(true);
    h.setPanel('items');
    h.setCursor(1);

    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    expect([...h.selectedScopes]).toEqual([0, 1]);
    expect(h.quickText()).toBe('alpha');
    expect(h.tags()).toEqual(['one', 'two']);
    expect(h.cursor()).toBe(0);
    expect(h.panel()).toBe('collections');
    expect(h.selection.values()).toEqual(selectionBefore);
  });

  it('focuses the rendered Main items tree after Back from Reader', async () => {
    const h = harness();
    const doc = h.window.document;
    const getElementById = doc.getElementById.bind(doc);
    const itemTree = {
      id: 'item-tree-main-default',
      isConnected: true,
      focus: () => Reflect.set(doc, 'activeElement', itemTree),
    } as unknown as HTMLElement;
    Reflect.set(doc, 'getElementById', (id: string) =>
      id === itemTree.id ? itemTree : getElementById(id),
    );
    Reflect.set(doc, 'activeElement', itemTree);
    Reflect.set(
      h.window,
      'setTimeout',
      vi.fn(() => 0),
    );
    Object.assign(h.session, {
      status: { style: {}, textContent: '' },
      cleanup: { add: vi.fn() },
    });
    const items = h.window.ZoteroPane?.itemsView as object;
    Reflect.set(items, 'tree', { _topDiv: itemTree, focus: () => {} });
    Reflect.set(items, 'focus', () => {});
    const logger = { debug: vi.fn() } as never;
    const navigation = new MainNavigation(logger, () => {});
    const history = new MainJumpHistory(logger, navigation, h.viewActions);

    await history.requestNavigation(h.window, h.session, () => {
      h.setTab('reader-A');
      Reflect.set(doc, 'activeElement', { id: 'reader-browser', localName: 'browser' });
    }).result;
    await expect(history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    expect(doc.activeElement).toBe(itemTree);
  });

  it('captures and restores the Main library behind a focused context-pane Note', async () => {
    const h = harness();
    h.setPanel('collections');
    h.focusContextNote();
    expect(activeContextNoteItem(h.window)).toBeDefined();
    const selectionBefore = h.selection.values();
    expect(h.history.capture(h.window, h.session)).toMatchObject({
      kind: 'library',
      tabID: 'zotero-pane',
      scopeIDs: ['C1', 'C2'],
      quickSearchText: 'alpha',
      tags: ['one', 'two'],
      cursor: { libraryID: 1, itemID: 10 },
      panel: 'collections',
    });

    const reveal = h.history.requestLibrarySelection(h.window, h.session, h.secondItem.id, {
      selectItem: (itemID) => {
        expect(itemID).toBe(h.secondItem.id);
        h.setCursor(1);
        return true;
      },
    });
    await expect(reveal.result).resolves.toBe(true);
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);

    expect(h.cursor()).toBe(0);
    expect(h.panel()).toBe('collections');
    expect(h.selection.values()).toEqual(selectionBefore);
  });

  it.each(['picker', 'selectionPanel'] as const)(
    'restores the Items pane after a %s reveal despite its overlay focus',
    async (overlay) => {
      const h = harness();
      h.setPanel('collections');
      h.session.activePanel = 'items';
      Object.assign(h.session, { [overlay]: { open: true } });
      const selectionBefore = h.selection.values();

      await h.history.requestLibrarySelection(h.window, h.session, h.secondItem.id, {
        selectItem: () => {
          h.setCursor(1);
          return true;
        },
      }).result;

      expect(h.session.jumpHistory.locations[0]).toMatchObject({ panel: 'items' });
      await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
      expect(h.panel()).toBe('items');
      expect(h.cursor()).toBe(0);
      expect(h.selection.values()).toEqual(selectionBefore);
    },
  );

  it('leaves the history position unchanged for missing tabs and partial restores', async () => {
    const h = harness();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    const index = h.session.jumpHistory.index;
    h.tabs._tabs = h.tabs._tabs.filter((tab) => tab.id !== 'zotero-pane');

    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '→ Back partial · missing tab', 3200);

    h.tabs._tabs.push({ id: 'zotero-pane' });
    h.setQuickSearchAvailable(false);
    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.status).toHaveBeenLastCalledWith(
      h.session,
      '→ Back partial · missing Quick Search',
      3200,
    );
  });

  it('reports partial when the recorded Advanced Search condition is no longer active', async () => {
    const h = harness();
    h.setAdvancedSearch(true);
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    h.setAdvancedSearch(false);
    const index = h.session.jumpHistory.index;

    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.status).toHaveBeenLastCalledWith(
      h.session,
      '→ Back partial · missing Advanced Search',
      3200,
    );
  });

  it('restores when Advanced Search remains active at the recorded location', async () => {
    const h = harness();
    h.setAdvancedSearch(true);
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;

    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.advancedSearch()).toBe(true);
    expect(h.session.jumpHistory.index).toBe(0);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '✓ Back');
  });

  it('lets a queued jump record the post-restore state after Back is superseded', async () => {
    const h = harness();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const staleBack = h.history.back(h.window, h.session);
    await vi.waitFor(() => expect(h.selectScopeByID).toHaveBeenCalledOnce());
    const newerJump = h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-D'));
    h.resolveScopeSelection();

    await expect(staleBack).resolves.toBe(false);
    await expect(newerJump.result).resolves.toBe(true);
    h.allowScopeSelection();
    expect(h.session.jumpHistory.index).toBe(3);
    expect(h.session.jumpHistory.locations).toHaveLength(4);
    expect(h.session.jumpHistory.locations[2]).toMatchObject({
      kind: 'library',
      scopeIDs: ['C1'],
      quickSearchText: 'alpha',
    });
    expect(h.tabs.selectedID).toBe('reader-D');
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
  });

  it('does not overwrite a native tab change while a restore is awaiting scope selection', async () => {
    const h = harness();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const index = h.session.jumpHistory.index;
    const back = h.history.back(h.window, h.session);
    await vi.waitFor(() => expect(h.selectScopeByID).toHaveBeenCalledOnce());
    h.setTab('reader-B');
    h.resolveScopeSelection();

    await expect(back).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.tabs.selectedID).toBe('reader-B');
    expect(h.status).not.toHaveBeenCalled();
    expect(h.toggleScope).not.toHaveBeenCalled();
  });

  it('does not replace a newer Quick Search edit while Back awaits scope selection', async () => {
    const h = harness();
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const index = h.session.jumpHistory.index;
    const back = h.history.back(h.window, h.session);
    await vi.waitFor(() => expect(h.selectScopeByID).toHaveBeenCalledOnce());
    h.focusQuickSearch();
    h.setQuickText('new query');
    h.resolveScopeSelection();

    await expect(back).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.quickText()).toBe('new query');
    expect(h.applyQuickSearch).not.toHaveBeenCalled();
  });

  it('records only the newest completed location after overlapping host jumps', async () => {
    const h = harness();
    let finish!: () => void;
    const stale = h.history.requestNavigation(
      h.window,
      h.session,
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            h.setTab('reader-A');
            resolve();
          };
        }),
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const latest = h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-B'));
    finish();

    await expect(stale.result).resolves.toBe(false);
    await expect(latest.result).resolves.toBe(true);
    await expect(h.history.back(h.window, h.session)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
  });

  it('does not record failed or collection-scoped navigation requests', async () => {
    const h = harness();
    await expect(
      h.history.requestNavigation(h.window, h.session, () => false).result,
    ).resolves.toBe(false);
    await h.history
      .requestLibrarySelection(h.window, h.session, 10, { selectItem: () => false })
      .result.catch(() => undefined);
    await h.history.requestNavigation(h.window, h.session, () => h.setTab('reader-A'), false)
      .result;
    await expect(h.history.back(h.window, h.session)).resolves.toBe(false);
  });

  it('clears and invalidates history when a window session is disposed', async () => {
    const h = harness();
    let finish!: () => void;
    const request = h.history.requestNavigation(
      h.window,
      h.session,
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    h.session.jumpHistory.dispose();
    finish();

    await expect(request.result).resolves.toBe(false);
    expect(h.session.jumpHistory.locations).toEqual([]);
    expect(h.session.jumpHistory.index).toBe(-1);
  });
});
