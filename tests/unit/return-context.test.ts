import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainReturnContext } from '../../src/main/return-context';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import type { MainNavigation } from '../../src/main/navigation';
import type { MainViewActions } from '../../src/main/view-actions';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function harness(advanced = true) {
  const item = { id: 10, libraryID: 1 } as Zotero.Item;
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => (id === 10 ? item : false) },
  });

  const scopeRows = [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }];
  const selectedScopes = new Set([0, 1]);
  let scopeFocused = 1;
  const scopeSelect = vi.fn((index: number) => {
    selectedScopes.clear();
    selectedScopes.add(index);
    scopeFocused = index;
  });
  const scopeToggle = vi.fn((index: number) => {
    if (selectedScopes.has(index)) selectedScopes.delete(index);
    else selectedScopes.add(index);
  });
  const scopeSelectByID = vi.fn(async (id: string) => {
    const index = scopeRows.findIndex((row) => row.id === id);
    if (index >= 0) scopeSelect(index);
  });

  const itemRows = [{ isObjectRow: true, ref: item }];
  let itemFocused = 0;
  const itemSelect = vi.fn((index: number) => {
    itemFocused = index;
  });
  const itemToggle = vi.fn();
  const itemClear = vi.fn();
  const itemMove = vi.fn((index: number) => {
    itemFocused = index;
  });

  const quick = { value: 'alpha', searchTextbox: { value: 'alpha', select: vi.fn() } };
  const tabSelect = vi.fn();
  const window = {
    document: {
      activeElement: null,
      getElementById: (id: string) => (id === 'zotero-tb-search' ? quick : null),
      querySelector: () => null,
    },
    Zotero_Tabs: {
      selectedID: 'library',
      select: tabSelect,
    },
    ZoteroPane: {
      collectionsView: {
        rowCount: scopeRows.length,
        selection: {
          get focused() {
            return scopeFocused;
          },
          get count() {
            return selectedScopes.size;
          },
          selected: selectedScopes,
          select: scopeSelect,
          toggleSelect: scopeToggle,
        },
        getRow: (index: number) => scopeRows[index],
        getRowIndexByID: (id: string) => {
          const index = scopeRows.findIndex((row) => row.id === id);
          return index < 0 ? false : index;
        },
        selectByID: scopeSelectByID,
      },
      itemsView: {
        rowCount: itemRows.length,
        selection: {
          get focused() {
            return itemFocused;
          },
          select: itemSelect,
          toggleSelect: itemToggle,
          clearSelection: itemClear,
        },
        tree: { _onSelection: itemMove },
        getRow: (index: number) => itemRows[index],
        getRowIndexByID: (id: number) => (id === 10 ? 0 : false),
        ensureRowIsVisible: vi.fn(),
      },
    },
  } as unknown as MainWindow;

  let quickText = 'alpha';
  let tags = ['one', 'two'];
  let advancedState = advanced;
  const applyQuickSearch = vi.fn(async (_window: MainWindow, text: string) => {
    quickText = text;
    quick.value = text;
    quick.searchTextbox.value = text;
    return true;
  });
  const applyTagFilter = vi.fn(async (_window: MainWindow, next: readonly string[]) => {
    tags = [...next];
    return 1;
  });
  const viewActions = {
    state: vi.fn(() => ({
      quickSearchText: quickText,
      tags: [...tags],
      advancedSearch: advancedState,
    })),
    applyQuickSearch,
    applyTagFilter,
  } as unknown as MainViewActions;

  const status = vi.fn();
  const focusPanel = vi.fn(() => true);
  const navigation = {
    panel: vi.fn(() => 'items'),
    status,
    focusPanel,
  } as unknown as MainNavigation;

  const selection = new SelectionStore();
  selection.add({ libraryID: 1, itemID: 10 });
  const session = {
    window,
    selection,
    activePanel: 'items',
    returnBookmark: null,
  } as unknown as MainWindowSession;

  const context = new MainReturnContext({ debug: vi.fn() } as never, navigation, viewActions);

  return {
    window,
    session,
    context,
    selectedScopes,
    scopeSelect,
    scopeToggle,
    scopeSelectByID,
    quickText: () => quickText,
    tags: () => tags,
    setQuickText: (value: string) => {
      quickText = value;
      quick.value = value;
      quick.searchTextbox.value = value;
    },
    setTags: (value: string[]) => {
      tags = [...value];
    },
    setAdvanced: (value: boolean) => {
      advancedState = value;
    },
    status,
    focusPanel,
    tabSelect,
    itemMove,
  };
}

describe('Main return context', () => {
  it('captures stable scope/View/Cursor state without copying or changing Selection', () => {
    const h = harness(true);
    const before = h.session.selection.values();

    const bookmark = h.context.capture(h.window, h.session);

    expect(bookmark).toMatchObject({
      scopeIDs: ['C1', 'C2'],
      quickSearchText: 'alpha',
      tags: ['one', 'two'],
      advancedSearch: true,
      cursor: { libraryID: 1, itemID: 10 },
      panel: 'items',
      tabID: 'library',
    });
    expect(h.session.returnBookmark).toEqual(bookmark);
    expect(h.session.selection.values()).toEqual(before);
  });

  it('restores scope, Quick Search, tags, Cursor and focus while preserving Selection', async () => {
    const h = harness(false);
    h.context.capture(h.window, h.session);
    const before = h.session.selection.values();

    h.selectedScopes.clear();
    h.selectedScopes.add(2);
    h.setQuickText('');
    h.setTags([]);

    await expect(h.context.restore(h.window, h.session)).resolves.toBe(true);

    expect([...h.selectedScopes]).toEqual([0, 1]);
    expect(h.quickText()).toBe('alpha');
    expect(h.tags()).toEqual(['one', 'two']);
    expect(h.itemMove).toHaveBeenCalledWith(0, false, false, true, false);
    expect(h.focusPanel).toHaveBeenCalledWith(h.window, h.session, 'items');
    expect(h.tabSelect).toHaveBeenCalledWith('library');
    expect(h.session.selection.values()).toEqual(before);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '✓ Returned to saved Main context');
  });

  it('reports partial return when captured Advanced Search conditions were lost', async () => {
    const h = harness(true);
    h.context.capture(h.window, h.session);
    h.setAdvanced(false);

    await expect(h.context.restore(h.window, h.session)).resolves.toBe(false);

    expect(h.status).toHaveBeenLastCalledWith(
      h.session,
      '→ Return partial · missing advanced search',
      3200,
    );
    expect(h.session.returnBookmark?.advancedSearch).toBe(true);
  });

  it('refuses return without a bookmark', async () => {
    const h = harness(false);
    h.session.returnBookmark = null;

    await expect(h.context.restore(h.window, h.session)).resolves.toBe(false);
    expect(h.status).toHaveBeenLastCalledWith(h.session, '✗ No return context');
  });
});
