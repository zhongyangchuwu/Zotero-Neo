import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';
import type { ItemTargetSet } from '../../src/core/item-target';
import { ModuleHost } from '../../src/core/module-host';
import { createCollectionsModule } from '../../src/modules/collections';
import type { CollectionConfirmation } from '../../src/modules/collections/actions';
import type { PickerProvider } from '../../src/main/picker/types';
import type { MainNavigation } from '../../src/main/navigation';
import { FuzzyPicker } from '../../src/main/picker';
import { SelectionStore } from '../../src/modules/worksets/selection-store';
import { createPickerHarness, pickerKey } from './feature-panel-harness';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function workflowHarness() {
  vi.useFakeTimers();
  const { window, session, cleanups } = createPickerHarness();
  session.activePanel = 'items';
  const selection = new SelectionStore();
  const library = {
    libraryID: 1,
    name: 'My library',
    editable: true,
    archived: false,
    libraryType: 'user',
    updateCollections: vi.fn(async () => undefined),
  };
  const collections = new Map<number, NativeCollection>();
  let nextID = 30;
  class NativeCollection {
    id = 0;
    libraryID = 1;
    name = '';
    parentID: number | false = false;
    deleted = false;
    constructor(values?: { libraryID: number; name: string }) {
      Object.assign(this, values);
    }
    addItems = vi.fn(async (ids: number[]) => {
      for (const id of ids) {
        const item = items.get(id)!;
        item.addToCollection(this.id);
        await item.save();
      }
    });
    getDescendents() {
      return [...collections.values()].filter((collection) => collection.parentID === this.id);
    }
    save = vi.fn(async (_options?: unknown) => {
      if (!this.id) this.id = nextID++;
      collections.set(this.id, this);
      return this.id;
    });
    reload = vi.fn(async () => undefined);
  }
  for (const [id, name, parentID] of [
    [10, 'Source', false],
    [11, 'Nested', 10],
    [20, 'Destination', false],
  ] as const) {
    const collection = new NativeCollection();
    Object.assign(collection, { id, name, parentID });
    collections.set(id, collection);
  }
  const makeItem = (id: number, memberships: number[]) => {
    const direct = new Set(memberships);
    return {
      id,
      libraryID: 1,
      deleted: false,
      isTopLevelItem: () => true,
      isRegularItem: () => true,
      getCollections: () => [...direct],
      getCreators: () => [],
      getField: (field: string) => (field === 'title' ? `Paper ${id}` : ''),
      addToCollection: vi.fn((collectionID: number) => direct.add(collectionID)),
      removeFromCollection: vi.fn((collectionID: number) => direct.delete(collectionID)),
      save: vi.fn(async () => undefined),
      loadAllData: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
    } as unknown as Zotero.Item;
  };
  const first = makeItem(1, [10]);
  const second = makeItem(2, [11]);
  const items = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  const scopeSelection = { count: 1, focused: 0, selected: new Set([0]) };
  const scopeRows = [
    { id: 'C10', ref: { libraryID: 1 } },
    { id: 'C20', ref: { libraryID: 1 } },
  ];
  const selectItem = vi.fn();
  Object.assign(window, {
    ZoteroPane: {
      collectionsView: {
        selection: scopeSelection,
        getRow: (index: number) => scopeRows[index],
        getRowIndexByID: (id: string) => scopeRows.findIndex((row) => row.id === id),
      },
      itemsView: { rowCount: 2 },
      selectItem,
    },
  });
  class NativeSearch {
    text = '';
    addCondition(field: string, _operator: string, value?: unknown) {
      if (field === 'quicksearch-titleCreatorYear') this.text = String(value);
    }
    async getSQL() {
      return 'SELECT itemID FROM items';
    }
    async getSQLParams() {
      return [this.text];
    }
  }
  const columnQueryAsync = vi.fn(async (_sql: string, params: unknown[]) =>
    [...items.values()]
      .filter((item) => String(item.getField('title')).includes(String(params[0])))
      .slice(0, Number(params.at(-1)))
      .map((item) => item.id),
  );
  const getAll = vi.fn(() => {
    throw new Error('Must not load the entire library');
  });
  const database = createCollectionTransactionDB();
  const transaction = database.executeTransaction;
  vi.stubGlobal('Zotero', {
    Collection: NativeCollection,
    Collections: {
      get: (id: number) => collections.get(id) ?? false,
      getByLibrary: (id: number) =>
        [...collections.values()].filter((collection) => collection.libraryID === id),
      getByParent: (id: number) =>
        [...collections.values()].filter((collection) => collection.parentID === id),
    },
    Items: {
      get: (id: number) => items.get(id) ?? false,
      getAsync: async (ids: number[]) => ids.flatMap((id) => items.get(id) ?? []),
      getAll,
      loadDataTypes: vi.fn(async () => undefined),
    },
    Libraries: { get: (id: number) => (id === 1 ? library : false) },
    Search: NativeSearch,
    DB: Object.assign(database, { columnQueryAsync }),
    getString: () => 'Name',
  });
  const prompt = vi.fn((_window, _title, _label, value: { value: string }) => {
    value.value = 'Created collection';
    return true;
  });
  const nativeConfirm = vi.fn(() => true);
  vi.stubGlobal('Services', {
    focus: { focusedWindow: null },
    prompt: { prompt, confirm: nativeConfirm },
  });
  const status = vi.fn();
  const navigation = { status, panel: () => session.activePanel } as unknown as MainNavigation;
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const picker = new FuzzyPicker(logger, navigation);
  const opened = vi.spyOn(picker, 'open');
  const navigate = vi.fn(async () => undefined);
  const host = new ModuleHost(logger, () => session.window === window);
  const captureCurrent = () => {
    const generation = session.picker.generation;
    return () => session.window === window && session.picker.generation === generation;
  };
  const actions = createCollectionsModule(host, {
    window,
    logger,
    status: (message) => status(session, message),
    navigate,
    captureCurrent,
    choose: (source: PickerProvider, confirm: CollectionConfirmation) => {
      if (session.picker.open) return null;
      const opening = picker.open(window, session, 'collections', {
        source,
        confirm: (candidate) => confirm(candidate, isCurrent, session.picker.committedQuery),
      });
      const generation = session.picker.generation;
      const isCurrent = () =>
        session.window === window &&
        session.picker.open &&
        session.picker.generation === generation &&
        session.picker.scope === 'collections';
      void opening;
      return () => {
        if (
          session.picker.open &&
          session.picker.generation === generation &&
          session.picker.scope === 'collections'
        )
          picker.close(session);
      };
    },
  });
  let resolved: ItemTargetSet = { source: 'main', items: [first], total: 1, missing: 0 };
  const resolveTargets = () => resolved;
  const request = { source: 'main' as const, label: 'context item' as const, resolveTargets };
  const start = async (action: () => void) => {
    action();
    await opened.mock.results.at(-1)?.value;
  };
  const input = (text: string) => {
    const field = session.picker.input as HTMLInputElement & { emit(type: string): void };
    field.value = text;
    field.emit('input');
  };
  const confirm = async (id: string | number) => {
    await vi.waitFor(() =>
      expect(session.picker.filtered.some((candidate) => candidate.id === id)).toBe(true),
    );
    const index = session.picker.filtered.findIndex((candidate) => candidate.id === id);
    session.picker.selected = index;
    picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
    await session.picker.queue;
  };
  return {
    window,
    session,
    selection,
    cleanups,
    host,
    request,
    actions,
    picker,
    start,
    input,
    confirm,
    navigate,
    status,
    first,
    second,
    items,
    collections,
    library,
    scopeSelection,
    scopeRows,
    prompt,
    nativeConfirm,
    columnQueryAsync,
    getAll,
    selectItem,
    transaction,
    opened,
    resolveTargets,
    targets: (value: ItemTargetSet) => {
      resolved = value;
    },
  };
}

describe('collection workflows', () => {
  it('adds the Reader context item through the Reader contribution', async () => {
    const h = workflowHarness();
    h.targets({ source: 'reader', items: [h.second], total: 1, missing: 0 });
    await h.start(() =>
      h.actions.add({
        source: 'reader',
        label: 'context item',
        resolveTargets: h.resolveTargets,
      }),
    );
    await h.confirm(20);
    expect(h.second.getCollections()).toEqual([11, 20]);
    expect(h.first.getCollections()).toEqual([10]);
  });

  it('continuously adds to the frozen active collection without selecting items, clearing Selection, or loading the library', async () => {
    const h = workflowHarness();
    h.selection.add({ libraryID: 1, itemID: 1 });
    await h.start(() => h.actions.addItems());
    expect(h.session.picker.filtered.find((candidate) => candidate.id === 1)?.meta).toContain(
      'Already',
    );
    await h.confirm(1);
    expect(h.first.save).not.toHaveBeenCalled();
    h.scopeSelection.selected = new Set([1]);
    h.scopeSelection.focused = 1;
    await h.confirm(2);
    expect(h.second.getCollections()).toEqual([11, 10]);
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.operationStatus?.textContent).toContain(
      'Current filters remain unchanged',
    );
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: 1 }]);
    expect(h.selectItem).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.getAll).not.toHaveBeenCalled();
    expect(h.columnQueryAsync.mock.calls[0]?.[1].at(-1)).toBe(100);
    h.picker.onKeyDown(pickerKey('Escape', h.session.picker.input), h.window, h.session);
    expect(h.session.picker.open).toBe(false);
    expect(h.second.getCollections()).toEqual([11, 10]);
  });

  it('refuses an item that disappears while native rendering data is loading', async () => {
    const h = workflowHarness();
    const entered = Promise.withResolvers<void>();
    const loading = Promise.withResolvers<void>();
    vi.mocked(h.second.loadAllData).mockImplementationOnce(() => {
      entered.resolve();
      return loading.promise;
    });
    await h.start(() => h.actions.addItems());
    h.input('Paper 2');
    const confirmation = h.confirm(2);
    await entered.promise;
    h.items.delete(h.second.id);
    loading.resolve();
    await confirmation;

    expect(h.second.getCollections()).toEqual([11]);
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.input?.value).toBe('Paper 2');
    expect(h.session.picker.operationStatus?.textContent).toContain('no longer available');
  });

  it('retains query and candidate on a failed addition and rejects changed permissions before save', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.addItems());
    h.input('Paper 2');
    await vi.waitFor(() =>
      expect(h.session.picker.filtered.map((candidate) => candidate.id)).toEqual([2]),
    );
    vi.mocked(h.second.save).mockRejectedValueOnce(new Error('disk unavailable'));
    await h.confirm(2);
    expect(h.second.getCollections()).toEqual([11]);
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.input?.value).toBe('Paper 2');
    expect(h.session.picker.operationStatus?.textContent).toContain('disk unavailable');
    h.library.editable = false;
    await h.confirm(2);
    expect(h.second.save).toHaveBeenCalledTimes(1);
    expect(h.session.picker.operationStatus?.textContent).toContain('read-only');
  });

  it('requires actual direct source membership for movement and refuses a changed source at confirmation', async () => {
    const h = workflowHarness();
    h.targets({ source: 'main', items: [h.first, h.second], total: 2, missing: 0 });
    h.actions.moveItems(h.request);
    expect(h.opened).not.toHaveBeenCalled();
    expect(h.status).toHaveBeenLastCalledWith(
      h.session,
      expect.stringContaining('directly assigned'),
    );
    h.targets({ source: 'main', items: [h.first], total: 1, missing: 0 });
    await h.start(() => h.actions.moveItems(h.request));
    h.scopeSelection.selected = new Set([1]);
    h.scopeSelection.focused = 1;
    await h.confirm(20);
    expect(h.first.getCollections()).toEqual([10]);
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.operationStatus?.textContent).toContain('unchanged targets');
  });

  it('keeps explicit creation mutation-free on cancel and restores the original membership query', async () => {
    const h = workflowHarness();
    h.prompt.mockReturnValueOnce(false);
    await h.start(() => h.actions.add(h.request));
    h.input('Destination');
    await h.confirm('create');
    expect(h.session.picker.provider?.title).toContain('choose parent');
    await h.confirm('root');
    expect(h.collections.size).toBe(3);
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.session.picker.input?.value).toBe('Destination');
    expect(h.session.picker.filtered.map((candidate) => candidate.id)).toEqual([20, 'create']);
    expect(h.first.getCollections()).toEqual([10]);
  });

  it.each(['create', 'create-and-add'] as const)(
    'does not open a confirmation after %s retires inside the name prompt',
    async (workflow) => {
      const h = workflowHarness();
      await h.start(() => (workflow === 'create' ? h.actions.create() : h.actions.add(h.request)));
      if (workflow === 'create-and-add') await h.confirm('create');
      h.prompt.mockImplementationOnce((_window, _title, _label, value) => {
        value.value = 'Retired name';
        h.host.dispose();
        return true;
      });
      const feedback = h.status.mock.calls.length;

      await h.confirm('root');

      expect(h.nativeConfirm).not.toHaveBeenCalled();
      expect(h.transaction).not.toHaveBeenCalled();
      expect([...h.collections.values()].map((collection) => collection.name)).toEqual([
        'Source',
        'Nested',
        'Destination',
      ]);
      expect(h.first.getCollections()).toEqual([10]);
      expect(h.session.picker.open).toBe(false);
      expect(h.status.mock.calls.slice(feedback)).toEqual([]);
    },
  );

  it('creates under the chosen parent and adds the frozen targets only after explicit final confirmation', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.add(h.request));
    await h.confirm('create');
    await h.confirm(20);
    expect(h.nativeConfirm).toHaveBeenCalledWith(
      h.window,
      expect.any(String),
      expect.stringContaining('add 1 items'),
    );
    const created = [...h.collections.values()].find(
      (collection) => collection.name === 'Created collection',
    );
    expect(created?.parentID).toBe(20);
    expect(h.first.getCollections()).toEqual([10, created!.id]);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.session.picker.open).toBe(false);
  });

  it('rejects a source-surface change even when item IDs are unchanged', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.add(h.request));
    h.targets({ source: 'reader', items: [h.first], total: 1, missing: 0 });
    await h.confirm(20);
    expect(h.first.save).not.toHaveBeenCalled();
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.operationStatus?.textContent).toContain('target changed');
  });

  it('finds read-only collections without navigating on preview or cancel, and navigates only on confirmation', async () => {
    const h = workflowHarness();
    h.library.editable = false;
    const tree = h.window.document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      'div',
    ) as HTMLElement;
    tree.id = 'collection-tree';
    tree.focus();
    const items = h.window.document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      'div',
    ) as HTMLElement;
    items.id = 'item-tree-main-default';
    const recordedPanels: string[] = [];
    h.navigate.mockImplementationOnce(async () => {
      items.focus();
      h.session.activePanel = 'items';
      recordedPanels.push(h.session.activePanel);
    });
    await h.start(() => h.actions.find());
    h.input('Destination');
    expect(h.navigate).not.toHaveBeenCalled();
    h.picker.onKeyDown(pickerKey('Escape', h.session.picker.input), h.window, h.session);
    expect(h.navigate).not.toHaveBeenCalled();
    await h.start(() => h.actions.find());
    await h.confirm(20);
    expect(h.navigate).toHaveBeenCalledWith(20);
    expect(h.window.document.activeElement).toBe(items);
    expect(h.session.activePanel).toBe('items');
    expect(recordedPanels).toEqual(['items']);
  });

  it('binds collection moves to the focused tree cursor and excludes its descendants', async () => {
    const h = workflowHarness();
    const tree = h.window.document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      'div',
    ) as HTMLElement;
    tree.id = 'collection-tree';
    tree.focus();
    h.scopeSelection.selected = new Set([1]);
    await h.start(() => h.actions.move());
    expect(h.session.picker.filtered.map((candidate) => candidate.id)).toEqual(['root', 20]);
    await h.confirm(20);
    expect(h.collections.get(10)?.parentID).toBe(20);
    expect(h.first.getCollections()).toEqual([10]);
  });

  it('does not start mutations on ambiguous active scopes or after module retirement', async () => {
    const h = workflowHarness();
    h.scopeSelection.count = 2;
    h.scopeSelection.selected = new Set([0, 1]);
    h.actions.addItems();
    h.actions.rename();
    h.actions.removeCollection();
    expect(h.opened).not.toHaveBeenCalled();
    expect(h.prompt).not.toHaveBeenCalled();
    expect(h.nativeConfirm).not.toHaveBeenCalled();
    h.scopeSelection.count = 1;
    h.scopeSelection.selected = new Set([0]);
    await h.start(() => h.actions.addItems());
    const oldInput = h.session.picker.input;
    h.host.dispose();
    h.picker.onKeyDown(pickerKey('Enter', oldInput), h.window, h.session);
    await h.session.picker.queue;
    expect(h.first.save).not.toHaveBeenCalled();
    expect(h.second.save).not.toHaveBeenCalled();
  });

  it('rejects a retained confirmation after retirement without writing', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.add(h.request));
    const confirm = h.session.picker.confirm!;
    const candidate = h.session.picker.filtered.find((item) => item.id === 20)!;
    h.host.dispose();
    await expect(Promise.resolve().then(() => confirm(candidate, false))).rejects.toThrow();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.first.getCollections()).toEqual([10]);
    expect(h.actions.add(h.request)).toBe(false);
  });

  it('rolls back membership when retired while a save is in progress', async () => {
    const h = workflowHarness();
    const entered = Promise.withResolvers<void>();
    const saving = Promise.withResolvers<void>();
    const save = vi.mocked(h.first.save).getMockImplementation()!;
    vi.mocked(h.first.save).mockImplementationOnce(async () => {
      entered.resolve();
      await saving.promise;
      return save();
    });
    await h.start(() => h.actions.add(h.request));
    const confirmation = h.confirm(20);
    await entered.promise;
    h.host.dispose();
    saving.resolve();
    await confirmation;
    expect(h.first.getCollections()).toEqual([10]);
    expect(h.first.reload).toHaveBeenCalled();
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('retains ownership of an open picker when another request finds it busy', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.add(h.request));
    h.actions.add(h.request);
    h.host.dispose();
    expect(h.session.picker.open).toBe(false);
  });

  it('does not close a replacement picker when the old module retires', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.add(h.request));
    const source = h.session.picker.provider!;
    h.picker.close(h.session);
    await h.picker.open(h.window, h.session, 'all', { source });
    const generation = h.session.picker.generation;
    h.host.dispose();
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.generation).toBe(generation);
    expect(h.session.picker.provider).toBe(source);
  });

  it('creates only under an explicitly chosen parent and leaves existing memberships alone', async () => {
    const h = workflowHarness();
    await h.start(() => h.actions.create());
    await h.confirm(20);
    const created = [...h.collections.values()].find(
      (collection) => collection.name === 'Created collection',
    );
    expect(created?.parentID).toBe(20);
    expect(h.first.getCollections()).toEqual([10]);
    expect(h.second.getCollections()).toEqual([11]);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('cancels native rename and deletion without saving, then renames by stable identity and deletes with items kept', async () => {
    const h = workflowHarness();
    h.prompt.mockReturnValueOnce(false);
    h.actions.rename();
    await Promise.resolve();
    expect(h.collections.get(10)?.name).toBe('Source');
    expect(h.collections.get(10)?.save).not.toHaveBeenCalled();
    h.nativeConfirm.mockReturnValueOnce(false);
    h.actions.removeCollection();
    await Promise.resolve();
    expect(h.collections.get(10)?.deleted).toBe(false);
    expect(h.collections.get(10)?.save).not.toHaveBeenCalled();
    h.actions.rename();
    await vi.waitFor(() =>
      expect(h.status).toHaveBeenCalledWith(h.session, expect.stringContaining('Renamed')),
    );
    expect(h.collections.get(10)?.name).toBe('Created collection');
    h.actions.removeCollection();
    await vi.waitFor(() =>
      expect(h.status).toHaveBeenCalledWith(h.session, expect.stringContaining('all items kept')),
    );
    expect(h.collections.get(10)?.save).toHaveBeenLastCalledWith({ deleteItems: false });
    expect(h.first.getCollections()).toEqual([10]);
    expect(h.first.deleted).toBe(false);
    expect(h.second.deleted).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('preserves a failed rename draft for the next explicit native-dialog retry', async () => {
    const h = workflowHarness();
    vi.mocked(h.collections.get(10)!.save).mockRejectedValueOnce(new Error('disk unavailable'));
    h.actions.rename();
    await vi.waitFor(() =>
      expect(h.status).toHaveBeenCalledWith(h.session, expect.stringContaining('disk unavailable')),
    );
    expect(h.collections.get(10)?.name).toBe('Source');
    h.prompt.mockImplementationOnce((_window, _title, _label, value) => {
      expect(value.value).toBe('Created collection');
      return false;
    });
    h.actions.rename();
    await Promise.resolve();
    expect(h.collections.get(10)?.save).toHaveBeenCalledTimes(1);
  });

  it('moves direct members from the explicit source while retaining all other memberships', async () => {
    const h = workflowHarness();
    h.first.addToCollection(11);
    await h.start(() => h.actions.moveItems(h.request));
    await h.confirm(20);
    expect(h.first.getCollections()).toEqual([11, 20]);
    expect(h.second.getCollections()).toEqual([11]);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.session.picker.open).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('retains the parent candidate and typed creation name after a failed transaction', async () => {
    const h = workflowHarness();
    h.transaction.mockRejectedValueOnce(new Error('transaction unavailable'));
    await h.start(() => h.actions.add(h.request));
    await h.confirm('create');
    await h.confirm(20);
    expect(h.session.picker.open).toBe(true);
    expect(h.session.picker.filtered[h.session.picker.selected]?.id).toBe(20);
    expect(h.session.picker.operationStatus?.textContent).toContain('transaction unavailable');
    expect(h.collections.size).toBe(3);
    expect(h.first.getCollections()).toEqual([10]);
    h.prompt.mockImplementationOnce((_window, _title, _label, value) => {
      expect(value.value).toBe('Created collection');
      return false;
    });
    await h.confirm(20);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.session.picker.provider?.title).toContain('Add');
  });
});
