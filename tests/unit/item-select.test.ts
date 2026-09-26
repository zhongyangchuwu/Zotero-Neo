import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import {
  MainItemSelect,
  nextItemSelectIndex,
  selectionStatusText,
  visualStatusText,
} from '../../src/main/item-select';
import { SelectionStore } from '../../src/main/selection-store';
import {
  resolveInteractionAppearance,
  type InteractionAppearanceSource,
} from '../../src/main/interaction-appearance';
import type { PreferenceReader } from '../../src/core/preferences';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

function appearanceSource(
  values: Readonly<Record<string, string>> = {},
): InteractionAppearanceSource {
  const preferences = {
    get: ((key: string, fallback: boolean | number | string) =>
      values[key] ?? fallback) as PreferenceReader['get'],
  };
  return {
    appearance: resolveInteractionAppearance(preferences, 'light'),
    observe: () => () => {},
  };
}

function item(id: number): Zotero.Item {
  return { id, libraryID: 1 } as Zotero.Item;
}

function harness(focusedRow = 0, initialSelected: readonly number[] = [focusedRow]) {
  const rows = [item(10), item(11), item(12), item(13), item(14)].map((ref) => ({
    isObjectRow: true,
    ref,
  }));
  let focused = focusedRow;
  let pivot = focusedRow;
  let selected = new Set<number>(initialSelected);
  const active = { id: `item-tree-row-${focusedRow}` } as unknown as Element;
  const root = { contains: (node: unknown) => node === active } as HTMLElement;
  const badgeChildren: Array<{ textContent?: string | null; className?: string }> = [];
  const badge = {
    id: '',
    style: { cssText: '', display: '' },
    textContent: '',
    replaceChildren: vi.fn(() => {
      badgeChildren.length = 0;
      badge.textContent = '';
    }),
    append: vi.fn((child: { textContent?: string | null; className?: string }) => {
      badgeChildren.push(child);
      badge.textContent = badgeChildren.map((entry) => entry.textContent ?? '').join('');
    }),
    remove: vi.fn(),
  } as unknown as HTMLElement;
  const style = {
    id: '',
    textContent: '',
    remove: vi.fn(),
  } as unknown as HTMLStyleElement;

  const select = vi.fn((index: number) => {
    pivot = index;
    focused = index;
    selected = new Set([index]);
  });
  const shiftSelect = vi.fn((index: number) => {
    focused = index;
    const first = Math.min(pivot, index);
    const last = Math.max(pivot, index);
    selected = new Set(Array.from({ length: last - first + 1 }, (_, offset) => first + offset));
  });
  const toggleSelect = vi.fn((index: number) => {
    focused = index;
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
  });
  const clearSelection = vi.fn(() => {
    selected.clear();
  });
  const onSelection = vi.fn(
    (index: number, _shiftSelect: boolean, toggleSelection: boolean, moveFocused: boolean) => {
      if (toggleSelection) toggleSelect(index);
      if (moveFocused) focused = index;
    },
  );

  const selection = {
    get pivot() {
      return pivot;
    },
    get focused() {
      return focused;
    },
    get count() {
      return selected.size;
    },
    select,
    shiftSelect,
    toggleSelect,
    clearSelection,
  };
  const view = {
    domEl: root,
    tree: { _onSelection: onSelection },
    rowCount: rows.length,
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: number) => {
      const index = rows.findIndex((row) => row.ref.id === id);
      return index < 0 ? false : index;
    },
    ensureRowIsVisible: vi.fn(),
  };
  const document = {
    activeElement: active,
    getElementById: () => null,
    querySelector: () => null,
    createElementNS: (_namespace: string, tag: string) =>
      tag === 'style'
        ? style
        : tag === 'div'
          ? badge
          : ({
              className: '',
              textContent: '',
              style: { color: '' },
            } as unknown as HTMLElement),
    body: { append: vi.fn() },
    documentElement: { append: vi.fn() },
  } as unknown as Document;
  const window = {
    document,
    ZoteroPane: {
      itemsView: view,
      getSelectedItems: () =>
        [...selected].flatMap((index) => (rows[index]?.ref ? [rows[index]!.ref] : [])),
    },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  } as unknown as MainWindow;

  return {
    window,
    rows,
    selection,
    badge,
    badgeChildren,
    selectedRows: () => [...selected].sort((left, right) => left - right),
    focusedRow: () => focused,
  };
}

function selectedIDs(store: SelectionStore): number[] {
  return store
    .values()
    .map((ref) => ref.itemID)
    .sort((left, right) => left - right);
}

describe('Main item attach', () => {
  const appearance = appearanceSource();

  it('establishes a zero-selection focused row as the sole native Cursor anchor', () => {
    const host = harness(2, []);
    const feature = new MainItemSelect(logger);

    feature.addWindow(host.window, new SelectionStore(), appearance);

    expect(host.selection.select).toHaveBeenCalledOnce();
    expect(host.selection.select).toHaveBeenCalledWith(2, false);
    expect(host.selectedRows()).toEqual([2]);
    expect(host.focusedRow()).toBe(2);
    feature.removeWindow(host.window);
  });

  it('preserves pre-existing native multi-selection for host interoperability', () => {
    const host = harness(2, [0, 2, 4]);
    const feature = new MainItemSelect(logger);

    feature.addWindow(host.window, new SelectionStore(), appearance);

    expect(host.selection.select).not.toHaveBeenCalled();
    expect(host.selectedRows()).toEqual([0, 2, 4]);
    feature.removeWindow(host.window);
  });

  it('fails safely when the focused row or native select seam is unavailable', () => {
    const missingCursor = harness(-1, []);
    const missingCursorFeature = new MainItemSelect(logger);
    expect(() =>
      missingCursorFeature.addWindow(missingCursor.window, new SelectionStore(), appearance),
    ).not.toThrow();
    expect(missingCursor.selection.select).not.toHaveBeenCalled();
    missingCursorFeature.removeWindow(missingCursor.window);

    const missingSelect = harness(1, [0, 1]);
    Reflect.deleteProperty(missingSelect.selection, 'select');
    const missingSelectFeature = new MainItemSelect(logger);
    expect(() =>
      missingSelectFeature.addWindow(missingSelect.window, new SelectionStore(), appearance),
    ).not.toThrow();
    expect(missingSelect.selectedRows()).toEqual([0, 1]);
    missingSelectFeature.removeWindow(missingSelect.window);
  });
});

describe('Main Visual Selection', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('reports persistent Selection visibility and compact Visual state', () => {
    expect(selectionStatusText(7, 3)).toBe('SEL 7 · 3 visible · 4 hidden');
    expect(selectionStatusText(2, 2)).toBe('SEL 2 · 2 visible');
    expect(visualStatusText(4, 7)).toBe('VISUAL 4 · SEL 7');
  });

  it('renders structured semantic status tokens with neutral and tinted containers', () => {
    const selectionHost = harness(1);
    const selectionStore = new SelectionStore();
    const neutralFeature = new MainItemSelect(logger);
    neutralFeature.addWindow(selectionHost.window, selectionStore, appearanceSource());
    selectionStore.add({ libraryID: 1, itemID: 11 });

    expect(selectionHost.badge.textContent).toBe('SEL 1 · 1 visible');
    expect(selectionHost.badgeChildren.map((child) => child.className)).toEqual([
      'zotero-neo-status-selection',
      'zotero-neo-status-detail',
    ]);
    expect(selectionHost.badge.style.cssText).toContain('background:#ECEFF4');
    expect(selectionHost.badge.style.cssText).toContain('color:#3B4252');
    neutralFeature.removeWindow(selectionHost.window);

    const visualHost = harness(1);
    const visualStore = new SelectionStore();
    const tintedFeature = new MainItemSelect(logger);
    tintedFeature.addWindow(
      visualHost.window,
      visualStore,
      appearanceSource({ 'appearance.interaction.statusStyle': 'tinted' }),
    );
    expect(tintedFeature.enter(visualHost.window, visualStore)).toBe('entered');

    expect(visualHost.badge.textContent).toBe('VISUAL 1 · SEL 0');
    expect(visualHost.badgeChildren.map((child) => child.className)).toEqual([
      'zotero-neo-status-visual',
      'zotero-neo-status-detail',
      'zotero-neo-status-selection',
      'zotero-neo-status-detail',
    ]);
    expect(visualHost.badge.style.cssText).toContain('background:#CDDCD8');
    expect(visualHost.badge.style.cssText).toContain('color:#3B4252');
    tintedFeature.removeWindow(visualHost.window);
  });

  it('does not toggle the item workset when the collection tree owns focus', () => {
    const host = harness(1);
    const collectionActive = { id: 'collection-tree-row-0' } as unknown as Element;
    const collectionRoot = {
      contains: (node: unknown) => node === collectionActive,
    } as HTMLElement;
    Reflect.set(host.window.document, 'activeElement', collectionActive);
    Reflect.set(host.window.ZoteroPane, 'collectionsView', { domEl: collectionRoot });

    const store = new SelectionStore();
    const feature = new MainItemSelect(logger);

    expect(feature.toggleCurrentTarget(host.window, store)).toBe(false);
    expect(store.empty).toBe(true);
  });

  it('reports Cursor, native multi, and Visual through one CurrentTarget contract', () => {
    const nativeHost = harness(2, [0, 2, 4]);
    const feature = new MainItemSelect(logger);
    const store = new SelectionStore();

    expect(feature.currentTarget(nativeHost.window)).toEqual({
      source: 'native-selection',
      refs: [
        { libraryID: 1, itemID: 10 },
        { libraryID: 1, itemID: 12 },
        { libraryID: 1, itemID: 14 },
      ],
    });

    nativeHost.selection.select(2);
    expect(feature.currentTarget(nativeHost.window)).toEqual({
      source: 'cursor',
      refs: [{ libraryID: 1, itemID: 12 }],
    });

    expect(feature.enter(nativeHost.window, store)).toBe('entered');
    feature.extend(nativeHost.window, 1, 1, store);
    expect(feature.currentTarget(nativeHost.window)).toEqual({
      source: 'visual',
      refs: [
        { libraryID: 1, itemID: 12 },
        { libraryID: 1, itemID: 13 },
      ],
    });
  });

  it('promotes a native multi-selection into persistent Selection with s semantics', () => {
    const host = harness(2, [0, 2, 4]);
    const store = new SelectionStore();
    const feature = new MainItemSelect(logger);

    expect(feature.toggleCurrentTarget(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([10, 12, 14]);
    expect(host.selectedRows()).toEqual([3]);
    expect(host.focusedRow()).toBe(3);

    host.selection.select(2);
    host.selection.toggleSelect(0);
    host.selection.toggleSelect(4);
    expect(feature.toggleCurrentTarget(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([]);
  });

  it('Esc-style transient cancel collapses native multi without clearing persistent Selection', () => {
    const host = harness(2, [0, 2, 4]);
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 11 });
    const feature = new MainItemSelect(logger);

    expect(feature.hasCancelableTarget(host.window)).toBe(true);
    expect(feature.cancelCurrentTarget(host.window, store)).toBe(true);
    expect(host.selectedRows()).toEqual([2]);
    expect(selectedIDs(store)).toEqual([11]);
    expect(feature.hasCancelableTarget(host.window)).toBe(false);
  });

  it('toggles Cursor items into the workset and advances without collapsing it', () => {
    const host = harness(1);
    const store = new SelectionStore();
    const feature = new MainItemSelect(logger);

    expect(feature.toggleCurrentTarget(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([11]);
    expect(host.selectedRows()).toEqual([2]);
    expect(host.focusedRow()).toBe(2);

    expect(feature.toggleCurrentTarget(host.window, store)).toBe(true);
    expect(selectedIDs(store)).toEqual([11, 12]);
    expect(host.selectedRows()).toEqual([3]);
    expect(host.focusedRow()).toBe(3);
  });

  it('grows, shrinks and swaps Visual without mutating Selection, then cancels cleanly', () => {
    const host = harness(1);
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 10 });
    store.add({ libraryID: 1, itemID: 12 });
    const feature = new MainItemSelect(logger);

    expect(feature.enter(host.window, store)).toBe('entered');
    expect(host.selectedRows()).toEqual([1]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.extend(host.window, 1, 3, store);
    expect(host.selectedRows()).toEqual([4]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.extend(host.window, -1, 2, store);
    expect(host.selectedRows()).toEqual([2]);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.swapEnds(host.window, store);
    expect(host.selectedRows()).toEqual([1]);
    expect(host.focusedRow()).toBe(1);
    expect(selectedIDs(store)).toEqual([10, 12]);

    feature.cancel(host.window, store);
    expect(selectedIDs(store)).toEqual([10, 12]);
    expect(host.selectedRows()).toEqual([1]);
    expect(host.focusedRow()).toBe(1);
    expect(host.selection.shiftSelect).not.toHaveBeenCalled();
    expect(host.selection.toggleSelect).not.toHaveBeenCalled();
  });

  it('hides empty Selection status after Visual cancel or focus loss', () => {
    const appearance = appearanceSource();

    for (const exit of ['cancel', 'leave'] as const) {
      const host = harness(1);
      const store = new SelectionStore();
      const feature = new MainItemSelect(logger);
      feature.addWindow(host.window, store, appearance);

      expect(feature.enter(host.window, store)).toBe('entered');
      expect(host.badge.textContent).toBe('VISUAL 1 · SEL 0');
      feature[exit](host.window, store);

      expect(store.empty).toBe(true);
      expect(host.badge.remove).toHaveBeenCalled();
      feature.removeWindow(host.window);
    }
  });

  it('restores persistent Selection status after Visual cancel or focus loss', () => {
    const appearance = appearanceSource();

    for (const exit of ['cancel', 'leave'] as const) {
      const host = harness(1);
      const store = new SelectionStore();
      store.add({ libraryID: 1, itemID: 10 });
      const feature = new MainItemSelect(logger);
      feature.addWindow(host.window, store, appearance);

      expect(feature.enter(host.window, store)).toBe('entered');
      feature[exit](host.window, store);

      expect(selectedIDs(store)).toEqual([10]);
      expect(host.badge.textContent).toBe('SEL 1 · 1 visible');
      expect(host.badge.remove).not.toHaveBeenCalled();
      feature.removeWindow(host.window);
    }
  });
  it('commits Visual with the all-or-none target rule', () => {
    const host = harness(1);
    const store = new SelectionStore();
    store.add({ libraryID: 1, itemID: 10 });
    store.add({ libraryID: 1, itemID: 12 });
    const feature = new MainItemSelect(logger);

    expect(feature.enter(host.window, store)).toBe('entered');
    feature.extend(host.window, 1, 2, store);
    expect(feature.finish(host.window, store)).toBe(3);
    expect(selectedIDs(store)).toEqual([10, 11, 12, 13]);
    expect(host.selectedRows()).toEqual([3]);
    expect(host.focusedRow()).toBe(3);

    expect(feature.enter(host.window, store)).toBe('entered');
    feature.extend(host.window, -1, 2, store);
    expect(feature.finish(host.window, store)).toBe(3);
    expect(selectedIDs(store)).toEqual([10]);
    expect(host.selectedRows()).toEqual([1]);
    expect(host.focusedRow()).toBe(1);
    expect(host.selection.shiftSelect).not.toHaveBeenCalled();
    expect(host.selection.toggleSelect).not.toHaveBeenCalled();
  });
});
