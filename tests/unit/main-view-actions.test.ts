import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  applyMainTagFilter,
  focusMainQuickSearch,
  mainViewFilterState,
  openMainAdvancedSearch,
} from '../../src/toolkit/main';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function harness(options: {
  quick?: string;
  tags?: string[];
  advanced?: boolean;
  libraries?: number[];
}) {
  const quick = options.quick ?? '';
  const activeTags = new Set(options.tags ?? []);
  const select = vi.fn();
  const setFilter = vi.fn(async (_type: 'tags', tags: ReadonlySet<string>) => {
    activeTags.clear();
    for (const tag of tags) activeTags.add(tag);
  });
  const openAdvancedSearchFromQuickSearch = vi.fn(async () => undefined);
  const toggleAdvancedSearchState = vi.fn(async () => undefined);
  const searchBar = {
    value: quick,
    searchTextbox: { value: quick, select },
  };
  const rows = (options.libraries ?? [1]).map((libraryID) => ({
    ref: { libraryID },
    searchText: quick,
    tags: activeTags,
    advancedSearch: options.advanced ? {} : undefined,
  }));
  const tagSelector = { selectedTags: new Set<string>(activeTags) };
  const document = {
    getElementById: (id: string) => (id === 'zotero-tb-search' ? searchBar : null),
  } as unknown as Document;
  const window = {
    document,
    ZoteroPane: {
      getCollectionTreeRows: () => rows,
      getCollectionTreeRow: () => {
        if (rows.length > 1) throw new Error('Expected a single selected collection tree row');
        return rows[0];
      },
      itemsView: { rowCount: 7, objectRowCount: 7, collectionTreeRows: rows, setFilter },
      tagSelector,
      openAdvancedSearchFromQuickSearch,
      toggleAdvancedSearchState,
    },
  } as unknown as MainWindow;

  return {
    window,
    select,
    setFilter,
    activeTags,
    rows,
    tagSelector,
    openAdvancedSearchFromQuickSearch,
    toggleAdvancedSearchState,
  };
}

describe('Main View host adapter', () => {
  it('reads Quick Search, tags, and Advanced Search as one View filter snapshot', () => {
    const h = harness({ quick: 'robotics', tags: ['embodied', 'policy'], advanced: true });

    expect(mainViewFilterState(h.window)).toEqual({
      quickSearchText: 'robotics',
      tags: ['embodied', 'policy'],
      advancedSearch: true,
    });
  });

  it.each([
    [1, 1],
    [1, 2],
  ])(
    'reads and applies whole-view filters across selected libraries %j',
    async (...libraries: number[]) => {
      const h = harness({
        quick: 'robotics',
        tags: ['embodied'],
        advanced: true,
        libraries,
      });

      expect(mainViewFilterState(h.window)).toEqual({
        quickSearchText: 'robotics',
        tags: ['embodied'],
        advancedSearch: true,
      });
      await expect(applyMainTagFilter(h.window, ['policy'])).resolves.toBe(7);
      expect(h.rows.map((row) => [...row.tags])).toEqual(libraries.map(() => ['policy']));
      expect(mainViewFilterState(h.window)).toEqual({
        quickSearchText: 'robotics',
        tags: ['policy'],
        advancedSearch: true,
      });
    },
  );

  it('keeps empty Quick Search and rendered filter rows authoritative over stale tree state', () => {
    const h = harness({ quick: '', libraries: [1, 2] });
    for (const row of h.rows) row.searchText = 'stale row text';
    Reflect.set(Reflect.get(h.window, 'ZoteroPane'), 'getCollectionTreeRows', () => [
      { searchText: 'stale tree text', tags: new Set(['stale']), advancedSearch: {} },
    ]);

    expect(mainViewFilterState(h.window)).toEqual({
      quickSearchText: '',
      tags: [],
      advancedSearch: false,
    });
  });

  it('focuses the native Quick Search field without changing its value', () => {
    const h = harness({ quick: 'keep me' });

    expect(focusMainQuickSearch(h.window)).toBe(true);
    expect(h.select).toHaveBeenCalledOnce();
    expect(mainViewFilterState(h.window).quickSearchText).toBe('keep me');
  });

  it('converts non-empty Quick Search through Zotero native Advanced Search handling', async () => {
    vi.stubGlobal('Zotero', {
      Prefs: { get: vi.fn(() => 'titleCreatorYear') },
    });
    const h = harness({ quick: 'alpha beta' });

    await expect(openMainAdvancedSearch(h.window)).resolves.toBe(true);
    expect(h.openAdvancedSearchFromQuickSearch).toHaveBeenCalledWith(
      'alpha beta',
      'titleCreatorYear',
    );
    expect(h.toggleAdvancedSearchState).not.toHaveBeenCalled();
  });

  it('opens an empty native Advanced Search when Quick Search is empty', async () => {
    vi.stubGlobal('Zotero', {
      Prefs: { get: vi.fn(() => 'fields') },
    });
    const h = harness({ quick: '' });

    await expect(openMainAdvancedSearch(h.window)).resolves.toBe(true);
    expect(h.toggleAdvancedSearchState).toHaveBeenCalledWith('open');
    expect(h.openAdvancedSearchFromQuickSearch).not.toHaveBeenCalled();
  });

  it('applies tag predicates through the same View host without changing other state', async () => {
    const h = harness({ quick: 'alpha', tags: ['old'], advanced: true });

    await expect(applyMainTagFilter(h.window, ['blue', 'green'])).resolves.toBe(7);
    expect(h.setFilter).toHaveBeenCalledWith('tags', new Set(['blue', 'green']));
    expect(h.tagSelector.selectedTags).toEqual(new Set(['blue', 'green']));
    expect(mainViewFilterState(h.window)).toMatchObject({
      quickSearchText: 'alpha',
      advancedSearch: true,
    });
  });
});
