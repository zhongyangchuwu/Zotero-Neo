import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => vi.unstubAllGlobals());

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
    addItems = vi.fn(async (ids: number[]) => {
      for (const id of ids) {
        const item = items.get(id)!;
        item.addToCollection(this.id);
        await item.save();
      }
    });
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
      save: vi.fn(async () => {
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
    await expect(moveCollectionItems(targets(a, b, a), 10, 20)).resolves.toBe(2);
    expect(a.getCollections().sort()).toEqual([20, 30]);
    expect(b.getCollections()).toEqual([20]);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses recursive-only or mixed source members without partial mutation', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20);
    h.addCollection(11, 'Child', 10);
    const direct = h.addItem(1, [10]);
    const recursive = h.addItem(2, [11]);
    await expect(moveCollectionItems(targets(direct, recursive), 10, 20)).rejects.toThrow(
      'direct member',
    );
    expect(direct.getCollections()).toEqual([10]);
    expect(recursive.getCollections()).toEqual([11]);
    expect(direct.save).not.toHaveBeenCalled();
  });

  it('restores memberships and keeps inverse caches correct after rollback then an unrelated commit', async () => {
    const h = host();
    const source = h.addCollection(10);
    const target = h.addCollection(20);
    h.addCollection(30);
    const a = h.addItem(1, [10, 30]);
    const b = h.addItem(2, [10]);
    b.save.mockRejectedValueOnce(new Error('disk full'));
    await expect(moveCollectionItems(targets(a, b), 10, 20)).rejects.toThrow('disk full');
    expect(a.getCollections().sort()).toEqual([10, 30]);
    expect(b.getCollections()).toEqual([10]);
    expect(h.persistedMemberships(1)).toEqual([10, 30]);
    expect(a.reload).toHaveBeenCalled();
    expect(source.getChildItems(true)).toEqual([1, 2]);
    expect(target.getChildItems(true)).toEqual([]);
    await h.db.executeTransaction(async () => undefined);
    expect(source.getChildItems(true)).toEqual([1, 2]);
    expect(target.getChildItems(true)).toEqual([]);
  });

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

  it('adds only uncovered targets and removes only the assigned union', async () => {
    const h = host();
    h.addCollection(10);
    const a = h.addItem(1, [10]);
    const b = h.addItem(2);
    await expect(setCollectionMembership(targets(a, b), 10, true)).resolves.toBe(1);
    expect(a.save).not.toHaveBeenCalled();
    expect(b.getCollections()).toEqual([10]);
    await expect(setCollectionMembership(targets(a, b), 10, false)).resolves.toBe(2);
    await expect(setCollectionMembership(targets(a, b), 10, false)).resolves.toBe(0);
  });

  it('rejects stale item objects, readonly targets and cross-library movement', async () => {
    const h = host();
    h.addCollection(10);
    h.addCollection(20, 'Other', false, 2);
    const a = h.addItem(1, [10]);
    await expect(moveCollectionItems(targets(a), 10, 20)).rejects.toThrow('one library');
    h.libraries.get(1)!.editable = false;
    await expect(setCollectionMembership(targets(a), 10, false)).rejects.toThrow('read-only');
    h.libraries.get(1)!.editable = true;
    h.addItem(1, [10]);
    await expect(setCollectionMembership(targets(a), 10, false)).rejects.toThrow('unavailable');
    expect(a.save).not.toHaveBeenCalled();
  });

  it.each(['set', 'move'] as const)(
    'rolls back %s when the final save replaces an earlier target',
    async (mode) => {
      const h = host();
      h.addCollection(10);
      h.addCollection(20);
      // In set mode the first item is already covered and is never saved.
      const first = h.addItem(1, mode === 'set' ? [20] : [10]);
      const last = h.addItem(2, mode === 'set' ? [] : [10]);
      const saveLast = last.save.getMockImplementation()!;
      last.save.mockImplementationOnce(async () => {
        await saveLast();
        h.items.set(first.id, { ...first });
      });
      const operation =
        mode === 'set'
          ? setCollectionMembership(targets(first, last), 20, true)
          : moveCollectionItems(targets(first, last), 10, 20);
      await expect(operation).rejects.toThrow('Item target changed');
      expect(first.getCollections()).toEqual(mode === 'set' ? [20] : [10]);
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
    const id = await createCollectionAndAdd(targets(a), 1, '  New child  ', 10);
    expect(h.collections.get(id)).toMatchObject({ name: 'New child', parentID: 10 });
    expect(h.collections.get(id)!.save).toHaveBeenCalledWith({ skipSelect: true });
    expect(a.getCollections()).toEqual([10, id]);
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('reloads dangling memberships after native rollback unloads the newly created collection', async () => {
    const h = host();
    h.addCollection(10);
    const a = h.addItem(1, [10]);
    const b = h.addItem(2);
    const failure = new Error('assignment failed');
    b.save.mockRejectedValueOnce(failure);
    await expect(createCollectionAndAdd(targets(a, b), 1, 'New', 10)).rejects.toBe(failure);
    expect(h.persistedCollectionIDs()).toEqual([10]);
    expect([...h.collections.keys()]).toEqual([10]);
    expect(a.getCollections()).toEqual([10]);
    expect(b.getCollections()).toEqual([]);
    expect(h.persistedMemberships(1)).toEqual([10]);
    await h.db.executeTransaction(async () => undefined);
    expect(h.collections.get(10)!.getChildCollections(true)).toEqual([]);
    expect(h.collections.get(10)!.getChildItems(true)).toEqual([1]);
  });

  it('attempts every rollback reload and library refresh while preserving all recovery failures', async () => {
    const h = host();
    const first = h.addItem(1);
    const last = h.addItem(2);
    const failure = new Error('assignment failed');
    const recoveryFailure = new Error('item reload failed');
    last.save.mockRejectedValueOnce(failure);
    first.reload.mockRejectedValueOnce(recoveryFailure);
    let rejected: unknown;
    try {
      await createCollectionAndAdd(targets(first, last), 1, 'New');
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(AggregateError);
    expect((rejected as AggregateError).cause).toBe(failure);
    expect((rejected as AggregateError).errors).toEqual([failure, recoveryFailure]);
    expect(last.reload).toHaveBeenCalledTimes(1);
    expect(h.libraries.get(1)!.updateCollections).toHaveBeenCalledTimes(1);
    expect(h.persistedCollectionIDs()).toEqual([]);
  });

  it.each(['item', 'collection', 'parent'] as const)(
    'rolls back create-and-add when the final save deletes its %s',
    async (target) => {
      const h = host();
      const parent = h.addCollection(10);
      const first = h.addItem(1, [10]);
      const last = h.addItem(2);
      const saveLast = last.save.getMockImplementation()!;
      last.save.mockImplementationOnce(async () => {
        await saveLast();
        if (target === 'item') first.deleted = true;
        else if (target === 'parent') parent.deleted = true;
        else h.collections.get(last.getCollections(true)[0]!)!.deleted = true;
      });
      await expect(createCollectionAndAdd(targets(first, last), 1, 'New', 10)).rejects.toThrow(
        target === 'item' ? 'Item target changed' : 'Collection target is unavailable',
      );
      expect(h.persistedCollectionIDs()).toEqual([10]);
      expect(first.getCollections(true)).toEqual([10]);
      expect(last.getCollections(true)).toEqual([]);
      expect(h.persistedMemberships(first.id)).toEqual([10]);
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
