import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  applyMainTagFilter,
  currentTagSelection,
  currentMainItem,
  cycleMainTab,
  mainTabList,
  selectMainTab,
  selectedMainTabID,
} from '../../src/main/host';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

describe('main host adapter', () => {
  it('prefers _tabs and select, while retaining tabs/selectTab/showTab fallbacks', () => {
    const selected: string[] = [];
    const primary = {
      selectedID: 'a',
      _tabs: [{ id: 'a' }, { id: 'b' }],
      tabs: [{ id: 'ignored' }],
      select: vi.fn((id: string) => selected.push(`select:${id}`)),
    };
    const window = { Zotero_Tabs: primary } as unknown as MainWindow;

    expect(mainTabList(window).map((tab) => tab.id)).toEqual(['a', 'b']);
    selectMainTab(window, 'b');
    cycleMainTab(window, 1);
    expect(selected).toEqual(['select:b', 'select:b']);

    const fallback = {
      _selectedID: 'b',
      tabs: [{ id: 'a' }, { id: 'b' }],
      selectTab: vi.fn((id: string) => selected.push(`selectTab:${id}`)),
    };
    const fallbackWindow = { Zotero_Tabs: fallback } as unknown as MainWindow;
    expect(selectedMainTabID(fallbackWindow)).toBe('b');
    cycleMainTab(fallbackWindow, -1);
    expect(selected).toContain('selectTab:a');

    const showTab = vi.fn((id: string) => selected.push(`showTab:${id}`));
    selectMainTab({ Zotero_Tabs: { showTab } } as unknown as MainWindow, 'fallback');
    expect(selected).toContain('showTab:fallback');
  });

  it('uses the active Reader item before selected main items and falls back safely', () => {
    const readerItem = { id: 7 } as Zotero.Item;
    const selectedItem = { id: 9 } as Zotero.Item;
    const window = {
      Zotero_Tabs: { selectedID: 'reader' },
      ZoteroPane: { getSelectedItems: () => [selectedItem] },
    } as unknown as MainWindow;

    Reflect.set(globalThis, 'Zotero', {
      Reader: { getByTabID: () => ({ itemID: 7 }) },
      Items: { get: (id: number) => (id === 7 ? readerItem : false) },
    });
    expect(currentMainItem(window)).toBe(readerItem);

    Reflect.set(globalThis, 'Zotero', {
      Reader: { getByTabID: () => null },
      Items: { get: () => false },
    });
    expect(currentMainItem(window)).toBe(selectedItem);
  });

  it('snapshots and applies tag filters through the current items view', async () => {
    const activeRow = { tags: new Set<string>() };
    const setFilter = vi.fn(async (_type: 'tags', tags: ReadonlySet<string>) => {
      activeRow.tags = new Set(tags);
    });
    const selectedTags = new Set<string>();
    const window = {
      ZoteroPane: {
        itemsView: { rowCount: 4, collectionTreeRows: [activeRow], setFilter },
        tagSelector: { selectedTags },
      },
    } as unknown as MainWindow;

    await expect(applyMainTagFilter(window, ['blue', 'green'])).resolves.toBe(4);
    expect(setFilter).toHaveBeenCalledWith('tags', new Set(['blue', 'green']));
    expect(currentTagSelection(window)).toEqual(['blue', 'green']);
    expect(
      (window as unknown as { ZoteroPane: { tagSelector: { selectedTags: Set<string> } } })
        .ZoteroPane.tagSelector.selectedTags,
    ).toEqual(new Set(['blue', 'green']));

    await expect(applyMainTagFilter(window, [])).resolves.toBe(4);
    expect(setFilter).toHaveBeenLastCalledWith('tags', new Set());
    expect(currentTagSelection(window)).toEqual([]);
    expect(
      (window as unknown as { ZoteroPane: { tagSelector: { selectedTags: Set<string> } } })
        .ZoteroPane.tagSelector.selectedTags,
    ).toEqual(new Set());
  });

  it('prefers active item-view rows over a stale singular row and tag-selector state', () => {
    const window = {
      ZoteroPane: {
        itemsView: { collectionTreeRows: [{ tags: new Set<string>() }] },
        getCollectionTreeRow: () => ({ tags: new Set(['stale-row']) }),
        tagSelector: { getTagSelection: () => new Set(['stale-selector']) },
      },
    } as unknown as MainWindow;

    expect(currentTagSelection(window)).toEqual([]);
  });

  it('prefers collection-row active filters over distinct native tag-selector state', () => {
    const window = {
      ZoteroPane: {
        getCollectionTreeRow: () => ({ tags: new Set(['row-active']) }),
        tagSelector: { getTagSelection: () => new Set(['native-selected']) },
      },
    } as unknown as MainWindow;

    expect(currentTagSelection(window)).toEqual(['row-active']);
  });
});
