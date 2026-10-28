import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { LibraryNavigation } from '../../src/modules/library/navigation';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { NOTE_ITEM_TARGET } from '../../src/main/note-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import { copyCitekeys } from '../../src/operations/citekeys';
import { SelectionStore } from '../../src/modules/worksets/selection-store';

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function attachment(id: number, citekey = ''): Zotero.Item {
  return {
    id,
    libraryID: 1,
    deleted: false,
    saveTx: vi.fn(async () => {}),
    isAttachment: () => true,
    isNote: () => false,
    getField: (field: string) => (field === 'citationKey' ? citekey : ''),
  } as unknown as Zotero.Item;
}

function harness(
  visible: readonly Zotero.Item[],
  focused = 0,
  nativeSelected: readonly number[] = [focused],
) {
  const active = { id: 'item-tree-row-0' } as unknown as Element;
  const rows = visible.map((ref) => ({ isObjectRow: true, ref }));
  const root = { contains: (node: unknown) => node === active };
  const viewAttachment = vi.fn();
  const trashTx = vi.fn(async (): Promise<void> => {});
  const byID = new Map(visible.map((item) => [item.id, item]));
  const copied: string[] = [];
  const confirm = vi.fn(() => true);

  vi.stubGlobal('Zotero', {
    Items: {
      get: (id: number) => byID.get(id) ?? false,
      trashTx,
      keepTopLevel: (items: Zotero.Item[]) => items,
    },
  });
  vi.stubGlobal('Components', {
    classes: {
      '@mozilla.org/widget/clipboardhelper;1': {
        getService: () => ({ copyString: (value: string) => copied.push(value) }),
      },
    },
    interfaces: { nsIClipboardHelper: {} },
  });

  const document = {
    activeElement: active,
    getElementById: () => null,
    querySelector: () => null,
  } as unknown as Document;
  const window = {
    confirm,
    document,
    ZoteroPane: {
      itemsView: {
        rowCount: rows.length,
        selection: { focused },
        tree: root,
        domEl: root,
        getRow: (index: number) => rows[index],
        getRowIndexByID: (id: number) => {
          const index = rows.findIndex((row) => row.ref.id === id);
          return index < 0 ? false : index;
        },
        clearSelection: vi.fn(),
      },
      getSelectedItems: () =>
        nativeSelected.flatMap((index) => (visible[index] ? [visible[index]!] : [])),
      viewAttachment,
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  } as unknown as MainWindow;
  const selection = new SelectionStore();
  const status = vi.fn();
  let current = true;
  const navigation = new LibraryNavigation({
    window,
    logger: { debug: vi.fn(), diagnostic: vi.fn() },
    status,
    panel: () => 'items',
    focusPanel: () => true,
    isCurrent: () => current,
  });

  return {
    window,
    status,
    retire: () => {
      current = false;
    },
    selection,
    navigation,
    viewAttachment,
    confirm,
    trashTx,
    copied,
    install: (...items: Zotero.Item[]) => {
      for (const item of items) byID.set(item.id, item);
    },
  };
}

describe('Main action target contracts', () => {
  it('opens the Cursor item even when native selection points elsewhere', async () => {
    const nativeSelected = attachment(10);
    const cursor = attachment(11);
    const h = harness([nativeSelected, cursor], 1);

    await h.navigation.openPDF(cursor, () => true);

    expect(h.viewAttachment).toHaveBeenCalledWith(cursor.id);
    expect(h.viewAttachment).not.toHaveBeenCalledWith(nativeSelected.id);
  });

  it('rejects unavailable reading targets and native viewer failures', async () => {
    const target = attachment(10);
    const h = harness([target], 0);

    await expect(h.navigation.openPDF(target, () => true)).resolves.toBe(true);
    expect(h.viewAttachment).toHaveBeenCalledWith(target.id);

    h.viewAttachment.mockReset();
    h.viewAttachment.mockImplementation(() => {
      throw new Error('viewer failed');
    });
    await expect(h.navigation.openPDF(target, () => true)).resolves.toBe(false);

    const noTarget = {
      id: 20,
      libraryID: 1,
      isAttachment: () => false,
      isNote: () => false,
      getBestAttachment: async () => false,
      getAttachments: () => [],
      getField: () => '',
    } as unknown as Zotero.Item;
    await expect(h.navigation.openPDF(noTarget, () => true)).resolves.toBe(false);
  });

  it('trashes native multi-selection when persistent Selection is empty', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const third = attachment(12);
    const h = harness([first, second, third], 1, [0, 1, 2]);

    await h.navigation.trashSelectedItems(h.selection);

    expect(h.trashTx).toHaveBeenCalledWith([first.id, second.id, third.id]);
    expect(h.confirm).toHaveBeenCalledOnce();
    for (const item of [first, second, third]) item.deleted = true;
    await h.navigation.restoreLastTrashedItems();
    expect([first.deleted, second.deleted, third.deleted]).toEqual([false, false, false]);
  });

  it('cancels a Trash confirmation without changing the resolved Selection', async () => {
    const first = attachment(10);
    const cursor = attachment(11);
    const h = harness([first, cursor], 1);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.confirm.mockReturnValue(false);

    await expect(h.navigation.trashSelectedItems(h.selection)).resolves.toBe(false);

    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.trashTx).not.toHaveBeenCalled();
    await h.navigation.restoreLastTrashedItems();
    expect(h.status).toHaveBeenLastCalledWith('✗ Nothing to restore', undefined);
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: first.id }]);
  });

  it('preserves Neo Selection and Trash history if Zotero rejects the confirmed operation', async () => {
    const first = attachment(10);
    const cursor = attachment(11);
    const h = harness([first, cursor], 1);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.trashTx.mockRejectedValueOnce(new Error('blocked'));

    await expect(h.navigation.trashSelectedItems(h.selection)).resolves.toBe(false);

    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: first.id }]);
    await h.navigation.restoreLastTrashedItems();
    expect(h.status).toHaveBeenLastCalledWith('✗ Nothing to restore', undefined);
  });

  it('uses an explicit Visual target when Selection is empty and keeps Selection authoritative when present', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const third = attachment(12);
    const h = harness([first, second, third], 0);
    const visual = {
      source: 'visual' as const,
      refs: [
        { libraryID: 1, itemID: second.id },
        { libraryID: 1, itemID: third.id },
      ],
    };

    await h.navigation.trashSelectedItems(h.selection, visual);
    expect(h.trashTx).toHaveBeenLastCalledWith([second.id, third.id]);

    h.selection.add({ libraryID: 1, itemID: first.id });
    await h.navigation.trashSelectedItems(h.selection, visual);
    expect(h.trashTx).toHaveBeenLastCalledWith([first.id]);
    expect(h.confirm).toHaveBeenCalledTimes(2);
  });

  it('blocks trash when explicit Selection contains hidden targets', async () => {
    const visible = attachment(10);
    const cursor = attachment(11);
    const hidden = attachment(12);
    const h = harness([visible, cursor], 1);
    h.install(hidden);
    h.selection.add({ libraryID: 1, itemID: visible.id });
    h.selection.add({ libraryID: 1, itemID: hidden.id });

    await h.navigation.trashSelectedItems(h.selection);

    expect(h.trashTx).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.selection.size).toBe(2);
  });

  it('trashes EffectiveSelection and removes successfully trashed refs from the workset', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const h = harness([first, second], 1);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.selection.add({ libraryID: 1, itemID: second.id });

    await h.navigation.trashSelectedItems(h.selection);

    expect(h.trashTx).toHaveBeenCalledWith([first.id, second.id]);
    first.deleted = second.deleted = true;
    await h.navigation.restoreLastTrashedItems();
    expect([first.deleted, second.deleted]).toEqual([false, false]);
    expect(h.selection.empty).toBe(true);
  });

  it('removes only captured selection members after an asynchronous trash', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const h = harness([first, second]);
    const firstRef = { libraryID: 1, itemID: first.id };
    const secondRef = { libraryID: 1, itemID: second.id };
    h.selection.add(firstRef);
    const { promise, resolve } = Promise.withResolvers<void>();
    h.trashTx.mockImplementationOnce(() => promise);
    const pending = h.navigation.trashSelectedItems(h.selection);
    h.selection.add(secondRef);
    resolve();
    await expect(pending).resolves.toBe(true);
    expect(h.selection.values()).toEqual([secondRef]);
    first.deleted = second.deleted = true;
    await h.navigation.restoreLastTrashedItems();
    expect([first.deleted, second.deleted]).toEqual([false, true]);
  });

  it('returns the admitted trash result without changing retired Selection or UI', async () => {
    const first = attachment(10);
    const h = harness([first]);
    const ref = { libraryID: 1, itemID: first.id };
    h.selection.add(ref);
    const { promise, resolve } = Promise.withResolvers<void>();
    h.trashTx.mockImplementationOnce(() => promise);
    const pending = h.navigation.trashSelectedItems(h.selection);
    h.retire();
    resolve();
    await expect(pending).resolves.toBe(true);
    expect(h.selection.values()).toEqual([ref]);
    expect(h.status).not.toHaveBeenCalled();
    await h.navigation.restoreLastTrashedItems();
    expect(first.saveTx).not.toHaveBeenCalled();
  });

  it('refuses trash when Selection contains an unavailable item', async () => {
    const first = attachment(10);
    const h = harness([first]);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.selection.add({ libraryID: 1, itemID: 999 });
    await expect(h.navigation.trashSelectedItems(h.selection)).resolves.toBe(false);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.trashTx).not.toHaveBeenCalled();
    expect(h.selection.size).toBe(2);
  });

  it('preserves a newer trash batch when an earlier restore completes', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const h = harness([first, second]);
    h.selection.add({ libraryID: 1, itemID: first.id });
    await h.navigation.trashSelectedItems(h.selection);
    first.deleted = true;
    const { promise, resolve } = Promise.withResolvers<void>();
    Reflect.set(
      first,
      'saveTx',
      vi.fn(() => promise),
    );
    const restoring = h.navigation.restoreLastTrashedItems();
    h.selection.add({ libraryID: 1, itemID: second.id });
    await h.navigation.trashSelectedItems(h.selection);
    second.deleted = true;
    resolve();
    await restoring;
    await h.navigation.restoreLastTrashedItems();
    expect(second.deleted).toBe(false);
    expect(second.saveTx).toHaveBeenCalledOnce();
  });

  it('stops navigation when panel resolution retires its owner', () => {
    let current = true;
    const getItemsView = vi.fn(() => undefined);
    const window = {
      ZoteroPane: {
        get itemsView() {
          return getItemsView();
        },
      },
    } as unknown as MainWindow;
    const navigation = new LibraryNavigation({
      window,
      logger: { debug: vi.fn(), diagnostic: vi.fn() },
      status: vi.fn(),
      panel: () => {
        current = false;
        return 'items';
      },
      focusPanel: () => true,
      isCurrent: () => current,
    });
    expect(navigation.navigate(1, 1)).toBe(false);
    expect(getItemsView).not.toHaveBeenCalled();
  });

  it('does not toggle a tree after focus retires its owner', async () => {
    const h = harness([attachment(10)]);
    let current = true;
    const status = vi.fn();
    const focusPanel = vi.fn(() => {
      current = false;
      return true;
    });
    const getCollectionView = vi.fn(() => undefined);
    Object.defineProperty(Reflect.get(h.window, 'ZoteroPane'), 'collectionsView', {
      get: getCollectionView,
    });
    const navigation = new LibraryNavigation({
      window: h.window,
      logger: { debug: vi.fn(), diagnostic: vi.fn() },
      status,
      panel: () => 'items',
      focusPanel,
      isCurrent: () => current,
    });
    await navigation.toggleTree();
    expect(focusPanel).toHaveBeenCalledWith('collections');
    expect(getCollectionView).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('copies citekeys from EffectiveSelection and preserves Cursor fallback behavior', () => {
    const first = attachment(10, 'first');
    const cursor = attachment(11, 'cursor');
    const h = harness([first, cursor], 1);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.selection.add({ libraryID: 1, itemID: cursor.id });

    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(h.copied).toEqual(['first cursor']);
    expect(h.selection.size).toBe(2);

    h.selection.clear();
    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(h.copied).toEqual(['first cursor', 'cursor']);
  });

  it('uses Visual when the workset is empty but keeps persistent Selection authoritative', () => {
    const selected = attachment(10, 'selected');
    const visual = attachment(11, 'visual');
    const h = harness([selected, visual], 0);
    const current = { source: 'visual' as const, refs: [{ libraryID: 1, itemID: visual.id }] };

    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection, current));
    h.selection.add({ libraryID: 1, itemID: selected.id });
    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection, current));
    expect(h.copied).toEqual(['visual', 'selected']);
  });

  it('Reader citekey copy uses only the active Reader item and ignores Main Selection', () => {
    const main = attachment(10, 'main');
    const reader = attachment(11, 'reader');
    const h = harness([main], 0);
    h.install(reader);
    h.selection.add({ libraryID: 1, itemID: main.id });

    copyCitekeys(READER_ITEM_TARGET.resolve({ itemID: reader.id }));

    expect(h.copied).toEqual(['reader']);
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });

  it('copies the Note parent after its picker takes focus without borrowing Main Selection', () => {
    const main = attachment(10, 'main');
    const paper = attachment(11, 'paper');
    const note = attachment(12);
    Reflect.set(note, 'isAttachment', () => false);
    Reflect.set(note, 'isNote', () => true);
    Reflect.set(note, 'parentItemID', paper.id);
    const h = harness([main]);
    h.install(paper, note);
    h.selection.add({ libraryID: 1, itemID: main.id });
    const active = h.window.document.activeElement;
    Reflect.set(h.window, 'ZoteroContextPane', {
      context: { activeEditor: { item: note, contains: (node: unknown) => node === active } },
    });

    const targets = NOTE_ITEM_TARGET.resolve(h.window);
    Reflect.set(h.window.document, 'activeElement', null);
    copyCitekeys(targets);
    expect(h.copied).toEqual(['paper']);
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });

  it('refuses the entire citekey batch when a target is stale or missing a citekey', () => {
    const first = attachment(10, 'first');
    const missingKey = attachment(11, '');
    const h = harness([first, missingKey], 0);
    h.selection.add({ libraryID: 1, itemID: first.id });
    h.selection.add({ libraryID: 1, itemID: missingKey.id });

    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(h.copied).toEqual([]);

    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: 999 });
    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(h.copied).toEqual([]);
  });

  it('uses Zotero keepTopLevel normalization and deduplicates normalized citekey targets', () => {
    const childA = attachment(10, '');
    const childB = attachment(11, '');
    const parent = attachment(20, 'parent');
    const h = harness([childA, childB], 0);
    h.install(parent);
    h.selection.add({ libraryID: 1, itemID: childA.id });
    h.selection.add({ libraryID: 1, itemID: childB.id });
    const keepTopLevel = vi.fn(() => [parent, parent]);
    (Zotero.Items as unknown as { keepTopLevel: typeof keepTopLevel }).keepTopLevel = keepTopLevel;

    copyCitekeys(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(h.copied).toEqual(['parent']);
  });
});
