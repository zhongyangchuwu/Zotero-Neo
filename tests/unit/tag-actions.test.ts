import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceReader } from '../../src/core/preferences';
import { MainNavigation } from '../../src/main/navigation';
import { MAIN_ITEM_TARGET } from '../../src/main/main-item-target';
import { NOTE_ITEM_TARGET } from '../../src/main/note-item-target';
import { READER_ITEM_TARGET } from '../../src/reader/item-target';
import type { PickerItem } from '../../src/main/picker/model';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import type { MainWindowSession } from '../../src/main/session';
import { ModuleHost } from '../../src/core/module-host';
import { createTagModule } from '../../src/modules/tags';
import { mainTagScope, mainViewFilterState, applyMainTagFilter } from '../../src/toolkit/main';
import { SelectionStore } from '../../src/modules/worksets/selection-store';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

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
    isRegularItem: () => true,
    isEditable: () => true,
    hasChanged: () => false,
    reload: async () => undefined,
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
  renderedRows?: readonly { isObjectRow: boolean; ref?: Zotero.Item }[];
  scopes?: Array<{
    type: 'collection' | 'search' | 'library';
    libraryID: number;
    itemIDs: readonly number[];
  }>;
}) {
  const items = options.items ?? [];
  const activeFilters = new Set(options.activeFilters ?? []);
  const scopes = options.scopes ?? [
    { type: 'collection', libraryID: 1, itemIDs: items.map((item) => item.id) },
  ];
  const setFilter = vi.fn(async (_type: 'tags', tags: ReadonlySet<string>) => {
    activeFilters.clear();
    for (const tag of tags) activeFilters.add(tag);
  });
  const tagSelector = { selectedTags: new Set<string>() };
  const rows = scopes.map((scope) => ({
    type: scope.type,
    ref: { libraryID: scope.libraryID },
    tags: activeFilters,
    searchText: '',
    advancedSearch: undefined as object | undefined,
    getSearchResults: async () => [...scope.itemIDs],
    getTags: async () =>
      options.scopedTags ??
      scope.itemIDs.flatMap((id) => {
        const item = Zotero.Items.get(id);
        return item ? item.getTags() : [];
      }),
  }));
  const renderedRows =
    options.renderedRows ?? items.map((item) => ({ isObjectRow: true, ref: item }));
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
      getCollectionTreeRows: () => rows,
      getCollectionTreeRow: () => {
        if (rows.length > 1) throw new Error('Expected a single selected collection tree row');
        return rows[0];
      },
      itemsView: {
        rowCount: renderedRows.length,
        get objectRowCount() {
          return renderedRows.filter((row) => row.isObjectRow).length;
        },
        collectionTreeRows: rows,
        selection: { focused: 0 },
        getRow: (index: number) => renderedRows[index],
        getRowIndexByID: (id: number) => {
          const index = renderedRows.findIndex((row) => row.isObjectRow && row.ref?.id === id);
          return index < 0 ? false : index;
        },
        setFilter,
      },
      tagSelector,
    },
  } as unknown as MainWindow;
  const selection = new SelectionStore();
  for (const item of items) selection.add({ libraryID: item.libraryID, itemID: item.id });
  const status = { textContent: '', style: {} };
  const session = {
    window,
    status,
    statusView: {
      update: (model: { text: string }) => {
        status.textContent = model.text;
      },
    },
    cleanup: { add: vi.fn() },
  } as unknown as MainWindowSession;
  let lastOpen:
    | {
        scope: string;
        options: PickerOpenOptions;
      }
    | undefined;
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const navigation = new MainNavigation(logger, () => undefined);
  const preferences: PreferenceReader = {
    get: (_key: string, fallback: boolean | number | string) => fallback,
  } as PreferenceReader;
  const modules = new ModuleHost(logger, () => true);
  const actions = createTagModule(modules, {
    logger,
    preferences,
    choose: (pickerOptions) => {
      lastOpen = { scope: 'tags', options: pickerOptions };
      return () => {
        lastOpen = undefined;
      };
    },
    status: (message) => navigation.status(session, message),
    readFilter: () => [...mainViewFilterState(window).tags],
    captureScopeTags: () => mainTagScope(window).getTags,
    applyFilter: (tags) => applyMainTagFilter(window, tags),
  });

  return {
    actions,
    logger,
    modules,
    window,
    session,
    selection,
    setFilter,
    tagSelector,
    activeFilters,
    rows,
    open: () => {
      if (!lastOpen) throw new Error('Tag action did not open a chooser');
      return lastOpen;
    },
  };
}

function installZotero(
  items: readonly Zotero.Item[],
  libraryTags: _ZoteroTypes.Tags.TagJson[] = [],
  extraLibraryTags: Readonly<Record<number, _ZoteroTypes.Tags.TagJson[]>> = {},
) {
  const byID = new Map(items.map((item) => [item.id, item]));
  const libraries = new Map(
    items.map((item) => [
      item.libraryID,
      { editable: true, libraryType: item.libraryID === 1 ? 'user' : 'group' },
    ]),
  );
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => byID.get(id) ?? false },
    Reader: { getByTabID: () => null },
    Libraries: { userLibraryID: 1, get: (id: number) => libraries.get(id) },
    CollectionTreeRow: {
      getTagsAcrossRows: async (
        rows: readonly { getSearchResults: () => Promise<readonly number[]> }[],
      ) => {
        const ids = new Set((await Promise.all(rows.map((row) => row.getSearchResults()))).flat());
        return [...ids].flatMap((id) => byID.get(id)?.getTags() ?? []);
      },
    },
    Tags: {
      getAll: vi.fn(async (id: number) => (id === 1 ? libraryTags : (extraLibraryTags[id] ?? []))),
    },
    DB: createCollectionTransactionDB(),
  });
  return { byID, libraries };
}

describe('semantic Tag actions', () => {
  it('keeps add/remove explicit across a multi-item target set', async () => {
    const first = tagItem(1, [{ tag: 'alpha', type: 0 }]);
    const second = tagItem(2);
    installZotero([first, second], [{ tag: 'alpha' }, { tag: 'robotics' }]);
    const h = harness({ items: [first, second] });

    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
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
    expect(h.session.status.textContent).toBe('✓ Tags added: 2');

    h.actions.remove(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
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
    expect(h.session.status.textContent).toBe('✓ Tags removed: 2');
  });

  it('deduplicates same-named tags across types and keeps the candidate actionable', async () => {
    const typeOne = tagItem(1, [{ tag: 'mixed', type: 1 }]);
    const typeZero = tagItem(2, [{ tag: 'mixed', type: 0 }]);
    const unassigned = tagItem(3);
    installZotero([typeOne, typeZero, unassigned], [{ tag: 'mixed', type: 0 }]);
    const h = harness({ items: [typeOne, typeZero, unassigned] });

    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const add = h.open();
    const addCandidates = await add.options.source!.load();
    expect(addCandidates.map((candidate) => candidate.tagName)).toEqual(['mixed']);
    await add.options.confirm?.(addCandidates[0]!, false);
    expect(unassigned.hasTag('mixed')).toBe(true);
    expect(typeOne.getTags()).toEqual([{ tag: 'mixed', type: 1 }]);
    expect(typeZero.getTags()).toEqual([{ tag: 'mixed', type: 0 }]);
    expect(h.session.status.textContent).toBe('→ Tags added: 1 · Skipped 2 (2 already up to date)');

    h.actions.remove(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const remove = h.open();
    const removeCandidates = await remove.options.source!.load();
    expect(removeCandidates.map((candidate) => candidate.tagName)).toEqual(['mixed']);
    await remove.options.confirm?.(removeCandidates[0]!, false);
    expect([typeOne, typeZero, unassigned].every((item) => !item.hasTag('mixed'))).toBe(true);
  });

  it('hides valid Neo identities from tag actions and rejects forged create candidates', async () => {
    const identity = 'urn:zotero-neo:chapter-note:v1:0123456789abcdef0123456789abcdef';
    const assigned = tagItem(1, [
      { tag: identity, type: 1 },
      { tag: 'ordinary', type: 0 },
    ]);
    const unassigned = tagItem(2);
    installZotero(
      [assigned, unassigned],
      [
        { tag: identity, type: 0 },
        { tag: 'ordinary', type: 0 },
      ],
    );
    const h = harness({ items: [assigned, unassigned] });
    const forgedIdentity = {
      id: `create:${identity}`,
      title: identity,
      search: identity,
      tagName: identity,
      tagCandidate: 'create',
    } as PickerItem;

    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const add = h.open();
    expect((await add.options.source!.load()).map((candidate) => candidate.tagName)).toEqual([
      'ordinary',
    ]);
    await add.options.confirm?.(forgedIdentity, false);
    expect(unassigned.hasTag(identity)).toBe(false);

    h.actions.remove(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const remove = h.open();
    expect((await remove.options.source!.load()).map((candidate) => candidate.tagName)).toEqual([
      'ordinary',
    ]);
    await remove.options.confirm?.(forgedIdentity, false);
    expect(assigned.hasTag(identity)).toBe(true);

    h.actions.toggleFilter();
    const filter = h.open();
    expect((await filter.options.source!.load()).map((candidate) => candidate.tagName)).toEqual([
      'ordinary',
    ]);
    await filter.options.confirm?.(forgedIdentity, false);
    expect(h.setFilter).not.toHaveBeenCalled();
  });

  it('uses Neo EffectiveSelection instead of native Main tree selection', async () => {
    const nativeOnly = tagItem(1);
    const selected = tagItem(2);
    installZotero([nativeOnly, selected], [{ tag: 'robotics' }]);
    const h = harness({ items: [nativeOnly, selected] });
    h.selection.clear();
    h.selection.add({ libraryID: selected.libraryID, itemID: selected.id });

    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
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
  it.each([
    ['visual', 'Visual range'],
    ['native-selection', 'Zotero native selection'],
    ['cursor', 'Item cursor'],
  ] as const)('labels the Main %s action target', (origin, label) => {
    const items = origin === 'cursor' ? [tagItem(20)] : [tagItem(21), tagItem(22)];
    installZotero(items, [{ tag: 'robotics' }]);
    const h = harness({ items });
    const currentTarget =
      origin === 'visual'
        ? {
            source: 'visual' as const,
            refs: items.map((value) => ({ libraryID: value.libraryID, itemID: value.id })),
          }
        : undefined;
    const targets = MAIN_ITEM_TARGET.resolve(h.window, null, currentTarget);

    expect(targets.presentation.origin).toBe(origin);
    h.actions.add(targets);
    expect(h.open().options.source?.title).toContain(label);
  });

  it('shows the normalized Main workset and outside count while writing only those targets', async () => {
    const cursor = tagItem(1);
    const selected = tagItem(2);
    const child = tagItem(3);
    const hidden = tagItem(4);
    Reflect.set(child, 'isAttachment', () => true);
    Reflect.set(child, 'parentItemID', selected.id);
    const items = [cursor, selected, child, hidden];
    installZotero(items, [{ tag: 'robotics' }]);
    const h = harness({
      items,
      renderedRows: [
        { isObjectRow: true, ref: cursor },
        { isObjectRow: true, ref: selected },
      ],
    });
    h.selection.clear();
    h.selection.add({ libraryID: 1, itemID: selected.id });
    h.selection.add({ libraryID: 1, itemID: child.id });
    h.selection.add({ libraryID: 1, itemID: hidden.id });

    const targets = MAIN_ITEM_TARGET.resolve(h.window, h.selection);
    expect(targets.items).toEqual([selected, hidden]);
    expect(targets.total).toBe(3);
    expect(targets.presentation).toEqual({
      origin: 'selection',
      outsideCurrentList: 1,
    });
    h.actions.add(targets);
    const picker = h.open();
    expect(picker.options.source?.title).toContain(
      'Neo work set · Items: 2 · Outside current list: 1',
    );
    const [candidate] = await picker.options.source!.load();
    await picker.options.confirm?.(candidate!, false);

    expect(cursor.hasTag('robotics')).toBe(false);
    expect(selected.hasTag('robotics')).toBe(true);
    expect(child.hasTag('robotics')).toBe(false);
    expect(hidden.hasTag('robotics')).toBe(true);
  });

  it('Reader tag mutation targets the active Reader item and ignores Main Selection', async () => {
    const main = tagItem(1);
    const reader = tagItem(2);
    installZotero([main, reader], [{ tag: 'robotics' }]);
    const h = harness({ items: [main] });

    h.actions.add(READER_ITEM_TARGET.resolve({ itemID: reader.id }));
    const add = h.open();
    expect(add.options.source?.title).toContain('Current Reader item');
    expect(add.options.source?.title).not.toContain('Neo work set');
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
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
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
    h.actions.add(noteTargets);
    const picker = h.open();
    expect(picker.options.source?.title).toContain('Note context item');
    expect(picker.options.source?.title).not.toContain('Neo work set');
    await picker.options.confirm?.(
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
    expect(h.selection.values()).toEqual([{ libraryID: 1, itemID: main.id }]);
  });

  it('adds to eligible Main targets despite missing, unsupported, read-only and assigned items', async () => {
    const writable = tagItem(1);
    const assigned = tagItem(2, [{ tag: 'robotics', type: 1 }]);
    const readOnly = tagItem(3);
    const unsupported = tagItem(4);
    Reflect.set(readOnly, 'libraryID', 2);
    Reflect.set(unsupported, 'isRegularItem', () => false);
    const items = [writable, assigned, readOnly, unsupported];
    const { libraries } = installZotero(items, [{ tag: 'robotics' }], {
      2: [{ tag: 'read-only candidate' }],
    });
    libraries.get(2)!.editable = false;
    const h = harness({ items });
    h.selection.add({ libraryID: 1, itemID: 99 });

    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const chooser = h.open();
    const candidates = await chooser.options.source!.load();
    expect(candidates.map((item) => item.tagName)).toEqual(['robotics']);
    await chooser.options.confirm?.(candidates[0]!, false);

    expect(writable.getTags()).toEqual([{ tag: 'robotics', type: 0 }]);
    expect(assigned.getTags()).toEqual([{ tag: 'robotics', type: 1 }]);
    expect(readOnly.getTags()).toEqual([]);
    expect(unsupported.getTags()).toEqual([]);
    expect(h.session.status.textContent).toBe(
      '→ Tags added: 1 · Skipped 4 (3 unavailable or read-only, 1 already up to date)',
    );
  });

  it('does not open a tag chooser for an unavailable Reader item', () => {
    const main = tagItem(1);
    installZotero([main]);
    const h = harness({ items: [main] });

    h.actions.add(READER_ITEM_TARGET.resolve({ itemID: 99 }));

    expect(() => h.open()).toThrow('Tag action did not open a chooser');
    expect(main.getTags()).toEqual([]);
    expect(h.session.status.textContent).toContain('→ No tags added');
    expect(h.session.status.textContent).toContain('1 unavailable or read-only');
  });

  it('aggregates writable library candidates by name and changes items across both libraries', async () => {
    const first = tagItem(1);
    const second = tagItem(2);
    Reflect.set(second, 'libraryID', 2);
    installZotero([first, second], [{ tag: 'first only' }, { tag: 'shared', type: 1 }], {
      2: [{ tag: 'second only' }, { tag: 'shared', type: 0 }],
    });
    const h = harness({ items: [first, second] });
    const targets = MAIN_ITEM_TARGET.resolve(h.window, h.selection);

    h.actions.add(targets);
    const add = h.open();
    const candidates = await add.options.source!.load();
    expect(candidates.map((item) => item.tagName).sort()).toEqual([
      'first only',
      'second only',
      'shared',
    ]);
    await add.options.confirm?.(candidates.find((item) => item.tagName === 'second only')!, false);
    expect(first.hasTag('second only')).toBe(true);
    expect(second.hasTag('second only')).toBe(true);

    h.actions.remove(targets);
    const remove = h.open();
    const [assigned] = await remove.options.source!.load();
    expect(assigned?.tagName).toBe('second only');
    await remove.options.confirm?.(assigned!, false);
    expect(first.hasTag('second only')).toBe(false);
    expect(second.hasTag('second only')).toBe(false);
  });

  it('reports a neutral removal notice when the only assigned tags are protected or read-only', () => {
    const identity = 'urn:zotero-neo:chapter-note:v1:0123456789abcdef0123456789abcdef';
    const writable = tagItem(1, [{ tag: identity, type: 1 }]);
    const readOnly = tagItem(2, [{ tag: 'ordinary', type: 0 }]);
    Reflect.set(readOnly, 'isEditable', () => false);
    const items = [writable, readOnly];
    installZotero(items);
    const h = harness({ items });

    h.actions.remove(MAIN_ITEM_TARGET.resolve(h.window, h.selection));

    expect(() => h.open()).toThrow('Tag action did not open a chooser');
    expect(writable.hasTag(identity)).toBe(true);
    expect(readOnly.hasTag('ordinary')).toBe(true);
    expect(h.session.status.textContent).toContain('→ No tags removed');
  });

  it('reports a localized no-change notice when every target already has the tag', async () => {
    const item = tagItem(1, [{ tag: 'robotics', type: 1 }]);
    installZotero([item], [{ tag: 'robotics' }]);
    Reflect.set(Zotero, 'locale', 'zh-CN');
    const h = harness({ items: [item] });
    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const chooser = h.open();
    const [candidate] = await chooser.options.source!.load();
    await chooser.options.confirm?.(candidate!, false);

    expect(item.getTags()).toEqual([{ tag: 'robotics', type: 1 }]);
    expect(item.save).not.toHaveBeenCalled();
    expect(h.session.status.textContent).toBe('→ 未添加标签，跳过 1 项（1 项无需更改）');
  });

  it('uses the original selection but skips replaced and newly read-only items at confirm', async () => {
    const retained = tagItem(1);
    const replaced = tagItem(2);
    const readOnly = tagItem(3);
    const other = tagItem(4);
    const { byID } = installZotero([retained, replaced, readOnly, other], [{ tag: 'robotics' }]);
    const h = harness({ items: [retained, replaced, readOnly] });
    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const chooser = h.open();
    const [candidate] = await chooser.options.source!.load();

    const replacement = tagItem(replaced.id);
    byID.set(replacement.id, replacement);
    Reflect.set(readOnly, 'isEditable', () => false);
    h.selection.clear();
    h.selection.add({ libraryID: other.libraryID, itemID: other.id });
    await chooser.options.confirm?.(candidate!, false);

    expect(retained.hasTag('robotics')).toBe(true);
    for (const item of [replaced, replacement, readOnly, other]) {
      expect(item.hasTag('robotics')).toBe(false);
    }
    expect(h.session.status.textContent).toBe(
      '→ Tags added: 1 · Skipped 2 (2 unavailable or read-only)',
    );
  });

  it('reports a partial removal when one save fails and another item lacks the chosen tag', async () => {
    const failed = tagItem(1, [{ tag: 'robotics', type: 1 }]);
    Reflect.set(failed, 'save', async () => {
      throw new Error('Save unavailable');
    });
    const unassigned = tagItem(2);
    const removed = tagItem(3, [{ tag: 'robotics', type: 0 }]);
    const items = [failed, unassigned, removed];
    installZotero(items);
    const h = harness({ items });
    h.actions.remove(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const chooser = h.open();
    const [candidate] = await chooser.options.source!.load();
    await chooser.options.confirm?.(candidate!, false);

    expect(failed.getTags()).toEqual([{ tag: 'robotics', type: 1 }]);
    expect(removed.getTags()).toEqual([]);
    expect(h.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Save unavailable'));
    expect(h.session.status.textContent).toBe(
      '→ Tags removed: 1 · Skipped 2 (1 already up to date, 1 failed)',
    );
  });

  it.each([
    {
      name: 'one collection',
      scopes: [{ type: 'collection' as const, libraryID: 1, itemIDs: [1] }],
      expected: ['red', 'shared'],
    },
    {
      name: 'multiple collections',
      scopes: [
        { type: 'collection' as const, libraryID: 1, itemIDs: [1] },
        { type: 'collection' as const, libraryID: 1, itemIDs: [2] },
      ],
      expected: ['blue', 'red', 'shared'],
    },
    {
      name: 'a collection and saved search across libraries',
      scopes: [
        { type: 'collection' as const, libraryID: 1, itemIDs: [1] },
        { type: 'search' as const, libraryID: 2, itemIDs: [4] },
      ],
      expected: ['green', 'red', 'shared'],
    },
    {
      name: 'multiple saved searches across libraries',
      scopes: [
        { type: 'search' as const, libraryID: 1, itemIDs: [2] },
        { type: 'search' as const, libraryID: 2, itemIDs: [4] },
      ],
      expected: ['blue', 'green', 'shared'],
    },
    {
      name: 'multiple library roots',
      scopes: [
        { type: 'library' as const, libraryID: 1, itemIDs: [1, 2] },
        { type: 'library' as const, libraryID: 2, itemIDs: [4] },
      ],
      expected: ['blue', 'green', 'red', 'shared'],
    },
  ])('toggles tags in the native whole-view results for $name', async ({ scopes, expected }) => {
    const red = tagItem(1, [
      { tag: 'red', type: 0 },
      { tag: 'shared', type: 1 },
    ]);
    const blue = tagItem(2, [
      { tag: 'blue', type: 0 },
      { tag: 'shared', type: 0 },
    ]);
    const outside = tagItem(3, [{ tag: 'unrelated', type: 0 }]);
    const green = tagItem(4, [
      { tag: 'green', type: 0 },
      { tag: 'shared', type: 0 },
    ]);
    Reflect.set(green, 'libraryID', 2);
    installZotero([red, blue, outside, green], [{ tag: 'global-only' }]);
    const h = harness({ items: [outside], scopes });
    h.tagSelector.selectedTags.add('stale-selector');
    for (const row of h.rows) {
      row.searchText = 'native quick search';
      row.advancedSearch = {};
    }

    h.actions.toggleFilter();
    const toggle = h.open();
    const candidates = await toggle.options.source!.load();
    expect(candidates.map((candidate) => candidate.tagName).sort()).toEqual(expected);
    expect(candidates.every((candidate) => candidate.meta !== 'Active filter')).toBe(true);

    await toggle.options.confirm?.(
      {
        id: 'tag:shared',
        title: 'shared',
        search: 'shared',
        tagName: 'shared',
        tagCandidate: 'tag',
      } as PickerItem,
      false,
    );

    expect(h.rows.map((row) => [...row.tags])).toEqual(scopes.map(() => ['shared']));
    expect(h.tagSelector.selectedTags).toEqual(new Set(['shared']));
    expect(
      h.rows.every((row) => row.searchText === 'native quick search' && row.advancedSearch),
    ).toBe(true);
    expect(outside.getTags()).toEqual([{ tag: 'unrelated', type: 0 }]);
  });

  it('keeps an active tag removable when the whole view currently has no results', async () => {
    installZotero([], [{ tag: 'global-only' }]);
    const h = harness({
      activeFilters: ['missing'],
      scopes: [
        { type: 'collection', libraryID: 1, itemIDs: [] },
        { type: 'search', libraryID: 2, itemIDs: [] },
      ],
    });

    h.actions.toggleFilter();
    const toggle = h.open();
    const candidates = await toggle.options.source!.load();
    expect(candidates.map((candidate) => [candidate.tagName, candidate.meta])).toEqual([
      ['missing', 'Active filter'],
    ]);
    await toggle.options.confirm?.(candidates[0]!, false);
    expect(h.rows.map((row) => [...row.tags])).toEqual([[], []]);
    expect(h.tagSelector.selectedTags).toEqual(new Set());
  });

  it('reports matching items without counting native library headers and spacers', async () => {
    const first = tagItem(1, [{ tag: 'shared', type: 0 }]);
    const second = tagItem(2, [{ tag: 'shared', type: 0 }]);
    Reflect.set(second, 'libraryID', 2);
    installZotero([first, second]);
    const h = harness({
      items: [first, second],
      scopes: [
        { type: 'collection', libraryID: 1, itemIDs: [first.id] },
        { type: 'library', libraryID: 2, itemIDs: [second.id] },
      ],
      renderedRows: [
        { isObjectRow: false },
        { isObjectRow: true, ref: first },
        { isObjectRow: false },
        { isObjectRow: false },
        { isObjectRow: true, ref: second },
      ],
    });

    h.actions.toggleFilter();
    const toggle = h.open();
    const [candidate] = await toggle.options.source!.load();
    await toggle.options.confirm?.(candidate!, false);
    expect(h.session.status.textContent).toBe('✓ Added tag filter “shared” · 2 items');

    h.actions.clearFilters();
    await vi.waitFor(() =>
      expect(h.session.status.textContent).toBe('✓ Cleared tag filters · 2 items'),
    );
    expect(first.hasTag('shared')).toBe(true);
    expect(second.hasTag('shared')).toBe(true);
  });

  it('toggles one Main tag filter and clears all filters without mutating item tags', async () => {
    const item = tagItem(1, [{ tag: 'persistent', type: 0 }]);
    installZotero([item], [{ tag: 'alpha' }, { tag: 'beta' }]);
    const h = harness({
      items: [item],
      activeFilters: ['alpha'],
      scopedTags: [{ tag: 'alpha' }, { tag: 'beta' }],
    });

    h.actions.toggleFilter();
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

    h.actions.clearFilters();
    await vi.waitFor(() => expect(h.setFilter).toHaveBeenLastCalledWith('tags', new Set()));
    expect(h.tagSelector.selectedTags).toEqual(new Set());
    expect(item.hasTag('persistent')).toBe(true);
  });

  it('rejects old chooser confirmation after its module host retires', async () => {
    const item = tagItem(1);
    installZotero([item], [{ tag: 'robotics' }]);
    const h = harness({ items: [item] });
    const targets = MAIN_ITEM_TARGET.resolve(h.window, h.selection);
    h.actions.add(targets);
    const chooser = h.open();
    const [candidate] = await chooser.options.source!.load();

    h.modules.dispose();
    await chooser.options.confirm?.(candidate!, false);
    expect(h.actions.add(targets)).toBe(false);
    expect(item.getTags()).toEqual([]);
  });

  it('lets an admitted native save finish without reviving retired module feedback', async () => {
    const item = tagItem(1);
    const later = tagItem(2);
    installZotero([item, later], [{ tag: 'robotics' }]);
    const started = Promise.withResolvers<void>();
    const barrier = Promise.withResolvers<void>();
    let saved = false;
    Reflect.set(item, 'save', async () => {
      started.resolve();
      await barrier.promise;
      saved = true;
      return item.id;
    });
    const h = harness({ items: [item, later] });
    h.actions.add(MAIN_ITEM_TARGET.resolve(h.window, h.selection));
    const chooser = h.open();
    const [candidate] = await chooser.options.source!.load();
    const pending = chooser.options.confirm!(candidate!, false);
    await started.promise;
    expect(item.hasTag('robotics')).toBe(true);

    h.modules.dispose();
    barrier.resolve();
    await pending;
    expect(saved).toBe(true);
    expect(item.hasTag('robotics')).toBe(true);
    expect(later.hasTag('robotics')).toBe(false);
    expect(h.session.status.textContent).toBe('');
  });
});
