import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceReader } from '../../src/core/preferences';
import { MainNavigation } from '../../src/main/navigation';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { NOTE_ITEM_TARGET } from '../../src/main/note-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import type { FuzzyPicker } from '../../src/main/picker';
import type { PickerItem } from '../../src/main/picker/model';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import type { MainWindowSession } from '../../src/main/session';
import { TagActions } from '../../src/main/tag-actions';
import { MainViewActions } from '../../src/main/view-actions';
import { SelectionStore } from '../../src/main/selection-store';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function tagItem(id: number, initial: Array<{ tag: string; type: number }> = []): Zotero.Item {
  const tags = new Map(initial.map((record) => [record.tag, record.type]));
  return {
    id,
    libraryID: 1,
    isAttachment: () => false,
    isNote: () => false,
    hasTag: (tag: string) => tags.has(tag),
    getTagType: (tag: string) => tags.get(tag) ?? 0,
    getTags: () => [...tags].map(([tag, type]) => ({ tag, type })),
    addTag: (tag: string, type = 0) => {
      if (tags.has(tag)) return false;
      tags.set(tag, type);
      return true;
    },
    removeTag: (tag: string) => tags.delete(tag),
    save: vi.fn(async () => undefined),
  } as unknown as Zotero.Item;
}

function harness(options: {
  items?: Zotero.Item[];
  activeFilters?: string[];
  scopedTags?: _ZoteroTypes.Tags.TagJson[];
}) {
  const items = options.items ?? [];
  const activeFilters = new Set(options.activeFilters ?? []);
  const scopedTags = options.scopedTags ?? [];
  const setFilter = vi.fn(async (_type: 'tags', tags: ReadonlySet<string>) => {
    activeFilters.clear();
    for (const tag of tags) activeFilters.add(tag);
  });
  const tagSelector = { selectedTags: new Set<string>() };
  const row = {
    ref: { libraryID: 1 },
    tags: activeFilters,
    getTags: vi.fn(async () => scopedTags),
  };
  const window = {
    document: { activeElement: null, getElementById: () => null },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    Zotero_Tabs: {
      selectedID: 'library',
      getTabInfo: () => ({ type: 'library' }),
    },
    ZoteroPane: {
      getSelectedItems: () => items,
      getCollectionTreeRow: () => row,
      itemsView: {
        rowCount: items.length,
        selection: { focused: 0 },
        getRow: (index: number) =>
          items[index] ? { isObjectRow: true, ref: items[index] } : undefined,
        getRowIndexByID: (id: number) => {
          const index = items.findIndex((item) => item.id === id);
          return index < 0 ? false : index;
        },
        setFilter,
      },
      tagSelector,
    },
  } as unknown as MainWindow;
  const selection = new SelectionStore();
  for (const item of items) selection.add({ libraryID: item.libraryID, itemID: item.id });
  const session = {
    window,
    selection,
    status: { textContent: '', style: {} },
    cleanup: { add: vi.fn() },
  } as unknown as MainWindowSession;
  let lastOpen:
    | {
        scope: string;
        options: PickerOpenOptions;
      }
    | undefined;
  const picker = {
    open: vi.fn(
      async (
        _window: MainWindow,
        _session: MainWindowSession,
        scope: string,
        pickerOptions: PickerOpenOptions,
      ) => {
        lastOpen = { scope, options: pickerOptions };
      },
    ),
  } as unknown as FuzzyPicker;
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const navigation = new MainNavigation(logger, () => undefined);
  const preferences: PreferenceReader = {
    get: (_key: string, fallback: boolean | number | string) => fallback,
  } as PreferenceReader;
  const viewActions = new MainViewActions(logger, navigation);
  const actions = new TagActions(logger, navigation, preferences, picker, viewActions);

  return {
    actions,
    window,
    session,
    setFilter,
    tagSelector,
    activeFilters,
    open: () => {
      if (!lastOpen) throw new Error('Tag action did not open a chooser');
      return lastOpen;
    },
  };
}

function installZotero(
  items: readonly Zotero.Item[],
  libraryTags: _ZoteroTypes.Tags.TagJson[] = [],
) {
  const byID = new Map(items.map((item) => [item.id, item]));
  const executeTransaction = vi.fn(async (callback: () => Promise<void>) => callback());
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => byID.get(id) ?? false },
    Reader: { getByTabID: () => null },
    Libraries: { userLibraryID: 1 },
    Tags: { getAll: vi.fn(async () => libraryTags) },
    DB: { executeTransaction },
  });
  return { executeTransaction };
}

describe('semantic Tag actions', () => {
  it('keeps add/remove explicit across a multi-item target set', async () => {
    const first = tagItem(1, [{ tag: 'alpha', type: 0 }]);
    const second = tagItem(2);
    installZotero([first, second], [{ tag: 'alpha' }, { tag: 'robotics' }]);
    const h = harness({ items: [first, second] });

    h.actions.add(h.window, h.session, MAIN_ITEM_TARGET.resolve(h.window, h.session));
    const add = h.open();
    expect(add.scope).toBe('tags');
    expect((await add.options.source!.load()).map((item) => item.tagName)).toEqual([
      'alpha',
      'robotics',
    ]);
    await add.options.confirm?.(
      {
        id: 'tag:robotics',
        title: 'robotics',
        search: 'robotics',
        tagName: 'robotics',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );
    expect(first.hasTag('robotics')).toBe(true);
    expect(second.hasTag('robotics')).toBe(true);

    h.actions.remove(h.window, h.session, MAIN_ITEM_TARGET.resolve(h.window, h.session));
    const remove = h.open();
    expect((await remove.options.source!.load()).map((item) => item.tagName).sort()).toEqual([
      'alpha',
      'robotics',
    ]);
    await remove.options.confirm?.(
      {
        id: 'tag:robotics',
        title: 'robotics',
        search: 'robotics',
        tagName: 'robotics',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );
    expect(first.hasTag('robotics')).toBe(false);
    expect(second.hasTag('robotics')).toBe(false);
  });

  it('uses Neo EffectiveSelection instead of native Main tree selection', async () => {
    const nativeOnly = tagItem(1);
    const selected = tagItem(2);
    installZotero([nativeOnly, selected], [{ tag: 'robotics' }]);
    const h = harness({ items: [nativeOnly, selected] });
    h.session.selection.clear();
    h.session.selection.add({ libraryID: selected.libraryID, itemID: selected.id });

    h.actions.add(h.window, h.session, MAIN_ITEM_TARGET.resolve(h.window, h.session));
    const add = h.open();
    await add.options.confirm?.(
      {
        id: 'tag:robotics',
        title: 'robotics',
        search: 'robotics',
        tagName: 'robotics',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );

    expect(nativeOnly.hasTag('robotics')).toBe(false);
    expect(selected.hasTag('robotics')).toBe(true);
  });

  it('Reader tag mutation targets the active Reader item and ignores Main Selection', async () => {
    const main = tagItem(1);
    const reader = tagItem(2);
    installZotero([main, reader], [{ tag: 'robotics' }]);
    const h = harness({ items: [main] });

    h.actions.add(h.window, h.session, READER_ITEM_TARGET.resolve({ itemID: reader.id }));
    const add = h.open();
    await add.options.confirm?.(
      {
        id: 'tag:robotics',
        title: 'robotics',
        search: 'robotics',
        tagName: 'robotics',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );

    expect(main.hasTag('robotics')).toBe(false);
    expect(reader.hasTag('robotics')).toBe(true);
    expect(h.session.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });

  it('adds a Note tag to its parent item without touching Main Selection', async () => {
    const main = tagItem(1);
    const parent = tagItem(2);
    const note = tagItem(3);
    Reflect.set(note, 'isNote', () => true);
    Reflect.set(note, 'parentItemID', parent.id);
    installZotero([main, parent, note], [{ tag: 'robotics' }]);
    const h = harness({ items: [main] });
    const active = {} as Element;
    Reflect.set(h.window.document, 'activeElement', active);
    Reflect.set(h.window, 'ZoteroContextPane', {
      context: { activeEditor: { item: note, contains: (node: unknown) => node === active } },
    });

    const noteTargets = NOTE_ITEM_TARGET.resolve(h.window);
    Reflect.set(h.window.document, 'activeElement', null);
    h.actions.add(h.window, h.session, noteTargets);
    await h.open().options.confirm?.(
      {
        id: 'tag:robotics',
        title: 'robotics',
        search: 'robotics',
        tagName: 'robotics',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );

    expect(parent.hasTag('robotics')).toBe(true);
    expect(note.hasTag('robotics')).toBe(false);
    expect(main.hasTag('robotics')).toBe(false);
    expect(h.session.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });

  it('refuses a partial Main tag mutation when Selection contains an unavailable item', () => {
    const selected = tagItem(2);
    installZotero([selected], [{ tag: 'robotics' }]);
    const h = harness({ items: [selected] });
    h.session.selection.add({ libraryID: 1, itemID: 99 });

    h.actions.add(h.window, h.session, MAIN_ITEM_TARGET.resolve(h.window, h.session));

    expect(() => h.open()).toThrow('Tag action did not open a chooser');
    expect(h.session.status.textContent).toBe(
      '✗ Selection contains unavailable items; refresh before changing tags',
    );
  });

  it('does not open a tag chooser for an unavailable Reader item', () => {
    const main = tagItem(1);
    installZotero([main]);
    const h = harness({ items: [main] });

    h.actions.add(h.window, h.session, READER_ITEM_TARGET.resolve({ itemID: 99 }));

    expect(() => h.open()).toThrow('Tag action did not open a chooser');
    expect(h.session.status.textContent).toBe(
      '✗ Context item is unavailable; refresh before changing tags',
    );
    expect(main.getTags()).toEqual([]);
  });

  it('rejects mixed-library tag targets before opening either mutation chooser', () => {
    const first = tagItem(1, [{ tag: 'robotics', type: 0 }]);
    const second = tagItem(2, [{ tag: 'robotics', type: 0 }]);
    Reflect.set(second, 'libraryID', 2);
    installZotero([first, second]);
    const h = harness({ items: [first] });
    const targets = { source: 'main' as const, items: [first, second], total: 2, missing: 0 };

    h.actions.add(h.window, h.session, targets);
    expect(h.session.status.textContent).toBe('✗ Add Tag requires one library at a time');
    h.actions.remove(h.window, h.session, targets);
    expect(h.session.status.textContent).toBe('✗ Remove Tag requires one library at a time');
    expect(() => h.open()).toThrow('Tag action did not open a chooser');
    expect(first.hasTag('robotics')).toBe(true);
    expect(second.hasTag('robotics')).toBe(true);
  });

  it('toggles one Main tag filter and clears all filters without mutating item tags', async () => {
    const item = tagItem(1, [{ tag: 'persistent', type: 0 }]);
    installZotero([item], [{ tag: 'alpha' }, { tag: 'beta' }]);
    const h = harness({
      items: [item],
      activeFilters: ['alpha'],
      scopedTags: [{ tag: 'alpha' }, { tag: 'beta' }],
    });

    h.actions.toggleFilter(h.window, h.session);
    const toggle = h.open();
    const loaded = await toggle.options.source!.load();
    expect(loaded.find((candidate) => candidate.tagName === 'alpha')?.meta).toBe('Active filter');
    await toggle.options.confirm?.(
      {
        id: 'tag:beta',
        title: 'beta',
        search: 'beta',
        tagName: 'beta',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );

    expect(h.setFilter).toHaveBeenLastCalledWith('tags', new Set(['alpha', 'beta']));
    expect(h.tagSelector.selectedTags).toEqual(new Set(['alpha', 'beta']));
    expect(item.hasTag('persistent')).toBe(true);

    h.actions.clearFilters(h.window, h.session);
    await vi.waitFor(() => expect(h.setFilter).toHaveBeenLastCalledWith('tags', new Set()));
    expect(h.tagSelector.selectedTags).toEqual(new Set());
    expect(item.hasTag('persistent')).toBe(true);
  });
});
