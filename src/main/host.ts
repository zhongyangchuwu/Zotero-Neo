import type { MainWindow } from '../core/contracts';
import type { TreeView } from './navigation';
import type { ItemRef } from './selection-store';

export type TagJson = _ZoteroTypes.Tags.TagJson;

type MainTab = {
  readonly id?: string;
  readonly tabID?: string;
  readonly title?: string;
  readonly label?: string;
  readonly type?: string;
  readonly dataset?: DOMStringMap;
};

type MainTabInfo = {
  readonly id?: string;
  readonly type?: string;
  readonly subType?: string;
  readonly data?: { readonly itemID?: number };
};

type TagScopeRow = {
  readonly ref?: { readonly libraryID?: number };
  readonly tags?: Iterable<string>;
  readonly searchText?: string;
  readonly advancedSearch?: unknown;
  getTags?(): Promise<readonly TagJson[]>;
};

type MainTabs = {
  readonly selectedID?: string;
  readonly _selectedID?: string;
  readonly _tabs?: readonly MainTab[];
  readonly tabs?: readonly MainTab[];
  close?(id?: string): void;
  selectNext?(): void;
  selectPrev?(): void;
  select?(id: string): void;
  selectTab?(id: string): void;
  showTab?(id: string): void;
  getTabInfo?(id?: string): MainTabInfo;
};

type MainPane = {
  readonly collectionsView?: TreeView;
  readonly itemsView?: TreeView & {
    readonly rowCount?: number;
    setFilter?(type: 'tags', tags: ReadonlySet<string>): Promise<void> | void;
  };
  getSelectedItems?(): Zotero.Item[];
  toggleAdvancedSearchState?(state: 'open' | 'collapsed' | 'closed'): Promise<void> | void;
  openAdvancedSearchFromQuickSearch?(text: string, mode?: string): Promise<void> | void;
  selectItem?(id: number): Promise<void> | void;
  viewAttachment?(id: number): void;
  openNote?(id: number, options?: { openInWindow: boolean }): Promise<void> | void;
  loadURI?(uri: string): void;
  getCollectionTreeRow?(): TagScopeRow | undefined;
  tagSelector?: {
    getTagSelection?(): ReadonlySet<string>;
    selectedTags?: Set<string>;
  } | null;
};

type MainQuickSearch = HTMLElement & {
  readonly searchTextbox?: {
    readonly value?: string;
    select?(): void;
    focus?(): void;
  };
  readonly value?: string;
};

export interface MainViewFilterState {
  readonly quickSearchText: string;
  readonly tags: readonly string[];
  readonly advancedSearch: boolean;
}

type ScopeCursorTree = {
  _onSelection?(
    index: number,
    shiftSelect: boolean,
    toggleSelection: boolean,
    moveFocused: boolean,
    shouldDebounce?: boolean,
  ): void;
};

type ScopeCursorView = {
  readonly rowCount?: number;
  readonly tree?: ScopeCursorTree;
  readonly selection?: {
    readonly focused?: number;
    readonly selected?: Iterable<number>;
    readonly count?: number;
    select?(index: number, shouldDebounce?: boolean): boolean | void;
    toggleSelect?(index: number, shouldDebounce?: boolean): void;
  };
  ensureRowIsVisible?(index: number): void;
};

type ItemCursorTree = {
  _onSelection?(
    index: number,
    shiftSelect: boolean,
    toggleSelection: boolean,
    moveFocused: boolean,
    shouldDebounce?: boolean,
  ): void;
};

type ItemTreeRow = {
  readonly isObjectRow?: boolean;
  readonly ref?: Zotero.Item;
};

type MainEventBinding = {
  addListener(listener: () => void | Promise<void>): void;
  removeListener(listener: () => void | Promise<void>): void;
};

type ItemCursorView = {
  readonly rowCount?: number;
  readonly tree?: ItemCursorTree;
  readonly onSelect?: MainEventBinding;
  readonly onRefresh?: MainEventBinding;
  readonly _loadingDeferredResolved?: boolean;
  readonly selection?: {
    readonly focused?: number;
    select?(index: number, shouldDebounce?: boolean): boolean | void;
    toggleSelect?(index: number, shouldDebounce?: boolean): void;
    clearSelection?(shouldDebounce?: boolean): void;
    shiftSelect?(index: number, augment: boolean, shouldDebounce?: boolean): void;
  };
  getRow?(index: number): ItemTreeRow | undefined;
  getRowIndexByID?(id: number): number | false;
  ensureRowIsVisible?(index: number): void;
};

type ContextNoteEditor = {
  readonly item?: Zotero.Item;
  readonly _iframe?: { readonly contentWindow?: Window };
  contains?(node: Node | null): boolean;
};

/** Minimal registry entry exposed by Zotero's main-window tab lookup; not a Reader runtime. */
type MainReaderRegistryEntry = { readonly itemID?: number; focus?(): void | Promise<void> };

export type MainHostWindow = MainWindow & {
  readonly ZoteroPane?: MainPane;
  readonly Zotero_Tabs?: MainTabs;
  readonly ZoteroContextPane?: {
    focus?(): boolean | void;
    activeEditor?: ContextNoteEditor;
  };
};

/** Narrows Zotero's private main-window APIs without conflating them with Reader/PDF hosts. */
export function mainHost(window: MainWindow): MainHostWindow {
  return window as MainHostWindow;
}

export function mainTabs(window: MainWindow): MainTabs | undefined {
  return mainHost(window).Zotero_Tabs;
}

export function selectedMainTabID(window: MainWindow): string | undefined {
  const tabs = mainTabs(window);
  return tabs?.selectedID ?? tabs?._selectedID;
}

export function selectedMainTabInfo(window: MainWindow): MainTabInfo | undefined {
  const tabs = mainTabs(window);
  return tabs?.getTabInfo?.(selectedMainTabID(window));
}

export function mainTabList(window: MainWindow): readonly MainTab[] {
  const tabs = mainTabs(window);
  return tabs?._tabs ?? tabs?.tabs ?? [];
}

export function selectMainTab(window: MainWindow, id: string): void {
  const tabs = mainTabs(window);
  const select = tabs?.select ?? tabs?.selectTab ?? tabs?.showTab;
  select?.call(tabs, id);
}

export function cycleMainTab(window: MainWindow, direction: 1 | -1): void {
  const tabs = mainTabs(window);
  if (!tabs) return;
  if (direction < 0 && tabs.selectPrev) tabs.selectPrev();
  else if (direction > 0 && tabs.selectNext) tabs.selectNext();
  else {
    const ids = mainTabList(window)
      .map((tab) => tab.id ?? tab.tabID ?? tab.dataset?.id)
      .filter((id): id is string => !!id);
    const index = ids.indexOf(selectedMainTabID(window) ?? '');
    const next = ids[(index + direction + ids.length) % ids.length];
    if (next) selectMainTab(window, next);
  }
}

export function closeSelectedMainTab(window: MainWindow): void {
  const tabs = mainTabs(window);
  tabs?.close?.(selectedMainTabID(window));
}

export function mainPane(window: MainWindow): MainPane | undefined {
  return mainHost(window).ZoteroPane;
}

function mainQuickSearch(window: MainWindow): MainQuickSearch | undefined {
  return (
    (window.document.getElementById('zotero-tb-search') as MainQuickSearch | null) ?? undefined
  );
}

export function mainViewFilterState(window: MainWindow): MainViewFilterState {
  const row = mainPane(window)?.getCollectionTreeRow?.();
  const quick = mainQuickSearch(window);
  const quickSearchText = String(
    quick?.value ?? quick?.searchTextbox?.value ?? row?.searchText ?? '',
  );
  return {
    quickSearchText,
    tags: currentTagSelection(window),
    advancedSearch: !!row?.advancedSearch,
  };
}

export function focusMainQuickSearch(window: MainWindow): boolean {
  const textbox = mainQuickSearch(window)?.searchTextbox;
  if (!textbox?.select) return false;
  textbox.select();
  return true;
}

export async function openMainAdvancedSearch(window: MainWindow): Promise<boolean> {
  const pane = mainPane(window);
  if (!pane) return false;
  const quick = mainQuickSearch(window);
  const text = String(quick?.value ?? quick?.searchTextbox?.value ?? '').trim();

  if (text && pane.openAdvancedSearchFromQuickSearch) {
    let mode = 'fields';
    try {
      mode = String(Zotero.Prefs.get('search.quicksearch-mode') ?? mode);
    } catch {}
    await pane.openAdvancedSearchFromQuickSearch(text, mode);
    return true;
  }

  if (!pane.toggleAdvancedSearchState) return false;
  await pane.toggleAdvancedSearchState('open');
  return true;
}


function mainScopeView(window: MainWindow): ScopeCursorView | undefined {
  return mainPane(window)?.collectionsView as unknown as ScopeCursorView | undefined;
}

export function mainScopeCursorRow(window: MainWindow): number | undefined {
  return mainScopeView(window)?.selection?.focused;
}

export function mainScopeSelectedRows(window: MainWindow): number[] {
  const selection = mainScopeView(window)?.selection;
  if (!selection) return [];
  if (selection.selected) return [...selection.selected].filter((row) => Number.isInteger(row));
  const focused = selection.focused;
  return selection.count && focused !== undefined ? [focused] : [];
}

export function mainScopeCursorDetached(window: MainWindow): boolean {
  const focused = mainScopeCursorRow(window);
  return focused !== undefined && !mainScopeSelectedRows(window).includes(focused);
}

export function moveMainScopeCursor(
  window: MainWindow,
  index: number,
  shouldDebounce = false,
): boolean {
  const view = mainScopeView(window);
  const last = Math.max(0, (view?.rowCount ?? 1) - 1);
  if (!view?.tree?._onSelection || index < 0 || index > last) return false;
  view.tree._onSelection(index, false, false, true, shouldDebounce);
  view.ensureRowIsVisible?.(index);
  return true;
}

export function toggleMainScopeAtCursor(
  window: MainWindow,
  shouldDebounce = false,
): boolean {
  const view = mainScopeView(window);
  const focused = view?.selection?.focused;
  if (focused === undefined || !view?.selection?.toggleSelect) return false;
  const selected = mainScopeSelectedRows(window);
  if (selected.length === 1 && selected[0] === focused) return false;
  view.selection.toggleSelect(focused, shouldDebounce);
  return true;
}

export function selectOnlyMainScopeCursor(
  window: MainWindow,
  shouldDebounce = false,
): boolean {
  const view = mainScopeView(window);
  const focused = view?.selection?.focused;
  if (focused === undefined || !view?.selection?.select) return false;
  const selected = mainScopeSelectedRows(window);
  if (selected.length === 1 && selected[0] === focused) return false;
  view.selection.select(focused, shouldDebounce);
  return true;
}

/**
 * Move the item-tree focus without changing native selected rows.
 *
 * Zotero's virtualized table exposes this behavior through its private
 * _onSelection(..., moveFocused=true) seam. Keep that dependency isolated here
 * so a host-version change does not leak into navigation semantics.
 */
export function mainItemRefAtRow(window: MainWindow, index: number): ItemRef | undefined {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const row = view?.getRow?.(index);
  const item = row?.ref;
  if (!item || row?.isObjectRow === false) return undefined;
  if (!Number.isInteger(item.id) || item.id <= 0) return undefined;
  if (!Number.isInteger(item.libraryID) || item.libraryID <= 0) return undefined;
  return { libraryID: item.libraryID, itemID: item.id };
}

export function currentMainItemCursorRef(window: MainWindow): ItemRef | undefined {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const focused = view?.selection?.focused;
  return focused === undefined ? undefined : mainItemRefAtRow(window, focused);
}

export function mainItemRowForRef(window: MainWindow, ref: ItemRef): number | undefined {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const index = view?.getRowIndexByID?.(ref.itemID);
  if (index === undefined || index === false || index < 0) return undefined;
  const visible = mainItemRefAtRow(window, index);
  if (!visible || visible.itemID !== ref.itemID || visible.libraryID !== ref.libraryID)
    return undefined;
  return index;
}

export function visibleMainSelectionCount(window: MainWindow, refs: readonly ItemRef[]): number {
  let count = 0;
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.libraryID}:${ref.itemID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (mainItemRowForRef(window, ref) !== undefined) count += 1;
  }
  return count;
}

export function mainItemCursorRow(window: MainWindow): number | undefined {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const focused = view?.selection?.focused;
  return focused === undefined ? undefined : focused;
}

export function mainItemViewSettled(window: MainWindow): boolean {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  return view?._loadingDeferredResolved !== false;
}

export function observeMainItemView(
  window: MainWindow,
  handlers: {
    readonly onSelect?: () => void | Promise<void>;
    readonly onRefresh?: () => void | Promise<void>;
  },
): () => void {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const select = handlers.onSelect;
  const refresh = handlers.onRefresh;

  if (select) view?.onSelect?.addListener(select);
  if (refresh) view?.onRefresh?.addListener(refresh);

  return () => {
    if (select) view?.onSelect?.removeListener(select);
    if (refresh) view?.onRefresh?.removeListener(refresh);
  };
}

export function mainItemRowCount(window: MainWindow): number {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  return Math.max(0, view?.rowCount ?? 0);
}

export function showMainVisualRange(
  window: MainWindow,
  anchor: ItemRef,
  head: ItemRef,
  shouldDebounce = false,
): number | undefined {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const selection = view?.selection;
  const anchorRow = mainItemRowForRef(window, anchor);
  const headRow = mainItemRowForRef(window, head);
  if (
    anchorRow === undefined ||
    headRow === undefined ||
    !selection?.select ||
    !selection.shiftSelect
  )
    return undefined;

  selection.select(anchorRow, shouldDebounce);
  selection.shiftSelect(headRow, false, shouldDebounce);
  view?.ensureRowIsVisible?.(headRow);
  return Math.abs(headRow - anchorRow) + 1;
}

export function projectMainSelection(
  window: MainWindow,
  refs: readonly ItemRef[],
  cursor?: ItemRef,
  shouldDebounce = false,
): number {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const selection = view?.selection;
  if (!selection) return 0;

  const rows = [
    ...new Set(
      refs
        .map((ref) => mainItemRowForRef(window, ref))
        .filter((row): row is number => row !== undefined),
    ),
  ].sort((left, right) => left - right);

  if (!rows.length) selection.clearSelection?.(shouldDebounce);
  else if (selection.select) {
    selection.select(rows[0]!, shouldDebounce);
    for (const row of rows.slice(1)) {
      if (selection.toggleSelect) selection.toggleSelect(row, shouldDebounce);
      else view?.tree?._onSelection?.(row, false, true, false, shouldDebounce);
    }
  }

  if (cursor) restoreMainItemCursor(window, cursor, shouldDebounce);
  return rows.length;
}

export function moveMainItemCursor(
  window: MainWindow,
  index: number,
  shouldDebounce = false,
): boolean {
  const view = mainPane(window)?.itemsView as unknown as ItemCursorView | undefined;
  const move = view?.tree?._onSelection;
  const rowCount = view?.rowCount ?? 0;
  if (!move || rowCount <= 0) return false;

  const next = Math.max(0, Math.min(rowCount - 1, index));
  move.call(view.tree, next, false, false, true, shouldDebounce);
  view.ensureRowIsVisible?.(next);
  return true;
}

export function restoreMainItemCursor(
  window: MainWindow,
  ref: ItemRef,
  shouldDebounce = false,
): boolean {
  const row = mainItemRowForRef(window, ref);
  return row === undefined ? false : moveMainItemCursor(window, row, shouldDebounce);
}

export function mainItem(id: number): Zotero.Item | undefined {
  const item = Zotero.Items.get(id);
  return item === false ? undefined : item;
}

export function mainSelectedItems(window: MainWindow): Zotero.Item[] {
  return mainPane(window)?.getSelectedItems?.() ?? [];
}

/**
 * Looks up only the active tab's lightweight registry entry for main-window item context,
 * tab detection, and focus handoff. Reader lifecycle and PDF content remain in reader/.
 */
export function mainReaderForTab(tabID: string): MainReaderRegistryEntry | null {
  try {
    return (
      (
        Zotero.Reader as unknown as {
          getByTabID?(id: string): MainReaderRegistryEntry | null;
        }
      ).getByTabID?.(tabID) ?? null
    );
  } catch {
    return null;
  }
}

/** Prefers the active Reader item, then the selected main-window item. */
export function currentMainItem(window: MainWindow): Zotero.Item | undefined {
  const tabID = selectedMainTabID(window);
  const reader = tabID ? mainReaderForTab(tabID) : null;
  try {
    if (reader?.itemID) {
      const item = Zotero.Items.get(reader.itemID);
      if (item !== false) return item;
    }
  } catch {
    // Fall through to the selected main-window item.
  }
  return mainSelectedItems(window)[0];
}

/** Mirrors Zotero's own focused-context-note test instead of treating any open note as active. */
export function activeContextNoteItem(window: MainWindow): Zotero.Item | undefined {
  const editor = mainHost(window).ZoteroContextPane?.activeEditor;
  const active = window.document?.activeElement ?? null;
  if (!editor?.item || !active || !editor.contains?.(active)) return undefined;
  return editor.item;
}

export function currentTagSelection(window: MainWindow): string[] {
  const pane = mainPane(window);
  // The collection row carries the active filter; native selector state is only its fallback.
  const selected =
    pane?.getCollectionTreeRow?.()?.tags ?? pane?.tagSelector?.getTagSelection?.() ?? [];
  return [...new Set([...selected].filter((tag): tag is string => typeof tag === 'string'))];
}

export async function applyMainTagFilter(
  window: MainWindow,
  tags: readonly string[],
): Promise<number> {
  const pane = mainPane(window);
  if (!pane?.itemsView?.setFilter) throw new Error('Zotero item tag filtering is unavailable');
  await pane.itemsView.setFilter('tags', new Set(tags));
  if (pane.tagSelector?.selectedTags) pane.tagSelector.selectedTags = new Set(tags);
  return pane.itemsView.rowCount ?? 0;
}
export function activeContextEditorWindow(window: MainWindow): Window | undefined {
  return mainHost(window).ZoteroContextPane?.activeEditor?._iframe?.contentWindow;
}
