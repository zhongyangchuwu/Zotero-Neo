import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { createNotesProvider } from '../../src/main/picker/providers/notes';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

interface NoteOptions {
  readonly parentItemID?: number | null;
  readonly body?: string;
  readonly deleted?: boolean;
  readonly note?: boolean;
}

function note(
  id: number,
  title: string,
  libraryID = 7,
  dateModified = '2026-09-20T00:00:00Z',
  options: NoteOptions = {},
): Zotero.Item {
  return {
    id,
    libraryID,
    parentItemID: options.parentItemID ?? null,
    deleted: options.deleted ?? false,
    dateModified,
    isAttachment: () => false,
    isNote: () => options.note ?? true,
    getDisplayTitle: () => title,
    getNoteTitle: () => title,
    getNote: vi.fn(() => options.body ?? `<p>${title} body</p>`),
  } as unknown as Zotero.Item;
}

function parentItem(id: number, title: string, libraryID = 7, noteIDs: number[] = []): Zotero.Item {
  return {
    id,
    libraryID,
    isAttachment: () => false,
    isNote: () => false,
    getNotes: () => noteIDs,
    getDisplayTitle: () => title,
  } as unknown as Zotero.Item;
}

function windowForPicker(extra: Record<string, unknown> = {}): MainWindow {
  return {
    ...extra,
    document: {
      createElementNS: () => {
        let html = '';
        return {
          get textContent() {
            return html.replace(/<[^>]*>/g, '');
          },
          set innerHTML(value: string) {
            html = value;
          },
        };
      },
    },
  } as unknown as MainWindow;
}

interface ZoteroOptions {
  readonly searchIDs?: number[];
  readonly allItems?: Zotero.Item[];
  readonly searchError?: Error;
  readonly readerItemID?: number;
}

function installZotero(byID: Map<number, Zotero.Item>, options: ZoteroOptions = {}) {
  const conditions: unknown[][] = [];
  const search = vi.fn();
  const getAll = vi.fn(async (..._args: unknown[]) => options.allItems ?? []);
  class Search {
    constructor() {
      search();
    }
    addCondition(...args: unknown[]) {
      conditions.push(args);
    }
    async search() {
      if (options.searchError) throw options.searchError;
      return options.searchIDs ?? [];
    }
  }

  vi.stubGlobal('Zotero', {
    Schema: { schemaUpdatePromise: Promise.resolve() },
    Search,
    Items: {
      get: (value: number | number[]) =>
        Array.isArray(value)
          ? value.map((id) => byID.get(id)).filter((item): item is Zotero.Item => !!item)
          : (byID.get(value) ?? false),
      getAll,
    },
    Reader: {
      getByTabID: () =>
        options.readerItemID === undefined ? null : { itemID: options.readerItemID },
    },
    Libraries: { userLibraryID: 1 },
  });

  return { conditions, getAll, search };
}

const logger = { debug: vi.fn() } as never;

describe('notes provider item and library sources', () => {
  it('uses the active Reader item by default without searching or parsing other notes', async () => {
    const readerBase = parentItem(5, 'Reader paper', 7, [11]);
    const selectedBase = parentItem(4, 'Main paper', 7, [12]);
    const readerAttachment = {
      id: 6,
      libraryID: 7,
      parentItemID: 5,
      isAttachment: () => true,
      isNote: () => false,
    } as unknown as Zotero.Item;
    const current = note(11, 'Current note', 7, '2026-09-01T00:00:00Z', {
      parentItemID: 5,
      body: '<p>Reader note body</p>',
    });
    const unrelated = note(12, 'Unrelated note', 7, '2026-09-21T00:00:00Z', {
      parentItemID: 4,
      body: '<p>Unrelated body</p>',
    });
    const fixture = installZotero(
      new Map([
        [4, selectedBase],
        [5, readerBase],
        [6, readerAttachment],
        [11, current],
        [12, unrelated],
      ]),
      { readerItemID: 6, searchIDs: [11, 12], allItems: [current, unrelated] },
    );
    const window = windowForPicker({
      Zotero_Tabs: { selectedID: 'reader' },
      ZoteroPane: { getSelectedItems: () => [selectedBase] },
    });

    const provider = createNotesProvider(window, logger);
    const items = await provider.load();

    expect(items.map((item) => item.id)).toEqual([11]);
    expect(current.getNote).toHaveBeenCalledOnce();
    expect(unrelated.getNote).not.toHaveBeenCalled();
    expect(fixture.search).not.toHaveBeenCalled();
    expect(fixture.getAll).not.toHaveBeenCalled();
    expect(items[0]).toMatchObject({
      title: 'Current note',
      group: 'library:7:item:5',
    });
    expect(provider.rowText(items[0]!, 0)).toBe('Current note');
    expect(provider.preview(items[0]!).body).toContain('Parent: Reader paper\n\nReader note body');
  });

  it('uses a note parent when available and only the note for standalone context', async () => {
    const base = parentItem(5, 'Paper', 7, [11, 12]);
    const child = note(11, 'Child note', 7, undefined, { parentItemID: 5 });
    const sibling = note(12, 'Sibling note', 7, undefined, { parentItemID: 5 });
    const standalone = note(13, 'Standalone note');
    const fixture = installZotero(
      new Map([
        [5, base],
        [11, child],
        [12, sibling],
        [13, standalone],
      ]),
      { searchIDs: [11, 12, 13], allItems: [child, sibling, standalone] },
    );
    const childProvider = createNotesProvider(windowForPicker(), logger, { baseItem: child });
    const standaloneProvider = createNotesProvider(windowForPicker(), logger, {
      baseItem: standalone,
    });

    expect((await childProvider.load()).map((item) => item.id)).toEqual([11, 12]);
    const standaloneItems = await standaloneProvider.load();
    expect(standaloneItems.map((item) => item.id)).toEqual([13]);
    expect(standaloneItems[0]?.group).toBe('library:7:note:13');
    expect(fixture.search).not.toHaveBeenCalled();
    expect(fixture.getAll).not.toHaveBeenCalled();
  });

  it('returns empty for missing context or zero children without a library fallback', async () => {
    const globalNote = note(20, 'Library note');
    const fixture = installZotero(new Map([[20, globalNote]]), {
      searchIDs: [20],
      allItems: [globalNote],
    });
    const missingProvider = createNotesProvider(
      windowForPicker({ ZoteroPane: { getSelectedItems: () => [] } }),
      logger,
    );
    const emptyItem = parentItem(5, 'Empty paper');
    const emptyProvider = createNotesProvider(windowForPicker(), logger, {
      baseItem: emptyItem,
    });

    expect(await missingProvider.load()).toEqual([]);
    expect(missingProvider.emptyText?.('')).toMatch(/current item/i);
    expect(missingProvider.emptyText?.('paper')).toMatch(/current.item/i);
    expect(await emptyProvider.load()).toEqual([]);
    expect(emptyProvider.emptyText?.('')).toMatch(/current item/i);
    expect(fixture.search).not.toHaveBeenCalled();
    expect(fixture.getAll).not.toHaveBeenCalled();
    expect(globalNote.getNote).not.toHaveBeenCalled();
  });

  it('offers explicit library browsing and returns to the same frozen current source', async () => {
    const currentBase = parentItem(5, 'Current paper', 7, [11]);
    const laterBase = parentItem(6, 'Later paper', 7, [13]);
    const current = note(11, 'Current note', 7, undefined, { parentItemID: 5 });
    const libraryNote = note(12, 'Library note', 7, undefined, { parentItemID: 9 });
    const laterNote = note(13, 'Later current note', 7, undefined, { parentItemID: 6 });
    let readerItemID = 5;
    const fixture = installZotero(
      new Map([
        [5, currentBase],
        [6, laterBase],
        [9, parentItem(9, 'Other paper')],
        [11, current],
        [12, libraryNote],
        [13, laterNote],
      ]),
      { searchIDs: [12, 11], allItems: [current, libraryNote, laterNote] },
    );
    Reflect.set(Reflect.get(globalThis, 'Zotero'), 'Reader', {
      getByTabID: () => ({ itemID: readerItemID }),
    });
    const window = windowForPicker({ Zotero_Tabs: { selectedID: 'reader' } });
    const provider = createNotesProvider(window, logger);

    expect(provider.alternateSource?.label).toBe('Browse library');
    readerItemID = 6;
    const libraryProvider = provider.alternateSource!.provider();
    const libraryItems = await libraryProvider.load();

    expect(libraryProvider.alternateSource?.label).toBe('Current item');
    expect(fixture.conditions).toContainEqual(['libraryID', 'is', 7]);
    expect(fixture.conditions).toContainEqual(['itemType', 'is', 'note']);
    expect(libraryItems.map((item) => item.id)).toEqual([11, 12]);
    expect(await libraryProvider.alternateSource!.provider().load()).toEqual(await provider.load());
    expect((await provider.load()).map((item) => item.id)).toEqual([11]);
    expect(libraryProvider.emptyText?.('')).toMatch(/library/i);
    expect(libraryProvider.emptyText?.('paper')).toMatch(/search/i);
  });

  it('previews each same-title note with its actual parent and groups by owner', async () => {
    const currentBase = parentItem(5, 'Reader paper', 7, [11]);
    const otherBase = parentItem(9, 'Different paper');
    const current = note(11, 'Meeting notes', 7, '2026-09-20T00:00:00Z', {
      parentItemID: 5,
      body: '<p>Notes from Reader paper</p>',
    });
    const other = note(12, 'Meeting notes', 7, '2026-09-22T00:00:00Z', {
      parentItemID: 9,
      body: '<p>Notes from different paper</p>',
    });
    const otherOlder = note(13, 'Meeting notes', 7, '2026-09-21T00:00:00Z', {
      parentItemID: 9,
      body: '<p>Older notes from different paper</p>',
    });
    const fixture = installZotero(
      new Map([
        [5, currentBase],
        [9, otherBase],
        [11, current],
        [12, other],
        [13, otherOlder],
      ]),
      { searchIDs: [12, 11, 13] },
    );
    const provider = createNotesProvider(windowForPicker(), logger, {
      baseItem: currentBase,
      scope: 'library',
    });
    const items = await provider.load();

    expect(items.map((item) => item.id)).toEqual([11, 12, 13]);
    expect(items.map((item) => item.title)).toEqual([
      'Meeting notes',
      'Meeting notes',
      'Meeting notes',
    ]);
    expect(items.map((item) => item.group)).toEqual([
      'library:7:item:5',
      'library:7:item:9',
      'library:7:item:9',
    ]);
    expect(provider.preview(items[0]!).body).toContain(
      'Parent: Reader paper\n\nNotes from Reader paper',
    );
    expect(provider.preview(items[1]!).body).toContain(
      'Parent: Different paper\n\nNotes from different paper',
    );
    expect(provider.preview(items[2]!).body).toContain(
      'Parent: Different paper\n\nOlder notes from different paper',
    );
    expect(fixture.search).toHaveBeenCalledOnce();
  });

  it('labels standalone and unresolved-source notes honestly with distinct owner groups', async () => {
    const standaloneA = note(21, 'Standalone A');
    const unresolved = note(22, 'Unresolved', 7, undefined, { parentItemID: 99 });
    const standaloneB = note(23, 'Standalone B');
    installZotero(
      new Map([
        [21, standaloneA],
        [22, unresolved],
        [23, standaloneB],
      ]),
      { searchIDs: [21, 22, 23] },
    );
    const provider = createNotesProvider(windowForPicker(), logger, {
      scope: 'library',
      libraryID: 7,
    });
    const items = await provider.load();

    expect(items.map((item) => item.group)).toEqual([
      'library:7:note:21',
      'library:7:item:99',
      'library:7:note:23',
    ]);
    expect(provider.preview(items[0]!).body).toContain('Standalone note');
    expect(provider.preview(items[1]!).body).toContain('Source unavailable');
    expect(new Set(items.map((item) => item.group)).size).toBe(3);
  });

  it('excludes deleted, non-note, and wrong-library results without hiding citation-text notes', async () => {
    const humanNote = note(31, 'Zotero citation guide', 7, undefined, {
      body: '<p>A human note about citation keys.</p><p>Keep paragraph boundaries.</p>',
    });
    const deleted = note(32, 'Deleted note', 7, undefined, { deleted: true });
    const wrongLibrary = note(33, 'Other library note', 8);
    const nonNote = note(34, 'Not a note', 7, undefined, { note: false });
    installZotero(
      new Map([
        [31, humanNote],
        [32, deleted],
        [33, wrongLibrary],
        [34, nonNote],
      ]),
      { searchIDs: [31, 32, 33, 34] },
    );
    const provider = createNotesProvider(windowForPicker(), logger, {
      scope: 'library',
      libraryID: 7,
    });
    const items = await provider.load();

    expect(items.map((item) => item.id)).toEqual([31]);
    expect(items[0]?.title).toBe('Zotero citation guide');
    expect(items[0]?.preview).toBe('A human note about citation keys.\nKeep paragraph boundaries.');
    expect(deleted.getNote).not.toHaveBeenCalled();
    expect(wrongLibrary.getNote).not.toHaveBeenCalled();
    expect(nonNote.getNote).not.toHaveBeenCalled();
  });

  it('uses the same library constraints when native Search falls back to getAll', async () => {
    const local = note(41, 'Local note', 7);
    const foreign = note(42, 'Foreign note', 8);
    const fixture = installZotero(
      new Map([
        [41, local],
        [42, foreign],
      ]),
      {
        searchError: new Error('Search unavailable'),
        allItems: [local, foreign],
      },
    );
    const provider = createNotesProvider(windowForPicker(), logger, {
      libraryID: 7,
      scope: 'library',
    });

    expect((await provider.load()).map((item) => item.id)).toEqual([41]);
    expect(fixture.getAll).toHaveBeenCalledWith(7, false, false);
    expect(foreign.getNote).not.toHaveBeenCalled();
  });
});
