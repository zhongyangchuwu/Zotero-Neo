import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  CollectionMembershipActions,
  resolveCollectionMembershipTargets,
  setCollectionMembership,
} from '../../src/main/collection-actions';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';
import type { FuzzyPicker } from '../../src/main/picker';
import type { MainNavigation } from '../../src/main/navigation';

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
    DB: { executeTransaction: async (fn: () => Promise<void>) => fn() },
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
  const session = { selection } as unknown as MainWindowSession;
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

    const resolved = resolveCollectionMembershipTargets(h.window, h.session);

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

    expect(() => resolveCollectionMembershipTargets(h.window, h.session)).toThrow(
      'Collection membership requires one library',
    );

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 99 });
    expect(() => resolveCollectionMembershipTargets(h.window, h.session)).toThrow(
      'Selection contains unavailable items',
    );
  });

  it('delegates child normalization to Zotero keepTopLevel', () => {
    const child = item(2, 1);
    const parent = item(1, 1);
    const h = targetHarness([child, parent], [2]);
    h.selection.add({ libraryID: 1, itemID: 2 });
    const keepTopLevel = vi.fn(() => [parent]);
    (Zotero.Items as unknown as { keepTopLevel: typeof keepTopLevel }).keepTopLevel = keepTopLevel;

    const resolved = resolveCollectionMembershipTargets(h.window, h.session);

    expect(keepTopLevel).toHaveBeenCalledWith([child]);
    expect(resolved.items).toEqual([parent]);
  });
});

describe('collection membership mutation', () => {
  it('adds/removes only changed items inside one transaction', async () => {
    const first = item(1, 1, [10]);
    const second = item(2, 1);
    const transaction = vi.fn(async (fn: () => Promise<void>) => fn());
    vi.stubGlobal('Zotero', {
      DB: { executeTransaction: transaction },
    });

    await expect(setCollectionMembership([first, second], 10, true)).resolves.toBe(1);
    expect(first.save).not.toHaveBeenCalled();
    expect(second.addToCollection).toHaveBeenCalledWith(10);
    expect(second.save).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);

    vi.mocked(first.save).mockClear();
    vi.mocked(second.save).mockClear();
    transaction.mockClear();

    await expect(setCollectionMembership([first, second], 10, false)).resolves.toBe(2);
    expect(first.removeFromCollection).toHaveBeenCalledWith(10);
    expect(second.removeFromCollection).toHaveBeenCalledWith(10);
    expect(first.save).toHaveBeenCalledTimes(1);
    expect(second.save).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('CollectionMembershipActions', () => {
  it('revalidates target signature before confirming a collection', async () => {
    const first = item(1, 1);
    const second = item(2, 1);
    const h = targetHarness([first, second]);
    h.selection.add({ libraryID: 1, itemID: 1 });

    const status = vi.fn();
    let confirm: ((candidate: { id: number }) => Promise<void>) | undefined;
    const picker = {
      open: vi.fn(async (_window, _session, scope, options) => {
        expect(scope).toBe('collections');
        confirm = options.confirm;
      }),
    } as unknown as FuzzyPicker;
    const navigation = { status } as unknown as MainNavigation;
    const actions = new CollectionMembershipActions(
      { debug: vi.fn() } as never,
      navigation,
      picker,
    );

    actions.open(h.window, h.session, true);
    await Promise.resolve();

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 2 });
    expect(confirm).toBeDefined();
    await confirm!({ id: 10 });

    expect(status).toHaveBeenLastCalledWith(h.session, '✗ Collection target changed; retry');
    expect(first.addToCollection).not.toHaveBeenCalled();
    expect(second.addToCollection).not.toHaveBeenCalled();
  });
});
