import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import type { ItemTargetSet } from '../../src/core/item-target';
import { resolveItemTargets } from '../../src/main/item-targets';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { NOTE_ITEM_TARGET } from '../../src/main/note-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

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

function install(items: readonly Zotero.Item[], readerItemID?: number): void {
  const byID = new Map(items.map((value) => [value.id, value]));
  vi.stubGlobal('Zotero', {
    Items: {
      get: (id: number) => byID.get(id) ?? false,
      keepTopLevel: (values: Zotero.Item[]) =>
        values.map((value) =>
          value.parentItemID ? (byID.get(value.parentItemID) ?? value) : value,
        ),
    },
    Reader: {
      getByTabID: () => (readerItemID ? { itemID: readerItemID } : null),
    },
  });
}

function session(): MainWindowSession {
  return { selection: new SelectionStore() } as unknown as MainWindowSession;
}

describe('shared item target resolution', () => {
  it('exposes exact typed item Target resolvers for Main, Reader, and Note', () => {
    const main = item(1);
    const reader = item(2);
    const note = item(3, { kind: 'note' });
    install([main, reader, note], reader.id);
    const s = session();
    s.selection.add({ libraryID: 1, itemID: main.id });
    const mainWindow = {
      ZoteroPane: { itemsView: { rowCount: 0, selection: { focused: 0 } } },
    } as unknown as MainWindow;
    const readerWindow = {
      Zotero_Tabs: { selectedID: 'reader-tab' },
    } as unknown as MainWindow;
    const noteWindow = {
      Zotero_Tabs: {
        selectedID: 'note-tab',
        getTabInfo: () => ({ type: 'note', data: { itemID: note.id } }),
      },
    } as unknown as MainWindow;

    const mainTarget: ItemTargetSet<'main'> = MAIN_ITEM_TARGET.resolve(mainWindow, s);
    const readerTarget: ItemTargetSet<'reader'> = READER_ITEM_TARGET.resolve({ itemID: reader.id });
    const noteTarget: ItemTargetSet<'note'> = NOTE_ITEM_TARGET.resolve(noteWindow);

    expect(MAIN_ITEM_TARGET.source).toBe('main');
    expect(READER_ITEM_TARGET.source).toBe('reader');
    expect(NOTE_ITEM_TARGET.source).toBe('note');
    expect(mainTarget.items.map((value) => value.id)).toEqual([main.id]);
    expect(readerTarget.items.map((value) => value.id)).toEqual([reader.id]);
    expect(noteTarget.items.map((value) => value.id)).toEqual([note.id]);
  });

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

    expect(resolveItemTargets(window, s, 'main')).toMatchObject({
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
    install([main, parent, attachment], attachment.id);

    const s = session();
    s.selection.add({ libraryID: 1, itemID: main.id });
    const window = {
      Zotero_Tabs: { selectedID: 'reader-tab' },
    } as unknown as MainWindow;

    expect(resolveItemTargets(window, s, 'reader')).toMatchObject({
      source: 'reader',
      items: [{ id: parent.id }],
      total: 1,
      missing: 0,
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
    expect(resolveItemTargets(window, s, 'main')).toMatchObject({
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

    expect(resolveItemTargets(window, s, 'note')).toMatchObject({
      source: 'note',
      items: [{ id: parent.id }],
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: tabNote.id }]);
    expect(resolveItemTargets(window, s, 'main')).toMatchObject({
      source: 'main',
      items: [{ id: tabNote.id }],
      total: 1,
    });
  });

  it('reports a missing contextual Reader item without falling back to Main', () => {
    install([], 99);
    const s = session();
    s.selection.add({ libraryID: 1, itemID: 1 });
    const window = { Zotero_Tabs: { selectedID: 'reader-tab' } } as unknown as MainWindow;

    expect(resolveItemTargets(window, s, 'reader')).toMatchObject({
      source: 'reader',
      items: [],
      total: 1,
      missing: 1,
    });
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

    expect(resolveItemTargets(window, s, 'note')).toMatchObject({
      source: 'note',
      items: [],
      total: 1,
      missing: 1,
    });
    expect(s.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });
});
