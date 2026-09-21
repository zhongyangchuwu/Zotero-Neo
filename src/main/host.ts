import type { MainWindow } from '../core/contracts';
import type { TreeView } from './navigation';

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


type ItemCursorTree = {
  _onSelection?(
    index: number,
    shiftSelect: boolean,
    toggleSelection: boolean,
    moveFocused: boolean,
    shouldDebounce?: boolean,
  ): void;
};

type ItemCursorView = {
  readonly rowCount?: number;
  readonly tree?: ItemCursorTree;
  readonly selection?: {
    readonly focused?: number;
  };
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


/**
 * Move the item-tree focus without changing native selected rows.
 *
 * Zotero's virtualized table exposes this behavior through its private
 * _onSelection(..., moveFocused=true) seam. Keep that dependency isolated here
 * so a host-version change does not leak into navigation semantics.
 */
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
