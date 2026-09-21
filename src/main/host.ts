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

type ItemTreeRow = {
  readonly ref?: {
    readonly id?: number;
    readonly libraryID?: number;
  };
};

type PrivateItemTree = {
  _onSelection?(
    index: number,
    shiftSelect: boolean,
    toggleSelection: boolean,
    moveFocused: boolean,
    shouldDebounce?: boolean,
  ): void;
  invalidateRow?(index: number): void;
};

type PrivateItemSelection = {
  focused?: number;
  pivot?: number;
  _updateTree?(shouldDebounce?: boolean): void;
};

type MainPane = {
  readonly collectionsView?: TreeView;
  readonly itemsView?: TreeView & {
    readonly rowCount?: number;
    setFilter?(type: 'tags', tags: ReadonlySet<string>): Promise<void> | void;
  };
  getSelectedItems?(): Zotero.Item[];
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

export function mainItem(id: number): Zotero.Item | undefined {
  const item = Zotero.Items.get(id);
  return item === false ? undefined : item;
}

export function mainSelectedItems(window: MainWindow): Zotero.Item[] {
  return mainPane(window)?.getSelectedItems?.() ?? [];
}

export function mainItemRefAtRow(window: MainWindow, index: number): ItemRef | undefined {
  const row = mainPane(window)?.itemsView?.getRow?.(index) as ItemTreeRow | undefined;
  const id = row?.ref?.id;
  const libraryID = row?.ref?.libraryID;
  if (!Number.isInteger(id) || !Number.isInteger(libraryID)) return undefined;
  return { itemID: id as number, libraryID: libraryID as number };
}

export function mainCursorItemRef(window: MainWindow): ItemRef | undefined {
  const view = mainPane(window)?.itemsView;
  const focused = view?.selection?.focused;
  return typeof focused === 'number' ? mainItemRefAtRow(window, focused) : undefined;
}

export function visibleMainItemRefs(window: MainWindow): readonly ItemRef[] {
  const view = mainPane(window)?.itemsView;
  const count = view?.rowCount ?? 0;
  const refs: ItemRef[] = [];
  for (let index = 0; index < count; index += 1) {
    const ref = mainItemRefAtRow(window, index);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function mainItemRowIndex(window: MainWindow, itemID: number): number | undefined {
  const row = mainPane(window)?.itemsView?.getRowIndexByID?.(String(itemID));
  return typeof row === 'number' && row >= 0 ? row : undefined;
}

/**
 * Move only the focused item row without mutating native TreeSelection membership.
 *
 * Zotero's VirtualizedTable exposes this behavior through its private _onSelection()
 * moveFocused path. Keep the seam here so version changes fail closed rather than
 * falling back to selection.select(), which would collapse an explicit workset.
 */
export function moveMainItemCursor(
  window: MainWindow,
  index: number,
  shouldDebounce = false,
): boolean {
  const view = mainPane(window)?.itemsView;
  const selection = view?.selection as PrivateItemSelection | undefined;
  if (!view || !selection || index < 0 || index >= (view.rowCount ?? 0)) return false;

  const tree = view.tree as (PrivateItemTree & { focus?(): void }) | undefined;
  if (tree?._onSelection) {
    tree._onSelection(index, false, false, true, shouldDebounce);
    return true;
  }

  if (typeof selection._updateTree !== 'function') return false;
  const previous = selection.focused;
  selection.focused = index;
  selection.pivot = index;
  if (typeof previous === 'number') tree?.invalidateRow?.(previous);
  tree?.invalidateRow?.(index);
  selection._updateTree(shouldDebounce);
  view.ensureRowIsVisible?.(index);
  return true;
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
