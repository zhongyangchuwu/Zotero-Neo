import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

import type { MainWindow } from '../../src/core/contracts';
import {
  CollectionMembershipActions,
  type CollectionConfirmation,
} from '../../src/modules/collections/actions';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
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
    isEditable: () => true,
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
  const collection = { id: 10, libraryID: 1, name: 'Inbox', parentID: false };
  vi.stubGlobal('Zotero', {
    Items: {
      get: (id: number) => byID.get(id) ?? false,
      keepTopLevel: (values: Zotero.Item[]) => values,
    },
    Collections: { get: (id: number) => (id === 10 ? collection : false) },
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
  return { window, session, selection, byID };
}

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

    await expect(setCollectionMembership([first, second], 10, true)).resolves.toEqual({
      done: 1,
      unchanged: 1,
    });
    expect(first.save).not.toHaveBeenCalled();
    expect(first.getCollections()).toEqual([10, 11]);
    expect(second.getCollections()).toEqual([12, 10]);
    expect(second.save).toHaveBeenCalledTimes(1);

    vi.mocked(first.save).mockClear();
    vi.mocked(second.save).mockClear();

    await expect(setCollectionMembership([first, second], 10, false)).resolves.toEqual({ done: 2 });
    expect(first.getCollections()).toEqual([11]);
    expect(second.getCollections()).toEqual([12]);
    expect(first.save).toHaveBeenCalledTimes(1);
    expect(second.save).toHaveBeenCalledTimes(1);
  });

  it('restores a failed item without undoing another successful membership', async () => {
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

    await expect(setCollectionMembership([first, failed], 10, true)).resolves.toEqual({
      done: 1,
      failed: 1,
    });

    expect(first.getCollections()).toEqual([10]);
    expect(failed.getCollections()).toEqual([]);
  });
});

describe('CollectionMembershipActions', () => {
  it('rejects a different selection but saves the still-live subset when an original disappears', async () => {
    const first = item(1, 1);
    const second = item(2, 1);
    const h = targetHarness([first, second]);
    h.selection.add({ libraryID: 1, itemID: 1 });

    const status = vi.fn();
    let confirm: CollectionConfirmation | undefined;
    const actions = new CollectionMembershipActions({
      window: h.window,
      logger: { debug: vi.fn() } as never,
      language: () => 'en',
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
    ).resolves.toEqual({
      keepOpen: true,
      message: 'The selection changed. Select the items again.',
    });
    expect(first.addToCollection).not.toHaveBeenCalled();
    expect(second.addToCollection).not.toHaveBeenCalled();

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 1 });
    h.selection.add({ libraryID: 1, itemID: 2 });
    actions.open(request, true);
    h.byID.delete(first.id);
    await expect(
      confirm!({ id: 10, title: 'Inbox', search: 'Inbox' }, () => true, ''),
    ).resolves.toBeUndefined();
    expect(first.addToCollection).not.toHaveBeenCalled();
    expect(second.getCollections()).toEqual([10]);
    expect(status).toHaveBeenLastCalledWith(
      '→ Items added to collection: 1 · Skipped 1 (1 unavailable or read-only)',
    );
  });
});
