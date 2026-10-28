import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { NOTE_ITEM_TARGET } from '../../src/main/note-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import { SelectionStore } from '../../src/modules/worksets/selection-store';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(
  id: number,
  options: {
    libraryID?: number;
    parentItemID?: number;
    kind?: 'regular' | 'attachment' | 'note';
  } = {},
): Zotero.Item {
  return {
    id,
    libraryID: options.libraryID ?? 1,
    parentItemID: options.parentItemID,
    isAttachment: () => options.kind === 'attachment',
    isNote: () => options.kind === 'note',
  } as unknown as Zotero.Item;
}

function install(items: readonly Zotero.Item[]): void {
  const byID = new Map(items.map((value) => [value.id, value]));
  vi.stubGlobal('Zotero', {
    Items: {
      get: (id: number) => byID.get(id) ?? false,
      keepTopLevel: (values: Zotero.Item[]) =>
        values.map((value) =>
          value.parentItemID ? (byID.get(value.parentItemID) ?? value) : value,
        ),
    },
  });
}

function session() {
  return { selection: new SelectionStore() };
}

describe('Surface-owned item target resolution', () => {
  it('uses Main EffectiveSelection and normalizes/deduplicates top-level targets', () => {
    const parent = item(1);
    const child = item(2, { parentItemID: 1, kind: 'attachment' });
    const other = item(3);
    install([parent, child, other]);

    const s = session();
    s.selection.add({ libraryID: 1, itemID: child.id });
    s.selection.add({ libraryID: 1, itemID: parent.id });
    s.selection.add({ libraryID: 1, itemID: other.id });
    const window = {
      ZoteroPane: { itemsView: { rowCount: 0, selection: { focused: 0 } } },
    } as unknown as MainWindow;

    expect(MAIN_ITEM_TARGET.resolve(window, s.selection)).toMatchObject({
      source: 'main',
      items: [{ id: 1 }, { id: 3 }],
      total: 3,
      missing: 0,
    });
  });

  it('Reader resolves only its active item and never borrows Main Selection', () => {
    const main = item(1);
    const parent = item(2);
    const attachment = item(3, { parentItemID: 2, kind: 'attachment' });
    install([main, parent, attachment]);

    const s = session();
    s.selection.add({ libraryID: 1, itemID: main.id });
    const window = {} as MainWindow;

    expect(READER_ITEM_TARGET.resolve({ itemID: attachment.id })).toMatchObject({
      source: 'reader',
      items: [{ id: parent.id }],
      total: 1,
      missing: 0,
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
    expect(MAIN_ITEM_TARGET.resolve(window, s.selection)).toMatchObject({
      source: 'main',
      items: [{ id: main.id }],
      total: 1,
    });
  });

  it('Note resolves the focused context note before a note tab item', () => {
    const parent = item(1);
    const focused = item(2, { parentItemID: 1, kind: 'note' });
    const tabNote = item(3, { kind: 'note' });
    install([parent, focused, tabNote]);
    const s = session();
    s.selection.add({ libraryID: 1, itemID: tabNote.id });

    const active = {} as Element;
    const window = {
      document: { activeElement: active },
      ZoteroContextPane: {
        context: {
          activeEditor: {
            item: focused,
            contains: (node: Node | null) => node === (active as unknown as Node),
          },
        },
      },
      Zotero_Tabs: {
        selectedID: 'note-tab',
        getTabInfo: () => ({ type: 'note', data: { itemID: tabNote.id } }),
      },
    } as unknown as MainWindow;

    expect(NOTE_ITEM_TARGET.resolve(window)).toMatchObject({
      source: 'note',
      items: [{ id: parent.id }],
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: tabNote.id }]);
    expect(MAIN_ITEM_TARGET.resolve(window, s.selection)).toMatchObject({
      source: 'main',
      items: [{ id: tabNote.id }],
      total: 1,
    });
  });

  it('reports a missing contextual Reader item without falling back to Main', () => {
    const main = item(1);
    install([main]);
    const s = session();
    s.selection.add({ libraryID: 1, itemID: main.id });

    expect(READER_ITEM_TARGET.resolve({ itemID: 99 })).toMatchObject({
      source: 'reader',
      items: [],
      total: 1,
      missing: 1,
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });
  it('reports a missing Note item without borrowing the live Main workset', () => {
    const main = item(1);
    install([main]);
    const s = session();
    s.selection.add({ libraryID: 1, itemID: main.id });
    const window = {
      Zotero_Tabs: {
        selectedID: 'note-tab',
        getTabInfo: () => ({ type: 'note', data: { itemID: 99 } }),
      },
    } as unknown as MainWindow;

    expect(NOTE_ITEM_TARGET.resolve(window)).toMatchObject({
      source: 'note',
      items: [],
      total: 1,
      missing: 1,
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });
});
