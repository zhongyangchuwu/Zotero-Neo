import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow, ReaderJumpLocation } from '../../src/core/contracts';
import { activeContextNoteItem } from '../../src/main/host';
import { MainNavigationExecutor, type LibrarySelectionOptions } from '../../src/main/jump-history';
import { MainNavigation } from '../../src/main/navigation';
import type { ShowInLibraryHost } from '../../src/operations/show-in-library';
import { NavigationHistoryState } from '../../src/navigation/history';
import type {
  NavigationCompletion,
  NavigationExecution,
  NavigationIntent,
  NavigationOutcome,
} from '../../src/navigation/types';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import type { MainViewActions } from '../../src/main/view-actions';

interface HistoryHarness {
  readonly window: MainWindow;
  readonly session: MainWindowSession;
  readonly history: MainNavigationExecutor;
  readonly tabs: { selectedID: string };
}

type TestNavigate = (isCurrent: () => boolean) => boolean | void | Promise<boolean | void>;

function completionFor(navigate: TestNavigate, isCurrent: () => boolean): NavigationCompletion {
  const result = navigate(isCurrent);
  if (result instanceof Promise) {
    return {
      kind: 'deferred',
      settled: result.then(
        (value): NavigationOutcome =>
          value === false
            ? { kind: 'unavailable' }
            : { kind: 'completed', evidence: 'settled-change' },
      ),
    };
  }
  return {
    kind: 'immediate',
    outcome:
      result === false
        ? { kind: 'unavailable' }
        : { kind: 'completed', evidence: 'settled-change' },
  };
}

function navigate(
  h: HistoryHarness,
  callback: TestNavigate,
  dispatch: 'inline' | 'serial-navigation',
  window = h.window,
  session = h.session,
): NavigationExecution {
  const intent: NavigationIntent = {
    cause: { kind: 'action', action: 'previousTab' },
    surface: 'main',
  };
  return h.history.execute(window, session, intent, {
    dispatch,
    start: (attempt) => completionFor(callback, attempt.isCurrent),
  });
}

function jumpNow(h: HistoryHarness, callback: () => boolean | void): NavigationExecution {
  return navigate(h, () => callback(), 'inline');
}

function queuedJump(
  h: HistoryHarness,
  callback: TestNavigate,
  window = h.window,
  session = h.session,
) {
  const execution = navigate(h, callback, 'serial-navigation', window, session);
  const result = execution.pending
    ? execution.result.then((outcome) => outcome.kind === 'completed')
    : Promise.resolve(execution.result.kind === 'completed');
  return { result, isCurrent: execution.isCurrent };
}

function traversal(
  h: HistoryHarness,
  direction: -1 | 1,
  count = 1,
  window = h.window,
  session = h.session,
): Promise<boolean> {
  const intent: NavigationIntent = {
    cause: { kind: 'action', action: direction < 0 ? 'navigateBack' : 'navigateForward' },
    surface: 'main',
  };
  const execution = h.history.execute(
    window,
    session,
    intent,
    h.history.traversal(window, session, direction, count),
  );
  return execution.pending
    ? execution.result.then((outcome) => outcome.kind === 'completed')
    : Promise.resolve(execution.result.kind === 'completed');
}

function selectLibrary(
  h: HistoryHarness,
  itemID: number,
  host: ShowInLibraryHost | undefined,
  options?: LibrarySelectionOptions,
) {
  const intent: NavigationIntent = {
    cause: { kind: 'event', event: 'main-selection-panel.reveal' },
    surface: 'main',
    context: { mainPanel: 'items' },
  };
  const execution = h.history.execute(
    h.window,
    h.session,
    intent,
    h.history.librarySelection(itemID, host, options),
  );
  const result = execution.pending
    ? execution.result.then((outcome) => outcome.kind === 'completed')
    : Promise.resolve(execution.result.kind === 'completed');
  return { result, isCurrent: execution.isCurrent };
}

function recordManagedJump(
  h: HistoryHarness,
  source: ReaderJumpLocation,
  destination: ReaderJumpLocation,
): NavigationExecution {
  return h.history.execute(
    h.window,
    h.session,
    {
      cause: { kind: 'event', event: 'reader-mark.jump' },
      surface: 'reader',
      context: {
        readerPath: 'mark',
        isCurrent: () => h.tabs.selectedID === destination.tabID,
      },
    },
    {
      dispatch: 'inline',
      capture: () => source,
      start: () => ({
        kind: 'immediate',
        outcome: { kind: 'completed', evidence: 'managed-final', destination },
      }),
    },
  );
}

function observeNative(
  h: HistoryHarness,
  source: ReaderJumpLocation,
  destination: ReaderJumpLocation,
): void {
  h.history.port(h.window, h.session).observeNative({
    source,
    destination,
    isCurrent: () => h.tabs.selectedID === destination.tabID,
  });
}

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
      const { promise, resolve } = Promise.withResolvers<void>();
      resolveScopeSelection = () => {
        selectScope(index);
        resolve();
      };
      return promise;
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
    jumpHistory: new NavigationHistoryState(),
    navigationCoordinator: null,
  } as unknown as MainWindowSession;
  const readerHost = {
    captureJumpLocation: vi.fn<(tabID: string, itemID?: number) => ReaderJumpLocation | null>(
      () => null,
    ),
    restoreJumpLocation: vi.fn<
      (
        window: MainWindow,
        location: ReaderJumpLocation,
        isCurrent: () => boolean,
      ) => Promise<string | null>
    >(async () => null),
  };
  const history = new MainNavigationExecutor(
    { debug: vi.fn() } as never,
    navigation,
    viewActions,
    readerHost,
    () => isSessionCurrent(),
  );

  return {
    window,
    session,
    history,
    readerHost,
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
        context: {
          activeEditor: {
            item: secondItem,
            contains: (node: Node | null) => node === noteEditorFocus,
          },
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
  it('records genuine Reader jumps after tab navigation supersedes a pending restore', async () => {
    const h = harness();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const staleBack = traversal(h, -1);
    await vi.waitFor(() => expect(h.selectScopeByID).toHaveBeenCalledOnce());
    jumpNow(h, () => h.setTab('reader-B'));
    const source: ReaderJumpLocation = {
      kind: 'reader',
      tabID: 'reader-B',
      libraryID: 1,
      itemID: 20,
      position: { primary: true, pageIndex: 0, top: 0, left: 0 },
    };
    const destination: ReaderJumpLocation = {
      ...source,
      position: { primary: true, pageIndex: 6, top: 50, left: 0 },
    };
    recordManagedJump(h, source, destination);
    h.resolveScopeSelection();
    await expect(staleBack).resolves.toBe(false);
    let page = 6;
    h.readerHost.captureJumpLocation.mockImplementation(() => ({
      ...source,
      position: { primary: true, pageIndex: page, top: page === 6 ? 50 : 0, left: 0 },
    }));
    h.readerHost.restoreJumpLocation.mockImplementation(async (_window, location) => {
      h.setTab(location.tabID);
      page = location.position!.pageIndex;
      return location.tabID;
    });
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');
    expect(page).toBe(0);
    await expect(traversal(h, 1)).resolves.toBe(true);
    expect(page).toBe(6);
  });

  it('visits a lazily loaded Reader only once after its departure position becomes available', async () => {
    const h = harness();
    let initialized = false;
    h.readerHost.captureJumpLocation.mockImplementation((tabID) => {
      if (tabID !== 'reader-A') return null;
      return {
        kind: 'reader',
        tabID,
        libraryID: 1,
        itemID: 10,
        position: initialized ? { primary: true, pageIndex: 3, top: 75, left: 0 } : undefined,
      };
    });
    let restoredPage: number | undefined;
    h.readerHost.restoreJumpLocation.mockImplementation(async (_window, location) => {
      h.setTab(location.tabID);
      restoredPage = location.position?.pageIndex;
      return location.tabID;
    });
    jumpNow(h, () => h.setTab('reader-A'));
    initialized = true;
    jumpNow(h, () => h.setTab('reader-B'));
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
    expect(restoredPage).toBe(3);
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    await expect(traversal(h, -1)).resolves.toBe(false);
  });

  it('records every synchronous tab jump and traverses counted locations without self-recording', async () => {
    const h = harness();
    for (const tab of ['reader-A', 'reader-B', 'reader-C']) jumpNow(h, () => h.setTab(tab));

    await expect(traversal(h, -1, 2)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
    await expect(traversal(h, 1, 2)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-C');
    await expect(traversal(h, -1, 100)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    await expect(traversal(h, -1)).resolves.toBe(false);
  });

  it('returns to the actual Cursor and filters after unrecorded motion at a visited location', async () => {
    const h = harness();
    const selection = h.selection.values();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    await traversal(h, -1);
    h.setCursor(1);
    h.setQuickText('revised');
    h.setTags(['three']);
    await traversal(h, 1);
    h.setCursor(0);
    h.setQuickText('other');
    h.setTags([]);
    await traversal(h, -1);

    expect(h.cursor()).toBe(1);
    expect(h.quickText()).toBe('revised');
    expect(h.tags()).toEqual(['three']);
    expect(h.selection.values()).toEqual(selection);
    await expect(traversal(h, -1)).resolves.toBe(false);
  });

  it('keeps only the most recent 100 locations without breaking traversal at either end', async () => {
    const h = harness();
    for (let index = 1; index <= 105; index += 1) {
      const id = `reader-${index}`;
      h.tabs._tabs.push({ id });
      jumpNow(h, () => h.setTab(id));
    }
    await expect(traversal(h, -1, 999)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-6');
    await expect(traversal(h, -1)).resolves.toBe(false);
    await expect(traversal(h, 1, 999)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-105');
    await expect(traversal(h, 1)).resolves.toBe(false);
  });

  it('retains Reader positions after a closed tab receives a new tab ID', async () => {
    const h = harness();
    let page = 0;
    h.readerHost.captureJumpLocation.mockImplementation((tabID) => {
      if (tabID === 'zotero-pane') return null;
      return {
        kind: 'reader',
        tabID,
        libraryID: 1,
        itemID: tabID === 'reader-B' ? 20 : 10,
        position: { primary: true, pageIndex: page, top: 42, left: 0 },
      };
    });
    let reopenCount = 0;
    h.readerHost.restoreJumpLocation.mockImplementation(async (_window, location) => {
      let tabID = location.tabID;
      if (!h.tabs._tabs.some((tab) => tab.id === tabID)) {
        tabID = 'reader-reopened';
        h.tabs._tabs.push({ id: tabID });
        reopenCount += 1;
      }
      h.setTab(tabID);
      page = location.position!.pageIndex;
      return tabID;
    });
    jumpNow(h, () => {
      h.setTab('reader-A');
      page = 2;
    });
    const source = h.history.capture(h.window, h.session) as ReaderJumpLocation;
    page = 6;
    const destination = h.history.capture(h.window, h.session) as ReaderJumpLocation;
    recordManagedJump(h, source, destination);
    jumpNow(h, () => {
      h.setTab('reader-B');
      page = 1;
    });
    h.tabs._tabs = h.tabs._tabs.filter((tab) => tab.id !== 'reader-A');

    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-reopened');
    expect(page).toBe(6);
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-reopened');
    expect(page).toBe(2);
    await expect(traversal(h, 1, 2)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');
    expect(page).toBe(1);
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(page).toBe(6);
    expect(reopenCount).toBe(1);
  });

  it('ignores inactive Reader saves and never records a traversal as a new Reader jump', async () => {
    const h = harness();
    const source: ReaderJumpLocation = {
      kind: 'reader',
      tabID: 'reader-A',
      libraryID: 1,
      itemID: 10,
      position: { primary: true, pageIndex: 0, left: 0, top: 0 },
    };
    const destination: ReaderJumpLocation = {
      ...source,
      position: { primary: true, pageIndex: 5, left: 0, top: 100 },
    };
    observeNative(h, source, destination);
    await expect(traversal(h, -1)).resolves.toBe(false);
    h.setTab('reader-A');
    observeNative(h, source, destination);
    h.readerHost.restoreJumpLocation.mockImplementation(async () => 'reader-A');
    await expect(traversal(h, -1)).resolves.toBe(true);
    await expect(traversal(h, -1)).resolves.toBe(false);
    await expect(traversal(h, 1)).resolves.toBe(true);
    await expect(traversal(h, 1)).resolves.toBe(false);
  });

  it('truncates Forward after returning to B and explicitly jumping to D', async () => {
    const h = harness();

    await queuedJump(h, () => h.setTab('reader-B')).result;
    await queuedJump(h, () => h.setTab('reader-C')).result;
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');

    await queuedJump(h, () => h.setTab('reader-D')).result;
    expect(h.tabs.selectedID).toBe('reader-D');
    await expect(traversal(h, 1)).resolves.toBe(false);
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');
    await expect(traversal(h, 1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-D');
  });

  it('enforces Back and Forward bounds and ignores successful no-op opens', async () => {
    const h = harness();
    await expect(traversal(h, -1)).resolves.toBe(false);
    await expect(traversal(h, 1)).resolves.toBe(false);

    await queuedJump(h, () => true).result;
    await expect(traversal(h, -1)).resolves.toBe(false);

    await queuedJump(h, () => h.setTab('reader-A')).result;
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    await expect(traversal(h, -1)).resolves.toBe(false);
    await expect(traversal(h, 1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
    await expect(traversal(h, 1)).resolves.toBe(false);
  });

  it('processes rapid Back and Forward presses sequentially', async () => {
    const h = harness();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    await queuedJump(h, () => h.setTab('reader-B')).result;
    await queuedJump(h, () => h.setTab('reader-C')).result;

    const firstBack = traversal(h, -1);
    const secondBack = traversal(h, -1);
    await expect(firstBack).resolves.toBe(true);
    await expect(secondBack).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');

    const firstForward = traversal(h, 1);
    const secondForward = traversal(h, 1);
    await expect(firstForward).resolves.toBe(true);
    await expect(secondForward).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-C');
  });

  it('runs Back after a pending explicit jump commits its destination', async () => {
    const h = harness();
    let finishJump!: () => void;
    const jump = queuedJump(h, () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      finishJump = () => {
        h.setTab('reader-A');
        resolve();
      };
      return promise;
    });
    await vi.waitFor(() => expect(finishJump).toBeTypeOf('function'));
    const back = traversal(h, -1);
    finishJump();

    await expect(jump.result).resolves.toBe(true);
    await expect(back).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
    expect(h.session.jumpHistory.index).toBe(0);
  });

  it('keeps independent stacks for two windows using one controller history service', async () => {
    const first = harness();
    const second = harness();
    await queuedJump(first, () => first.setTab('reader-A')).result;
    await queuedJump(first, () => second.setTab('reader-B'), second.window, second.session).result;

    await expect(traversal(first, -1)).resolves.toBe(true);
    expect(first.tabs.selectedID).toBe('zotero-pane');
    expect(second.tabs.selectedID).toBe('reader-B');
    await expect(traversal(first, -1, 1, second.window, second.session)).resolves.toBe(true);
    expect(second.tabs.selectedID).toBe('zotero-pane');
    expect(first.session.jumpHistory.locations).toHaveLength(2);
    expect(second.session.jumpHistory.locations).toHaveLength(2);
  });

  it('restores Main scope, filters, Cursor and focus across a Reader tab without changing Selection', async () => {
    const h = harness();
    h.setPanel('collections');
    const selectionBefore = h.selection.values();
    await queuedJump(h, () => h.setTab('reader-A')).result;

    h.setScopes(['C3']);
    h.setQuickText('changed');
    h.setTags(['new']);
    h.setAdvancedSearch(true);
    h.setPanel('items');
    h.setCursor(1);

    await expect(traversal(h, -1)).resolves.toBe(true);
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
    const history = new MainNavigationExecutor(logger, navigation, h.viewActions, h.readerHost);
    const focusedHarness: HistoryHarness = {
      window: h.window,
      session: h.session,
      history,
      tabs: h.tabs,
    };

    await queuedJump(focusedHarness, () => {
      h.setTab('reader-A');
      Reflect.set(doc, 'activeElement', { id: 'reader-browser', localName: 'browser' });
    }).result;
    await expect(traversal(focusedHarness, -1)).resolves.toBe(true);
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

    const reveal = selectLibrary(h, h.secondItem.id, {
      selectItem: (itemID) => {
        expect(itemID).toBe(h.secondItem.id);
        h.setCursor(1);
        return true;
      },
    });
    await expect(reveal.result).resolves.toBe(true);
    await expect(traversal(h, -1)).resolves.toBe(true);

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

      await selectLibrary(h, h.secondItem.id, {
        selectItem: () => {
          h.setCursor(1);
          return true;
        },
      }).result;

      expect(h.session.jumpHistory.locations[0]).toMatchObject({ panel: 'items' });
      await expect(traversal(h, -1)).resolves.toBe(true);
      expect(h.panel()).toBe('items');
      expect(h.cursor()).toBe(0);
      expect(h.selection.values()).toEqual(selectionBefore);
    },
  );

  it('leaves the history position unchanged for missing tabs and partial restores', async () => {
    const h = harness();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    const index = h.session.jumpHistory.index;
    h.tabs._tabs = h.tabs._tabs.filter((tab) => tab.id !== 'zotero-pane');

    await expect(traversal(h, -1)).resolves.toBe(false);
    expect(h.session.jumpHistory.index).toBe(index);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '→ Back partial · missing tab', 3200);

    h.tabs._tabs.push({ id: 'zotero-pane' });
    h.setQuickSearchAvailable(false);
    await expect(traversal(h, -1)).resolves.toBe(false);
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
    await queuedJump(h, () => h.setTab('reader-A')).result;
    h.setAdvancedSearch(false);
    const index = h.session.jumpHistory.index;

    await expect(traversal(h, -1)).resolves.toBe(false);
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
    await queuedJump(h, () => h.setTab('reader-A')).result;

    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.advancedSearch()).toBe(true);
    expect(h.session.jumpHistory.index).toBe(0);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '✓ Back');
  });

  it('lets a queued jump record the post-restore state after Back is superseded', async () => {
    const h = harness();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const staleBack = traversal(h, -1);
    await vi.waitFor(() => expect(h.selectScopeByID).toHaveBeenCalledOnce());
    const newerJump = queuedJump(h, () => h.setTab('reader-D'));
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
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('zotero-pane');
  });

  it('does not overwrite a native tab change while a restore is awaiting scope selection', async () => {
    const h = harness();
    await queuedJump(h, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const index = h.session.jumpHistory.index;
    const back = traversal(h, -1);
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
    await queuedJump(h, () => h.setTab('reader-A')).result;
    h.deferScopeSelection();
    const index = h.session.jumpHistory.index;
    const back = traversal(h, -1);
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
    const stale = queuedJump(h, () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      finish = () => {
        h.setTab('reader-A');
        resolve();
      };
      return promise;
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const latest = queuedJump(h, () => h.setTab('reader-B'));
    finish();

    await expect(stale.result).resolves.toBe(false);
    await expect(latest.result).resolves.toBe(true);
    await expect(traversal(h, -1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-A');
  });

  it('does not record failed navigation requests', async () => {
    const h = harness();
    await expect(queuedJump(h, () => false).result).resolves.toBe(false);
    await selectLibrary(h, 10, { selectItem: () => false }).result.catch(() => undefined);
    await expect(traversal(h, -1)).resolves.toBe(false);
  });

  it('clears and invalidates history when a window session is disposed', async () => {
    const h = harness();
    let finish!: () => void;
    const request = queuedJump(h, () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      finish = resolve;
      return promise;
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    h.session.jumpHistory.dispose();
    finish();

    await expect(request.result).resolves.toBe(false);
    expect(h.session.jumpHistory.locations).toEqual([]);
    expect(h.session.jumpHistory.index).toBe(-1);
  });

  it('retains Forward after a no-op tab confirmation', async () => {
    const h = harness();
    jumpNow(h, () => h.setTab('reader-A'));
    jumpNow(h, () => h.setTab('reader-B'));
    await traversal(h, -1);

    const confirmation = h.history.execute(
      h.window,
      h.session,
      { cause: { kind: 'action', action: 'switchTab' }, surface: 'main' },
      {
        dispatch: 'inline',
        start: () => ({
          kind: 'immediate',
          outcome: { kind: 'completed', evidence: 'settled-change' },
        }),
      },
    );
    expect(confirmation.result).toMatchObject({ kind: 'completed', recorded: false });
    await expect(traversal(h, 1)).resolves.toBe(true);
    expect(h.tabs.selectedID).toBe('reader-B');
  });
});
