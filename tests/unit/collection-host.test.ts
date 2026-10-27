import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import {
  mainActiveCollection,
  mainCollectionLibrary,
  mainCollectionRef,
  mainCollectionRefs,
  mainCursorCollection,
  mainLibraryWritable,
  promptMainCollectionName,
  confirmMainCollectionAction,
  queryMainCollectionItems,
  selectMainCollection,
  selectMainScopeCursor,
  waitForMainItemView,
} from '../../src/toolkit/main/collections';
import { restoreMainScopeIDs } from '../../src/toolkit/main/host';

afterEach(() => vi.unstubAllGlobals());

function host() {
  const collections = new Map([
    [
      10,
      { id: 10, libraryID: 1, name: 'Parent', parentID: false as number | false, deleted: false },
    ],
    [
      11,
      { id: 11, libraryID: 1, name: 'Same name', parentID: 10 as number | false, deleted: false },
    ],
    [
      20,
      {
        id: 20,
        libraryID: 1,
        name: 'Same name',
        parentID: false as number | false,
        deleted: false,
      },
    ],
  ]);
  const libraries = new Map([
    [1, { name: 'My Library', editable: true, archived: false, libraryType: 'user' }],
  ]);
  const rows = ['L1', 'C10', 'C11', 'C20', 'S5'].map((id) => ({ id, ref: { libraryID: 1 } }));
  const selected = new Set([2]);
  const field = { value: 'native filter' };
  const selection = {
    focused: 3,
    selected,
    get count() {
      return selected.size;
    },
    selectEventsSuppressed: false,
    select: vi.fn((row: number) => {
      selected.clear();
      selected.add(row);
      selection.focused = row;
    }),
  };
  const view = {
    _filter: '',
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: string) => {
      const index = rows.findIndex((row) => row.id === id);
      return index >= 0 ? index : false;
    },
    expandToCollection: vi.fn(async (_id: number) => undefined),
    setFilter: vi.fn(async (text: string) => {
      view._filter = text;
    }),
    ensureRowIsVisible: vi.fn(),
  };
  const itemView = {
    collectionTreeRows: [{ id: 'C11' }],
    waitForLoad: vi.fn<() => Promise<void>>(async () => {}),
  };
  const tree = { contains: (node: unknown) => node === tree };
  const document = {
    activeElement: null as unknown,
    getElementById: (id: string) =>
      id === 'zotero-collections-search' ? field : id === 'collection-tree' ? tree : null,
    querySelector: () => null,
  };
  const pane = {
    collectionsView: view,
    itemsView: itemView,
    onCollectionSelected: vi.fn<() => Promise<void>>(async () => {
      pane.itemsView.collectionTreeRows = [...selected].map((index) => ({ id: rows[index]!.id }));
    }),
  };
  const window = { document, ZoteroPane: pane } as unknown as MainWindow;
  vi.stubGlobal('Zotero', {
    Collections: {
      get: (id: number) => collections.get(id) || false,
      getByLibrary: () => [...collections.values()],
    },
    Libraries: { get: (id: number) => libraries.get(id) || false },
    getString: () => 'Name',
  });
  return {
    window,
    collections,
    libraries,
    rows,
    selected,
    selection,
    view,
    itemView,
    pane,
    document,
    tree,
    field,
  };
}

describe('stable collection projections', () => {
  it('keeps active selection distinct from detached cursor and refuses multiselection guesses', () => {
    const h = host();
    expect(mainActiveCollection(h.window)).toMatchObject({ id: 11, path: 'Parent / Same name' });
    expect(mainCursorCollection(h.window)).toMatchObject({ id: 20, path: 'Same name' });
    h.selected.add(1);
    expect(mainActiveCollection(h.window)).toBeUndefined();
    expect(mainCursorCollection(h.window)?.id).toBe(20);
    h.selected.clear();
    h.selected.add(0);
    expect(mainActiveCollection(h.window)).toBeUndefined();
    h.selection.focused = 0;
    expect(mainCursorCollection(h.window)).toBeUndefined();
  });

  it('exposes duplicate-name stable paths without altering native selection or expansion', () => {
    const h = host();
    expect(
      mainCollectionRefs(1)
        .filter((ref) => ref.name === 'Same name')
        .map((ref) => [ref.id, ref.path]),
    ).toEqual([
      [11, 'Parent / Same name'],
      [20, 'Same name'],
    ]);
    expect(h.selected).toEqual(new Set([2]));
    expect(h.view.expandToCollection).not.toHaveBeenCalled();
    expect(h.selection.select).not.toHaveBeenCalled();
    h.collections.get(10)!.deleted = true;
    expect(mainCollectionRef(11)).toBeUndefined();
    h.collections.get(10)!.deleted = false;
    h.collections.get(10)!.parentID = 11;
    expect(mainCollectionRef(11)).toBeUndefined();
  });

  it('projects library root and tree-cursor library but never a first-of-multi library', () => {
    const h = host();
    h.selected.clear();
    h.selected.add(0);
    expect(mainCollectionLibrary(h.window)).toEqual({
      libraryID: 1,
      name: 'My Library',
      editable: true,
    });
    h.selected.add(2);
    expect(mainCollectionLibrary(h.window)).toBeUndefined();
    h.document.activeElement = h.tree;
    expect(mainCollectionLibrary(h.window)?.libraryID).toBe(1);
    h.libraries.get(1)!.archived = true;
    expect(mainLibraryWritable(1)).toBe(false);
    h.libraries.get(1)!.archived = false;
    h.libraries.get(1)!.libraryType = 'feed';
    expect(mainLibraryWritable(1)).toBe(false);
  });

  it('returns cancellation without mutation and forwards explicit native confirmation', () => {
    const h = host();
    const prompt = vi.fn((_window, _title, _label, value) => {
      value.value = 'Edited';
      return false;
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('Services', { prompt: { prompt, confirm } });
    expect(promptMainCollectionName(h.window, 'Create collection', 'Before')).toBeUndefined();
    expect(confirmMainCollectionAction(h.window, 'Delete', 'Keep all items')).toBe(false);
    expect(confirm).toHaveBeenCalledWith(h.window, 'Delete', 'Keep all items');
    expect(h.selection.select).not.toHaveBeenCalled();
    prompt.mockImplementationOnce((_window, _title, _label, value) => {
      value.value = '  Accepted  ';
      return true;
    });
    expect(promptMainCollectionName(h.window, 'Rename', 'Before')).toBe('Accepted');
  });
});

describe('history scope restoration settlement', () => {
  it('does not report restored selection before its native serial handler renders the requested scope', async () => {
    const h = host();
    const release = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      h.itemView.collectionTreeRows = [{ id: 'C20' }];
    });
    let completed = false;
    const result = restoreMainScopeIDs(h.window, ['C20'], () => true).then((value) => {
      completed = true;
      return value;
    });
    await started.promise;
    expect(h.selected).toEqual(new Set([3]));
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C11' }]);
    expect(completed).toBe(false);
    release.resolve();
    await expect(result).resolves.toBe(true);
  });

  it('restores and settles the complete multiselection rather than only its first native row', async () => {
    const h = host();
    Reflect.set(h.selection, 'toggleSelect', (row: number) => {
      if (h.selected.has(row)) h.selected.delete(row);
      else h.selected.add(row);
    });
    await expect(restoreMainScopeIDs(h.window, ['C10', 'C20'], () => true)).resolves.toBe(true);
    expect(h.selected).toEqual(new Set([1, 3]));
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C10' }, { id: 'C20' }]);
  });

  it('rejects restored tree IDs when native item rows still belong to the previous scope', async () => {
    const h = host();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {});
    await expect(restoreMainScopeIDs(h.window, ['C20'], () => true)).resolves.toBe(false);
    expect(h.selected).toEqual(new Set([3]));
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C11' }]);
  });

  it('retires restoration while its native serial scope handler is pending', async () => {
    const h = host();
    let current = true;
    const release = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      h.itemView.collectionTreeRows = [{ id: 'C20' }];
    });
    const result = restoreMainScopeIDs(h.window, ['C20'], () => current);
    await started.promise;
    current = false;
    release.resolve();
    await expect(result).resolves.toBe(false);
  });
});

describe('confirmed collection selection settlement', () => {
  it('clears native filter and reveals ancestors only for confirmed current navigation', async () => {
    const h = host();
    h.view._filter = 'native filter';
    await expect(selectMainCollection(h.window, 20, () => false)).resolves.toBe(false);
    expect(h.field.value).toBe('native filter');
    expect(h.view.setFilter).not.toHaveBeenCalled();
    await expect(selectMainCollection(h.window, 20, () => true)).resolves.toBe(true);
    expect(h.field.value).toBe('');
    expect(h.view.setFilter).toHaveBeenCalledWith('');
    expect(h.view.expandToCollection).toHaveBeenCalledWith(20);
    expect(h.selected).toEqual(new Set([3]));
    expect(h.itemView.waitForLoad).toHaveBeenCalledTimes(1);
  });

  it('awaits item load after native scope selection before reporting success', async () => {
    const h = host();
    const load = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.itemView.waitForLoad.mockImplementationOnce(() => {
      started.resolve();
      return load.promise;
    });
    let settled = false;
    const result = selectMainCollection(h.window, 20, () => true).then((value) => {
      settled = true;
      return value;
    });
    await started.promise;
    expect(h.selected).toEqual(new Set([3]));
    expect(settled).toBe(false);
    load.resolve();
    await expect(result).resolves.toBe(true);
  });

  it('does not inspect item readiness until native scope selection has settled', async () => {
    const h = host();
    const release = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      h.itemView.collectionTreeRows = [{ id: 'C20' }];
    });
    const result = selectMainCollection(h.window, 20, () => true);
    await started.promise;
    expect(h.selected).toEqual(new Set([3]));
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C11' }]);
    expect(h.itemView.waitForLoad).not.toHaveBeenCalled();
    release.resolve();
    await expect(result).resolves.toBe(true);
    expect(h.selected).toEqual(new Set([3]));
  });

  it('awaits the existing item load even when activating the already selected scope', async () => {
    const h = host();
    h.selection.focused = 2;
    const load = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.itemView.waitForLoad.mockImplementationOnce(() => {
      started.resolve();
      return load.promise;
    });
    let settled = false;
    const result = selectMainScopeCursor(h.window, () => true).then((value) => {
      settled = true;
      return value;
    });
    await started.promise;
    expect(settled).toBe(false);
    expect(h.selection.select).not.toHaveBeenCalled();
    load.resolve();
    await expect(result).resolves.toBe(true);
  });

  it('waits for delayed native scope handling when selected scope is ahead of the old item view', async () => {
    const h = host();
    h.selected.clear();
    h.selected.add(3);
    const release = Promise.withResolvers<void>();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {
      await release.promise;
      h.itemView.collectionTreeRows = [{ id: 'C20' }];
    });
    const result = selectMainScopeCursor(h.window, () => true);
    expect(h.pane.onCollectionSelected).toHaveBeenCalledTimes(1);
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C11' }]);
    expect(h.itemView.waitForLoad).not.toHaveBeenCalled();
    release.resolve();
    await expect(result).resolves.toBe(true);
  });

  it('refuses success when the loaded item view still belongs to another native scope', async () => {
    const h = host();
    h.pane.onCollectionSelected.mockImplementationOnce(async () => {});
    await expect(selectMainScopeCursor(h.window, () => true)).resolves.toBe(false);
    expect(h.selected).toEqual(new Set([3]));
    expect(h.itemView.collectionTreeRows).toEqual([{ id: 'C11' }]);
  });

  it('commits saved-search cursor identity as a singleton scope instead of retaining multi-selection', async () => {
    const h = host();
    h.selection.focused = 4;
    h.selected.add(4);
    await expect(selectMainScopeCursor(h.window, () => true)).resolves.toBe(true);
    expect(h.selected).toEqual(new Set([4]));
    expect(h.pane.onCollectionSelected).toHaveBeenCalledTimes(1);
    expect(h.view.expandToCollection).not.toHaveBeenCalled();
  });

  it('retires navigation after expansion without selecting the stale target', async () => {
    const h = host();
    let current = true;
    h.view.expandToCollection.mockImplementationOnce(async () => {
      current = false;
    });
    await expect(selectMainCollection(h.window, 20, () => current)).resolves.toBe(false);
    expect(h.selection.select).not.toHaveBeenCalled();
    expect(h.selected).toEqual(new Set([2]));
  });

  it('rejects a replaced item view and changed selected scope during asynchronous load', async () => {
    const h = host();
    const load = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    h.itemView.waitForLoad.mockImplementationOnce(() => {
      started.resolve();
      return load.promise;
    });
    const result = waitForMainItemView(h.window, () => true);
    await started.promise;
    h.pane.itemsView = {
      collectionTreeRows: [{ id: 'C11' }],
      waitForLoad: vi.fn<() => Promise<void>>(async () => {}),
    };
    load.resolve();
    await expect(result).resolves.toBe(false);

    h.pane.itemsView.waitForLoad.mockImplementationOnce(async () => {
      h.selected.clear();
      h.selected.add(0);
    });
    await expect(selectMainCollection(h.window, 20, () => true)).resolves.toBe(false);
  });
});

describe('bounded native item query', () => {
  it('bounds IDs and loads cold fields, creators and memberships before returning candidates', async () => {
    const conditions: unknown[][] = [];
    class Search {
      addCondition(...args: unknown[]) {
        conditions.push(args);
      }
      async getSQL() {
        return 'SELECT itemID FROM items WHERE libraryID = ?';
      }
      async getSQLParams() {
        return [1];
      }
    }
    const loadedByID = new Map<number, Set<string>>();
    const load = vi.fn(async (ids: number[]) =>
      ids.map((id) => {
        const loaded = new Set(['primaryData']);
        loadedByID.set(id, loaded);
        return {
          id,
          libraryID: id === 4 ? 2 : 1,
          deleted: id === 3,
          isRegularItem: () => id !== 2,
          isTopLevelItem: () => true,
          getField: (field: string) => {
            if (!loaded.has('itemData')) throw new Error('Cold item fields');
            return field === 'title' ? 'Cold matching item' : '2026';
          },
          getCreators: () => {
            if (!loaded.has('creators')) throw new Error('Cold item creators');
            return [{ firstName: 'Ada', lastName: 'Lovelace', creatorTypeID: 1 }];
          },
          getCollections: () => {
            if (!loaded.has('collections')) throw new Error('Cold item memberships');
            return [10];
          },
        };
      }),
    );
    const loadDataTypes = vi.fn(async (items: Array<{ id: number }>, types: string[]) => {
      for (const item of items) for (const type of types) loadedByID.get(item.id)!.add(type);
    });
    const query = vi.fn(async (_sql: string, params: number[]) => {
      const requested = params[params.length - 1]!;
      return [1, 2, 3, 4].slice(0, requested);
    });
    vi.stubGlobal('Zotero', {
      Search,
      Libraries: { get: () => ({ editable: true }) },
      DB: { columnQueryAsync: query },
      Items: { getAsync: load, loadDataTypes },
    });
    const result = await queryMainCollectionItems(1, 'science', 3);
    expect(load).toHaveBeenCalledWith([1, 2, 3]);
    expect(result.map((item) => item.id)).toEqual([1]);
    expect(
      result.map((item) => ({
        title: item.getField('title'),
        year: item.getField('year'),
        creators: item.getCreators().map((creator) => creator.lastName),
        collections: item.getCollections(),
      })),
    ).toEqual([
      { title: 'Cold matching item', year: '2026', creators: ['Lovelace'], collections: [10] },
    ]);
    expect(loadDataTypes.mock.calls[0]![0].map((item) => item.id)).toEqual([1]);
    expect([...loadedByID.get(2)!]).toEqual(['primaryData']);
    expect([...loadedByID.get(3)!]).toEqual(['primaryData']);
    expect(query.mock.calls[0]![0]).toMatch(/LIMIT \?/);
    expect(query.mock.calls[0]![1]).toEqual([1, 3]);
    expect(conditions).toContainEqual(['libraryID', 'is', 1]);
    expect(conditions).toContainEqual(['quicksearch-titleCreatorYear', 'contains', 'science']);
    expect(conditions).toContainEqual(['deleted', 'false']);
  });
});
