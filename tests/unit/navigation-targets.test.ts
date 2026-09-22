import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainNavigation } from '../../src/main/navigation';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

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
    isAttachment: () => true,
    isNote: () => false,
    getField: (field: string) => (field === 'citationKey' ? citekey : ''),
  } as unknown as Zotero.Item;
}

function harness(visible: readonly Zotero.Item[], focused = 0) {
  const active = { id: 'item-tree-row-0' } as unknown as Element;
  const rows = visible.map((ref) => ({ isObjectRow: true, ref }));
  const root = { contains: (node: unknown) => node === active };
  const viewAttachment = vi.fn();
  const trashTx = vi.fn(async () => undefined);
  const byID = new Map(visible.map((item) => [item.id, item]));
  const copied: string[] = [];

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
      getSelectedItems: () => (visible[0] ? [visible[0]] : []),
      viewAttachment,
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  } as unknown as MainWindow;
  const session = {
    window,
    selection: new SelectionStore(),
    status: { textContent: '', style: {} },
    cleanup: { add: vi.fn() },
    trashedItemIDs: [],
  } as unknown as MainWindowSession;
  const navigation = new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => undefined);

  return {
    window,
    session,
    navigation,
    viewAttachment,
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

    await h.navigation.openPDF(h.window, h.session, cursor);

    expect(h.viewAttachment).toHaveBeenCalledWith(cursor.id);
    expect(h.viewAttachment).not.toHaveBeenCalledWith(nativeSelected.id);
  });

  it('blocks trash when explicit Selection contains hidden targets', async () => {
    const visible = attachment(10);
    const cursor = attachment(11);
    const hidden = attachment(12);
    const h = harness([visible, cursor], 1);
    h.install(hidden);
    h.session.selection.add({ libraryID: 1, itemID: visible.id });
    h.session.selection.add({ libraryID: 1, itemID: hidden.id });

    await h.navigation.trashSelectedItems(h.window, h.session);

    expect(h.trashTx).not.toHaveBeenCalled();
    expect(h.session.status.textContent).toContain('1 hidden item');
    expect(h.session.selection.size).toBe(2);
  });

  it('trashes EffectiveSelection and removes successfully trashed refs from the workset', async () => {
    const first = attachment(10);
    const second = attachment(11);
    const h = harness([first, second], 1);
    h.session.selection.add({ libraryID: 1, itemID: first.id });
    h.session.selection.add({ libraryID: 1, itemID: second.id });

    await h.navigation.trashSelectedItems(h.window, h.session);

    expect(h.trashTx).toHaveBeenCalledWith([first.id, second.id]);
    expect(h.session.trashedItemIDs).toEqual([first.id, second.id]);
    expect(h.session.selection.empty).toBe(true);
  });

  it('copies citekeys from EffectiveSelection and preserves Cursor fallback behavior', () => {
    const first = attachment(10, 'first');
    const cursor = attachment(11, 'cursor');
    const h = harness([first, cursor], 1);
    h.session.selection.add({ libraryID: 1, itemID: first.id });
    h.session.selection.add({ libraryID: 1, itemID: cursor.id });

    h.navigation.yankCitekey(h.window, h.session);

    expect(h.copied).toEqual(['first cursor']);
    expect(h.session.status.textContent).toContain('Copied 2 citekeys');
    expect(h.session.selection.size).toBe(2);

    h.session.selection.clear();
    h.navigation.yankCitekey(h.window, h.session);

    expect(h.copied).toEqual(['first cursor', 'cursor']);
    expect(h.session.status.textContent).toBe('✓ @cursor');
  });

  it('refuses the entire citekey batch when a target is stale or missing a citekey', () => {
    const first = attachment(10, 'first');
    const missingKey = attachment(11, '');
    const h = harness([first, missingKey], 0);
    h.session.selection.add({ libraryID: 1, itemID: first.id });
    h.session.selection.add({ libraryID: 1, itemID: missingKey.id });

    h.navigation.yankCitekey(h.window, h.session);

    expect(h.copied).toEqual([]);
    expect(h.session.status.textContent).toContain('1 target without citekey');

    h.session.selection.clear();
    h.session.selection.add({ libraryID: 1, itemID: 999 });
    h.navigation.yankCitekey(h.window, h.session);

    expect(h.copied).toEqual([]);
    expect(h.session.status.textContent).toContain('unavailable items');
  });

  it('uses Zotero keepTopLevel normalization and deduplicates normalized citekey targets', () => {
    const childA = attachment(10, '');
    const childB = attachment(11, '');
    const parent = attachment(20, 'parent');
    const h = harness([childA, childB], 0);
    h.install(parent);
    h.session.selection.add({ libraryID: 1, itemID: childA.id });
    h.session.selection.add({ libraryID: 1, itemID: childB.id });
    const keepTopLevel = vi.fn(() => [parent, parent]);
    (Zotero.Items as unknown as { keepTopLevel: typeof keepTopLevel }).keepTopLevel = keepTopLevel;

    h.navigation.yankCitekey(h.window, h.session);

    expect(keepTopLevel).toHaveBeenCalledWith([childA, childB]);
    expect(h.copied).toEqual(['parent']);
  });
});
