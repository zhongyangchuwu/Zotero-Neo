import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  applyMainTagFilter,
  focusMainQuickSearch,
  mainViewFilterState,
  openMainAdvancedSearch,
} from '../../src/main/host';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function harness(options: { quick?: string; tags?: string[]; advanced?: boolean }) {
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
  const row = {
    ref: { libraryID: 1 },
    searchText: quick,
    tags: activeTags,
    advancedSearch: options.advanced ? {} : undefined,
  };
  const tagSelector = { selectedTags: new Set<string>(activeTags) };
  const document = {
    getElementById: (id: string) => (id === 'zotero-tb-search' ? searchBar : null),
  } as unknown as Document;
  const window = {
    document,
    ZoteroPane: {
      getCollectionTreeRow: () => row,
      itemsView: { rowCount: 7, setFilter },
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
