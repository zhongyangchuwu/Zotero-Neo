import { afterEach, describe, expect, it, vi } from 'vitest';
import * as logging from '../../src/core/logging';
import {
  createCollection,
  createCollectionAndAdd,
  deleteCollection,
  moveCollection,
  renameCollection,
} from '../../src/operations/collections';
import {
  moveCollectionItems,
  setCollectionMembership,
} from '../../src/operations/item-collections';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type StoredCollection = {
  libraryID: number;
  name: string;
  parentID: number | false;
  deleted: boolean;
};

function host() {
  let nextID = 100;
  let storedCollections = new Map<number, StoredCollection>();
  let storedItems = new Map<number, number[]>();
  const collections = new Map<number, NativeCollection>();
  const items = new Map<number, ReturnType<typeof addItem>>();
  const db = createCollectionTransactionDB();
  const libraries = new Map([
    [
      1,
      {
        editable: true,
        archived: false,
        libraryType: 'user',
        updateCollections: vi.fn(async () => {}),
      },
    ],
    [
      2,
      {
        editable: true,
        archived: false,
        libraryType: 'group',
        updateCollections: vi.fn(async () => {}),
      },
    ],
  ]);

  class NativeCollection {
    id = 0;
    libraryID: number;
    name: string;
    parentID: number | false;
    deleted = false;
    readonly _childItems = new Set<number>();
    readonly _childCollections = new Set<number>();
    getChildItems = (asIDs = false) =>
      asIDs ? [...this._childItems] : [...this._childItems].map((id) => items.get(id));
    getChildCollections = (asIDs = false) =>
      asIDs
        ? [...this._childCollections]
        : [...this._childCollections].map((id) => collections.get(id));
    constructor(params: { libraryID: number; name: string; parentID?: number }) {
      this.libraryID = params.libraryID;
      this.name = params.name;
      this.parentID = params.parentID || false;
    }
    getDescendents = () => {
      const result: Array<{ id: number; type: 'collection' }> = [];
      for (const child of collections.values()) {
        let parentID = child.parentID;
        while (parentID) {
          if (parentID === this.id) {
            result.push({ id: child.id, type: 'collection' });
            break;
          }
          parentID = collections.get(parentID)?.parentID || false;
        }
      }
      return result;
    };
    save = vi.fn(
      async (options?: {
        deleteItems?: boolean;
        skipSelect?: boolean;
      }): Promise<number | boolean> => {
        const isNew = !this.id;
        const previousParentID = storedCollections.get(this.id)?.parentID || false;
        if (isNew) {
          this.id = nextID++;
          collections.set(this.id, this);
          db.addCurrentCallback('rollback', () => {
            collections.delete(this.id);
          });
        }
        storedCollections.set(this.id, {
          libraryID: this.libraryID,
          name: this.name,
          parentID: this.parentID,
          deleted: this.deleted,
        });
        if ((this.parentID || false) !== previousParentID) {
          const parentID = this.parentID;
          if (parentID)
            db.addCurrentCallback('commit', () => {
              collections.get(parentID)?._childCollections.add(this.id);
            });
          if (previousParentID)
            db.addCurrentCallback('commit', () => {
              collections.get(previousParentID)?._childCollections.delete(this.id);
            });
        }
        if (this.deleted) {
          for (const { id } of this.getDescendents()) {
            const child = collections.get(id)!;
            child.deleted = true;
            storedCollections.set(id, { ...storedCollections.get(id)!, deleted: true });
          }
          if (options?.deleteItems) throw new Error('Host must not trash items in this workflow');
        }
        return isNew ? this.id : true;
      },
    );
    reload = vi.fn(async () => {
      const stored = storedCollections.get(this.id);
      if (stored) Object.assign(this, stored);
    });
  }

  function addItem(id: number, assigned: number[] = [], libraryID = 1) {
    const memberships = new Set(assigned);
    const item = {
      id,
      libraryID,
      deleted: false,
      isTopLevelItem: () => true,
      isEditable: vi.fn(() => true),
      getCollections: (includeTrashed = false) => {
        if (includeTrashed) return [...memberships];
        return [...memberships].filter((collectionID) => {
          const collection = collections.get(collectionID);
          if (!collection) throw new Error(`Collection ${collectionID} not found`);
          return !collection.deleted;
        });
      },
      addToCollection: vi.fn((collectionID: number) => memberships.add(collectionID)),
      removeFromCollection: vi.fn((collectionID: number) => memberships.delete(collectionID)),
      save: vi.fn(async (): Promise<boolean | void> => {
        const previous = storedItems.get(id) ?? [];
        const removed = previous.filter((collectionID) => !memberships.has(collectionID));
        const added = [...memberships].filter((collectionID) => !previous.includes(collectionID));
        if (removed.length)
          db.addCurrentCallback('commit', () => {
            for (const collectionID of removed)
              collections.get(collectionID)?._childItems.delete(id);
          });
        if (added.length)
          db.addCurrentCallback('commit', () => {
            for (const collectionID of added) collections.get(collectionID)?._childItems.add(id);
          });
        storedItems.set(id, [...memberships]);
      }),
      reload: vi.fn(async () => {
        memberships.clear();
        for (const collectionID of storedItems.get(id) ?? []) memberships.add(collectionID);
      }),
    };
    storedItems.set(id, [...assigned]);
    items.set(id, item);
    for (const collectionID of assigned) collections.get(collectionID)?._childItems.add(id);
    return item;
  }

  function addCollection(
    id: number,
    name = `Collection ${id}`,
    parentID: number | false = false,
    libraryID = 1,
  ) {
    const collection = new NativeCollection({ libraryID, name });
    collection.id = id;
    collection.parentID = parentID;
    collections.set(id, collection);
    storedCollections.set(id, { libraryID, name, parentID, deleted: false });
    if (parentID) collections.get(parentID)?._childCollections.add(id);
    return collection;
  }

  const nativeTransaction = db.executeTransaction.getMockImplementation()!;
  db.executeTransaction.mockImplementation((callback, options) =>
    nativeTransaction(async () => {
      const previousCollections = new Map(
        [...storedCollections].map(([id, value]) => [id, { ...value }]),
      );
      const previousItems = new Map([...storedItems].map(([id, value]) => [id, [...value]]));
      try {
        return await callback();
      } catch (error) {
        storedCollections = previousCollections;
        storedItems = previousItems;
        throw error;
      }
    }, options),
  );
  const transaction = db.executeTransaction;
  vi.stubGlobal('Zotero', {
    Libraries: { get: (id: number) => libraries.get(id) || false },
    Collections: { get: (id: number) => collections.get(id) || false },
    Items: { get: (id: number) => items.get(id) || false },
    Collection: NativeCollection,
    DB: db,
  });
  return {
    addCollection,
    addItem,
    collections,
    items,
    libraries,
    db,
    transaction,
    persistedCollectionIDs: () => [...storedCollections.keys()],
    persistedMemberships: (id: number) => storedItems.get(id),
  };
}

function targets(
  ...items: ReturnType<ReturnType<typeof host>['addItem']>[]
): Parameters<typeof moveCollectionItems>[0] {
  return items as unknown as Parameters<typeof moveCollectionItems>[0];
}

describe('atomic collection item operations', () => {
  it('moves every direct source member once and preserves unrelated memberships', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20);
    h.addCollection(30);
    const a = h.addItem(1, [10, 30]);
    const b = h.addItem(2, [10, 20]);
    await expect(moveCollectionItems(targets(a, b, a), 10, 20)).resolves.toEqual({ done: 2 });
    expect(a.getCollections().sort()).toEqual([20, 30]);
    expect(b.getCollections()).toEqual([20]);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(h.transaction).toHaveBeenCalledTimes(2);
  });

  it('moves direct members and skips recursive-only or outside-library targets', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20);
    h.addCollection(11, 'Child', 10);
    const direct = h.addItem(1, [10]);
    const recursive = h.addItem(2, [11]);
    const otherLibrary = h.addItem(3, [], 2);
    await expect(
      moveCollectionItems(targets(direct, recursive, otherLibrary), 10, 20),
    ).resolves.toEqual({ done: 1, missingData: 1, unavailable: 1 });
    expect(direct.getCollections()).toEqual([20]);
    expect(recursive.getCollections()).toEqual([11]);
    expect(recursive.save).not.toHaveBeenCalled();
    expect(otherLibrary.save).not.toHaveBeenCalled();
    await expect(moveCollectionItems(targets(recursive), 10, 20)).resolves.toEqual({
      done: 0,
      missingData: 1,
    });
  });

  it('rolls back both legs of one failed move and commits the remaining item with correct inverse caches', async () => {
    const h = host();
    const source = h.addCollection(10);
    const target = h.addCollection(20);
    h.addCollection(30);
    const a = h.addItem(1, [10, 30]);
    const b = h.addItem(2, [10]);
    const save = a.save.getMockImplementation()!;
    a.save.mockImplementationOnce(async () => {
      await save();
      throw new Error('disk full');
    });
    await expect(moveCollectionItems(targets(a, b), 10, 20)).resolves.toEqual({
      done: 1,
      failed: 1,
    });
    expect(a.getCollections().sort()).toEqual([10, 30]);
    expect(b.getCollections()).toEqual([20]);
    expect(h.persistedMemberships(1)).toEqual([10, 30]);
    expect(h.persistedMemberships(2)).toEqual([20]);
    expect(a.reload).toHaveBeenCalled();
    expect(source.getChildItems(true)).toEqual([1]);
    expect(target.getChildItems(true)).toEqual([2]);
    await h.db.executeTransaction(async () => undefined);
    expect(source.getChildItems(true)).toEqual([1]);
    expect(target.getChildItems(true)).toEqual([2]);
  });

  it.each(['membership', 'create'] as const)(
    'keeps a later same-item save intact while %s rollback recovery is pending',
    async (mode) => {
      const h = host();
      h.addCollection(10);
      h.addCollection(20);
      h.addCollection(30);
      const first = h.addItem(1, [10]);
      first.save.mockRejectedValueOnce(new Error('first operation failed'));
      const reloadStarted = Promise.withResolvers<void>();
      const releaseReload = Promise.withResolvers<void>();
      const reload = first.reload.getMockImplementation()!;
      first.reload.mockImplementationOnce(async () => {
        reloadStarted.resolve();
        await releaseReload.promise;
        await reload();
      });
      const failed =
        mode === 'create'
          ? createCollectionAndAdd(targets(first), 1, 'Failed child', 10)
          : moveCollectionItems(targets(first), 10, 20);
      await reloadStarted.promise;
      const saveStarted = Promise.withResolvers<void>();
      const releaseSave = Promise.withResolvers<void>();
      const save = first.save.getMockImplementation()!;
      first.save.mockImplementationOnce(async () => {
        saveStarted.resolve();
        await releaseSave.promise;
        await save();
      });
      const later = setCollectionMembership(targets(first), 30, true);
      // The native barrier completes if recovery owns Neo admission; otherwise
      // the second mutation reaches its pre-SQL save gate before that barrier.
      await Promise.race([saveStarted.promise, h.db.executeTransaction(async () => undefined)]);
      releaseReload.resolve();
      expect(await failed).toEqual({ done: 0, failed: 1 });
      releaseSave.resolve();
      const changed = await later;
      expect({ changed, durable: h.persistedMemberships(1) }).toEqual({
        changed: { done: 1 },
        durable: [10, 30],
      });
      expect(first.getCollections()).toEqual([10, 30]);
      expect(h.collections.get(30)!.getChildItems(true)).toEqual([1]);
    },
  );

  it('rolls back a move retired during save and never saves the remaining item', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20);
    const a = h.addItem(1, [10]);
    const b = h.addItem(2, [10]);
    let current = true;
    a.save.mockImplementationOnce(async () => {
      current = false;
    });
    await expect(moveCollectionItems(targets(a, b), 10, 20, () => current)).rejects.toThrow(
      'no longer current',
    );
    expect(a.getCollections()).toEqual([10]);
    expect(b.save).not.toHaveBeenCalled();
  });

  it('does not count a native save that declined to write', async () => {
    const h = host();
    const target = h.addCollection(10);
    const item = h.addItem(1);
    item.save.mockResolvedValueOnce(false);
    await expect(setCollectionMembership(targets(item), 10, true)).resolves.toEqual({
      done: 0,
      failed: 1,
    });
    expect(item.getCollections()).toEqual([]);
    expect(h.persistedMemberships(item.id)).toEqual([]);
    expect(target.getChildItems(true)).toEqual([]);
  });

  it('adds only uncovered targets and removes only the assigned union', async () => {
    const h = host();
    h.addCollection(10);
    const a = h.addItem(1, [10]);
    const b = h.addItem(2);
    await expect(setCollectionMembership(targets(a, b), 10, true)).resolves.toEqual({
      done: 1,
      unchanged: 1,
    });
    expect(a.save).not.toHaveBeenCalled();
    expect(b.getCollections()).toEqual([10]);
    await expect(setCollectionMembership(targets(a, b), 10, false)).resolves.toEqual({ done: 2 });
    await expect(setCollectionMembership(targets(a, b), 10, false)).resolves.toEqual({
      done: 0,
      unchanged: 2,
    });
  });

  it('skips stale and unwritable items, but rejects invalid collection scopes', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20, 'Other', false, 2);
    const a = h.addItem(1, [10]);
    await expect(moveCollectionItems(targets(a), 10, 20)).rejects.toThrow('one library');
    h.libraries.get(1)!.editable = false;
    await expect(setCollectionMembership(targets(a), 10, false)).rejects.toThrow('read-only');
    h.libraries.get(1)!.editable = true;
    const replacement = h.addItem(1, [10]);
    const readOnly = h.addItem(2, [10]);
    readOnly.isEditable.mockReturnValue(false);
    await expect(setCollectionMembership(targets(a, readOnly), 10, false)).resolves.toEqual({
      done: 0,
      unavailable: 2,
    });
    const covered = h.addItem(3, [10]);
    await expect(
      setCollectionMembership(targets(a, readOnly, covered), 10, false),
    ).resolves.toEqual({
      done: 1,
      unavailable: 2,
    });
    expect(a.save).not.toHaveBeenCalled();
    expect(replacement.getCollections()).toEqual([10]);
    expect(readOnly.getCollections()).toEqual([10]);
    expect(covered.getCollections()).toEqual([]);
  });

  it.each(['set', 'move'] as const)(
    'does not write a later %s target whose identity changed during a prior save',
    async (mode) => {
      const h = host();
      h.addCollection(10);
      h.addCollection(20);
      const first = h.addItem(1, mode === 'set' ? [] : [10]);
      const last = h.addItem(2, mode === 'set' ? [] : [10]);
      const saveFirst = first.save.getMockImplementation()!;
      first.save.mockImplementationOnce(async () => {
        await saveFirst();
        h.items.set(last.id, { ...last });
      });
      const operation =
        mode === 'set'
          ? setCollectionMembership(targets(first, last), 20, true)
          : moveCollectionItems(targets(first, last), 10, 20);
      await expect(operation).resolves.toEqual({ done: 1, unavailable: 1 });
      expect(first.getCollections()).toEqual([20]);
      expect(last.getCollections()).toEqual(mode === 'set' ? [] : [10]);
      expect(h.persistedMemberships(last.id)).toEqual(mode === 'set' ? [] : [10]);
    },
  );
});

describe('collection structure operations', () => {
  it('creates and assigns in the same transaction without automatic scope selection', async () => {
    const h = host();
    h.addCollection(10);
    const a = h.addItem(1, [10]);
    const result = await createCollectionAndAdd(targets(a), 1, '  New child  ', 10);
    expect(result).toEqual({ done: 1, collectionID: expect.any(Number) });
    const id = result.collectionID!;
    expect(h.collections.get(id)).toMatchObject({ name: 'New child', parentID: 10 });
    expect(h.collections.get(id)!.save).toHaveBeenCalledWith({ skipSelect: true });
    expect(a.getCollections()).toEqual([10, id]);
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'reject'] as const)(
    'retains durable create-and-add state after a shared commit prefix %s fails',
    async (mode) => {
      const h = host();
      const parent = h.addCollection(10);
      const item = h.addItem(1, [10]);
      const failure = new Error('shared commit prefix failed');
      const report = vi.spyOn(logging, 'reportDiagnosticError').mockImplementation(() => undefined);
      h.db._callbacks.current.commit.push(() => {
        if (mode === 'throw') throw failure;
        return Promise.reject(failure);
      });
      const result = await createCollectionAndAdd(targets(item), 1, 'Committed child', 10);
      expect(result).toEqual({ done: 1, collectionID: expect.any(Number) });
      const createdID = result.collectionID!;
      expect(report).toHaveBeenCalledWith(
        expect.any(logging.ZoteroLogger),
        'Collection SQL committed; native callback failed',
        failure,
      );
      expect(item.reload).not.toHaveBeenCalled();
      expect(h.libraries.get(1)!.updateCollections).not.toHaveBeenCalled();
      expect({
        durableMemberships: h.persistedMemberships(1),
        cachedCollection: h.collections.has(createdID),
        parentChildren: parent.getChildCollections(true),
      }).toEqual({
        durableMemberships: [10, createdID],
        cachedCollection: true,
        parentChildren: [createdID],
      });
      expect(item.getCollections()).toEqual([10, createdID]);
      expect(h.collections.get(createdID)!.getChildItems(true)).toEqual([1]);
      await h.db.executeTransaction(async () => undefined);
      expect(parent.getChildCollections(true)).toEqual([createdID]);
      expect(h.collections.get(createdID)!.getChildItems(true)).toEqual([1]);
    },
  );

  it('reports durable SQL with a cache warning when an owned commit callback fails', async () => {
    const h = host();
    h.addCollection(10);
    const item = h.addItem(1);
    const failure = new Error('owned inverse-cache callback failed');
    const save = item.save.getMockImplementation()!;
    item.save.mockImplementationOnce(async () => {
      h.db.addCurrentCallback('commit', () => {
        throw failure;
      });
      await save();
    });
    const report = vi.spyOn(logging, 'reportDiagnosticError').mockImplementation(() => undefined);
    await expect(setCollectionMembership(targets(item), 10, true)).resolves.toEqual({
      done: 1,
      cacheWarning: true,
    });
    expect(h.persistedMemberships(1)).toEqual([10]);
    expect(item.getCollections()).toEqual([10]);
    expect(item.reload).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.any(logging.ZoteroLogger),
      'Collection SQL committed; native callback failed',
      failure,
    );
    await h.db.executeTransaction(async () => undefined);
    expect(h.collections.get(10)!.getChildItems(true)).toEqual([]);
  });

  it('preserves the foreign error when owned post-commit completion also rejects', async () => {
    const h = host();
    h.addCollection(10);
    const item = h.addItem(1);
    const foreignFailure = new Error('shared commit prefix failed');
    const ownedFailure = new Error('owned commit callback rejected');
    h.db._callbacks.current.commit.push(() => {
      throw foreignFailure;
    });
    const owned = vi.fn(async () => {
      throw ownedFailure;
    });
    const save = item.save.getMockImplementation()!;
    item.save.mockImplementationOnce(async () => {
      h.db.addCurrentCallback('commit', owned);
      await save();
    });
    const report = vi.spyOn(logging, 'reportDiagnosticError').mockImplementation(() => undefined);
    await expect(setCollectionMembership(targets(item), 10, true)).resolves.toEqual({
      done: 1,
      cacheWarning: true,
    });
    expect(h.persistedMemberships(1)).toEqual([10]);
    expect(item.reload).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.any(logging.ZoteroLogger),
      'Collection SQL committed; native callback failed',
      foreignFailure,
    );
    expect(report).toHaveBeenCalledWith(
      expect.any(logging.ZoteroLogger),
      'Collection owned commit callback failed',
      ownedFailure,
    );
    await h.db.executeTransaction(async () => undefined);
    expect(owned).toHaveBeenCalledTimes(1);
    expect(h.collections.get(10)!.getChildItems(true)).toEqual([]);
  });

  it('rolls back a failed creation attempt, then creates one collection for writable assignments', async () => {
    const h = host();
    const parent = h.addCollection(10);
    const first = h.addItem(1, [10]);
    const second = h.addItem(2);
    const otherLibrary = h.addItem(3, [], 2);
    const save = first.save.getMockImplementation()!;
    first.save.mockImplementationOnce(async () => {
      await save();
      throw new Error('assignment failed');
    });
    const result = await createCollectionAndAdd(targets(first, otherLibrary, second), 1, 'New', 10);
    expect(result).toEqual({
      done: 1,
      collectionID: expect.any(Number),
      failed: 1,
      unavailable: 1,
    });
    const id = result.collectionID!;
    expect(h.persistedCollectionIDs()).toEqual([10, id]);
    expect([...h.collections.keys()]).toEqual([10, id]);
    expect(first.getCollections()).toEqual([10]);
    expect(h.persistedMemberships(first.id)).toEqual([10]);
    expect(second.getCollections()).toEqual([id]);
    expect(h.persistedMemberships(second.id)).toEqual([id]);
    expect(otherLibrary.save).not.toHaveBeenCalled();
    await h.db.executeTransaction(async () => undefined);
    expect(parent.getChildCollections(true)).toEqual([id]);
    expect(parent.getChildItems(true)).toEqual([1]);
    expect(h.collections.get(id)!.getChildItems(true)).toEqual([2]);
  });

  it('leaves no orphan if no item can be assigned', async () => {
    const h = host();
    const first = h.addItem(1);
    const readOnly = h.addItem(2);
    readOnly.isEditable.mockReturnValue(false);
    first.save.mockRejectedValueOnce(new Error('assignment failed'));
    await expect(createCollectionAndAdd(targets(first, readOnly), 1, 'New')).resolves.toEqual({
      done: 0,
      unavailable: 1,
      failed: 1,
    });
    expect(first.getCollections()).toEqual([]);
    expect(readOnly.save).not.toHaveBeenCalled();
    expect(h.libraries.get(1)!.updateCollections).toHaveBeenCalledTimes(1);
    expect(h.persistedCollectionIDs()).toEqual([]);
  });

  it('attempts library refresh even when an item cannot be reloaded after rollback', async () => {
    const h = host();
    const first = h.addItem(1);
    first.save.mockRejectedValueOnce(new Error('assignment failed'));
    const recoveryFailure = new Error('item reload failed');
    first.reload.mockRejectedValueOnce(recoveryFailure);
    const report = vi.spyOn(logging, 'reportDiagnosticError').mockImplementation(() => undefined);
    await expect(createCollectionAndAdd(targets(first), 1, 'New')).resolves.toEqual({
      done: 0,
      failed: 1,
    });
    expect(report).toHaveBeenCalledWith(
      expect.any(logging.ZoteroLogger),
      'Collection rollback state restoration failed',
      recoveryFailure,
    );
    expect(h.libraries.get(1)!.updateCollections).toHaveBeenCalledTimes(1);
    expect(h.persistedCollectionIDs()).toEqual([]);
  });

  it.each(['item', 'collection', 'parent'] as const)(
    'rolls back only the in-flight create-and-add assignment when its %s disappears',
    async (target) => {
      const h = host();
      const parent = h.addCollection(10);
      const first = h.addItem(1, [10]);
      const last = h.addItem(2);
      const saveLast = last.save.getMockImplementation()!;
      last.save.mockImplementationOnce(async () => {
        await saveLast();
        if (target === 'item') last.deleted = true;
        else if (target === 'parent') parent.deleted = true;
        else h.collections.get(last.getCollections(true)[0]!)!.deleted = true;
      });
      const result = await createCollectionAndAdd(targets(first, last), 1, 'New', 10);
      expect(result).toEqual({ done: 1, collectionID: expect.any(Number), unavailable: 1 });
      const id = result.collectionID!;
      expect(h.persistedCollectionIDs()).toEqual([10, id]);
      expect(first.getCollections(true)).toEqual([10, id]);
      expect(last.getCollections(true)).toEqual([]);
      expect(h.persistedMemberships(first.id)).toEqual([10, id]);
      expect(h.persistedMemberships(last.id)).toEqual([]);
    },
  );

  it('rejects cancelled creation before allocating or saving a native collection', async () => {
    const h = host();
    await expect(createCollection(1, 'New', false, () => false)).rejects.toThrow(
      'no longer current',
    );
    expect(h.persistedCollectionIDs()).toEqual([]);
    expect(h.collections.size).toBe(0);
  });

  it('refuses self, descendants and cross-library parents then reparents to root', async () => {
    const h = host();
    h.addCollection(10);
    const source = h.addCollection(11, 'Source', 10);
    h.addCollection(12, 'Descendant', 11);
    h.addCollection(20, 'Other library', false, 2);
    for (const parentID of [11, 12, 20])
      await expect(moveCollection(11, parentID)).rejects.toThrow();
    expect(source.parentID).toBe(10);
    expect(source.save).not.toHaveBeenCalled();
    await expect(moveCollection(11, false)).resolves.toBe(true);
    expect(source.parentID).toBe(0);
    expect(h.collections.get(12)!.parentID).toBe(11);
    await expect(moveCollection(11, false)).resolves.toBe(false);
  });

  it('restores collection name and parent after failed native saves', async () => {
    const h = host();
    h.addCollection(10);
    const source = h.addCollection(11, 'Before', 10);
    source.save.mockRejectedValueOnce(new Error('rename failed'));
    await expect(renameCollection(11, 'After')).rejects.toThrow('rename failed');
    expect(source.name).toBe('Before');
    source.save.mockRejectedValueOnce(new Error('move failed'));
    await expect(moveCollection(11, false)).rejects.toThrow('move failed');
    expect(source.parentID).toBe(10);
  });

  it('keeps both parent child-collection caches correct after failed reparent and later commit', async () => {
    const h = host();
    const originalParent = h.addCollection(10);
    const newParent = h.addCollection(20);
    const source = h.addCollection(11, 'Source', 10);
    const save = source.save.getMockImplementation()!;
    let current = true;
    source.save.mockImplementationOnce(async (options) => {
      const result = await save(options);
      current = false;
      return result;
    });
    await expect(moveCollection(11, 20, () => current)).rejects.toThrow('no longer current');
    expect(source.parentID).toBe(10);
    expect(originalParent.getChildCollections(true)).toEqual([11]);
    expect(newParent.getChildCollections(true)).toEqual([]);
    await h.db.executeTransaction(async () => undefined);
    expect(originalParent.getChildCollections(true)).toEqual([11]);
    expect(newParent.getChildCollections(true)).toEqual([]);
  });

  it('trashes the subtree with native keep-items semantics and preserves every item', async () => {
    const h = host();
    const root = h.addCollection(10);
    const child = h.addCollection(11, 'Child', 10);
    h.addCollection(30);
    const a = h.addItem(1, [10]);
    const b = h.addItem(2, [11, 30]);
    await deleteCollection(10);
    expect(root.deleted).toBe(true);
    expect(child.deleted).toBe(true);
    expect(root.save).toHaveBeenCalledWith({ deleteItems: false });
    expect(a.deleted).toBe(false);
    expect(b.deleted).toBe(false);
    expect(a.getCollections(true)).toEqual([10]);
    expect(b.getCollections(true)).toEqual([11, 30]);
    expect(a.save).not.toHaveBeenCalled();
    expect(b.save).not.toHaveBeenCalled();
  });

  it('restores every descendant cache if deletion is retired after native save', async () => {
    const h = host();
    const root = h.addCollection(10);
    const child = h.addCollection(11, 'Child', 10);
    const nativeSave = root.save.getMockImplementation()!;
    let current = true;
    root.save.mockImplementationOnce(async (options) => {
      const result = await nativeSave(options);
      current = false;
      return result;
    });
    await expect(deleteCollection(10, () => current)).rejects.toThrow('no longer current');
    expect(root.deleted).toBe(false);
    expect(child.deleted).toBe(false);
    expect(child.reload).toHaveBeenCalled();
  });
});
