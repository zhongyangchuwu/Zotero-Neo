import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

import type { MainWindow } from '../../src/core/contracts';
import {
  CollectionMembershipActions,
  resolveCollectionMembershipTargets,
} from '../../src/modules/collections/actions';
import type { CollectionConfirmation } from '../../src/modules/collections/actions';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import { setCollectionMembership } from '../../src/operations/item-collections';
import { SelectionStore } from '../../src/modules/worksets/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import { PickerRuntime } from '../../src/main/picker/runtime';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(id: number, libraryID = 1, collections: number[] = []): Zotero.Item {
  const current = new Set(collections);
  return {
    id,
    libraryID,
    isTopLevelItem: () => true,
    getCollections: () => [...current],
    addToCollection: vi.fn((collectionID: number) => {
      current.add(collectionID);
      return true;
    }),
    removeFromCollection: vi.fn((collectionID: number) => {
      current.delete(collectionID);
      return true;
    }),
    save: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
  } as unknown as Zotero.Item;
}

function targetHarness(
  items: readonly Zotero.Item[],
  visibleIDs: readonly number[] = items.map((x) => x.id),
) {
  const byID = new Map(items.map((value) => [value.id, value]));
  vi.stubGlobal('Zotero', {
    Items: {
      get: (id: number) => byID.get(id) ?? false,
      keepTopLevel: (values: Zotero.Item[]) => values,
    },
    Collections: { get: (id: number) => ({ id, libraryID: 1, name: 'Inbox', parentID: false }) },
    Libraries: { get: () => ({ editable: true, archived: false, libraryType: 'user' }) },
    DB: createCollectionTransactionDB(),
  });

  const rows = visibleIDs
    .map((id) => byID.get(id))
    .filter((value): value is Zotero.Item => !!value)
    .map((ref) => ({ isObjectRow: true, ref }));
  const window = {
    document: {
      activeElement: null,
      getElementById: () => null,
      querySelector: () => null,
    },
    ZoteroPane: {
      itemsView: {
        rowCount: rows.length,
        selection: { focused: 0 },
        getRow: (index: number) => rows[index],
        getRowIndexByID: (id: number) => {
          const index = rows.findIndex((row) => row.ref.id === id);
          return index < 0 ? false : index;
        },
      },
    },
  } as unknown as MainWindow;

  const selection = new SelectionStore();
  const session = {
    selection,
    picker: new PickerRuntime(),
    cleanup: { disposed: false },
  } as unknown as MainWindowSession;
  return { window, session, selection };
}

describe('collection membership targets', () => {
  it('uses explicit Selection instead of Cursor and requires one library', () => {
    const a = item(1, 1);
    const c = item(3, 1);
    const f = item(6, 1);
    const h = targetHarness([f, a, c], [6, 1, 3]);
    h.selection.add({ libraryID: 1, itemID: 1 });
    h.selection.add({ libraryID: 1, itemID: 3 });

    const resolved = resolveCollectionMembershipTargets(
      MAIN_ITEM_TARGET.resolve(h.window, h.selection),
    );

    expect(resolved.items.map((value) => value.id)).toEqual([1, 3]);
    expect(resolved.libraryID).toBe(1);
    expect(resolved.signature).toBe('1:1|1:3');
  });

  it('refuses unavailable or cross-library targets before mutation', () => {
    const a = item(1, 1);
    const b = item(2, 2);
    const h = targetHarness([a, b]);
    h.selection.add({ libraryID: 1, itemID: 1 });
    h.selection.add({ libraryID: 2, itemID: 2 });

    expect(() =>
      resolveCollectionMembershipTargets(MAIN_ITEM_TARGET.resolve(h.window, h.selection)),
    ).toThrow('Collection membership requires one library');

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 99 });
    expect(() =>
      resolveCollectionMembershipTargets(MAIN_ITEM_TARGET.resolve(h.window, h.selection)),
    ).toThrow('Selection contains unavailable items');
  });

  it('Reader uses only the active Reader item and ignores Main Selection', () => {
    const main = item(1, 7);
    const reader = item(2, 7);
    const h = targetHarness([main, reader], [main.id]);
    h.selection.add({ libraryID: 7, itemID: main.id });

    const resolved = resolveCollectionMembershipTargets(
      READER_ITEM_TARGET.resolve({ itemID: reader.id }),
    );

    expect(resolved.items.map((value) => value.id)).toEqual([reader.id]);
    expect(resolved.libraryID).toBe(7);
    expect(resolved.signature).toBe('7:2');
  });
});

describe('collection membership mutation', () => {
  it('changes only the requested membership and does not save existing members again', async () => {
    const first = item(1, 1, [10, 11]);
    const second = item(2, 1, [12]);
    const database = createCollectionTransactionDB();
    const collection = { id: 10, libraryID: 1, name: 'Inbox', parentID: false };
    vi.stubGlobal('Zotero', {
      DB: database,
      Items: { get: (id: number) => [first, second].find((value) => value.id === id) },
      Collections: { get: (id: number) => (id === collection.id ? collection : false) },
      Libraries: { get: () => ({ editable: true, archived: false, libraryType: 'user' }) },
    });

    await expect(setCollectionMembership([first, second], 10, true)).resolves.toBe(1);
    expect(first.save).not.toHaveBeenCalled();
    expect(first.getCollections()).toEqual([10, 11]);
    expect(second.getCollections()).toEqual([12, 10]);
    expect(second.save).toHaveBeenCalledTimes(1);

    vi.mocked(first.save).mockClear();
    vi.mocked(second.save).mockClear();

    await expect(setCollectionMembership([first, second], 10, false)).resolves.toBe(2);
    expect(first.getCollections()).toEqual([11]);
    expect(second.getCollections()).toEqual([12]);
    expect(first.save).toHaveBeenCalledTimes(1);
    expect(second.save).toHaveBeenCalledTimes(1);
  });

  it('restores every in-memory membership when one item fails to save', async () => {
    const first = item(1);
    const failed = item(2);
    vi.mocked(failed.save).mockRejectedValueOnce(new Error('save failed'));
    const collection = { id: 10, libraryID: 1, name: 'Inbox', parentID: false };
    vi.stubGlobal('Zotero', {
      DB: createCollectionTransactionDB(),
      Items: { get: (id: number) => [first, failed].find((value) => value.id === id) },
      Collections: { get: (id: number) => (id === collection.id ? collection : false) },
      Libraries: { get: () => ({ editable: true, archived: false, libraryType: 'user' }) },
    });

    await expect(setCollectionMembership([first, failed], 10, true)).rejects.toThrow('save failed');

    expect(first.getCollections()).toEqual([]);
    expect(failed.getCollections()).toEqual([]);
  });
});

describe('CollectionMembershipActions', () => {
  it('revalidates target signature before confirming a collection', async () => {
    const first = item(1, 1);
    const second = item(2, 1);
    const h = targetHarness([first, second]);
    h.selection.add({ libraryID: 1, itemID: 1 });

    const status = vi.fn();
    let confirm: CollectionConfirmation | undefined;
    const actions = new CollectionMembershipActions({
      window: h.window,
      logger: { debug: vi.fn() } as never,
      isCurrent: () => true,
      status,
      navigate: vi.fn(async () => undefined),
      choose: (_source, callback) => {
        confirm = callback;
      },
      captureCurrent: () => () => true,
    });
    const request = {
      source: 'main' as const,
      label: 'Selection' as const,
      resolveTargets: () => MAIN_ITEM_TARGET.resolve(h.window, h.selection),
    };
    actions.open(request, true);
    await Promise.resolve();

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 2 });
    expect(confirm).toBeDefined();
    await expect(
      confirm!({ id: 10, title: 'Inbox', search: 'Inbox' }, () => true, ''),
    ).rejects.toThrow('Collection target changed; retry');
    expect(first.addToCollection).not.toHaveBeenCalled();
    expect(second.addToCollection).not.toHaveBeenCalled();

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 1 });
    actions.open(request, true);
    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 99 });
    await expect(
      confirm!({ id: 10, title: 'Inbox', search: 'Inbox' }, () => true, ''),
    ).rejects.toThrow('Selection contains unavailable items');
    expect(first.addToCollection).not.toHaveBeenCalled();
  });
});
