import type { MainWindow } from '../../core/contracts';
import { mainItem, mainPane, mainScopeSelectedIDs } from './host';
import { mainTreeFocused } from './tree';

export interface MainCollectionRef {
  readonly id: number;
  readonly libraryID: number;
  readonly name: string;
  readonly parentID: number | false;
  readonly path: string;
}

export interface MainCollectionLibrary {
  readonly libraryID: number;
  readonly name: string;
  readonly editable: boolean;
}

type ScopeRow = {
  readonly id?: string;
  readonly ref?: { readonly libraryID?: number };
};

type CollectionView = {
  readonly _filter?: string;
  readonly selection?: {
    readonly count?: number;
    readonly focused?: number;
    readonly selectEventsSuppressed?: boolean;
    select?(row: number, debounce?: boolean): void;
  };
  getRow?(row: number): ScopeRow | undefined;
  getRowIndexByID?(id: string): number | false;
  expandToCollection?(id: number): Promise<unknown>;
  setFilter?(text: string): Promise<void>;
  ensureRowIsVisible?(row: number): void;
};

type ItemView = {
  readonly collectionTreeRows?: readonly ScopeRow[];
  waitForLoad?(): Promise<void>;
};
type CollectionPane = {
  readonly collectionsView?: CollectionView;
  readonly itemsView?: ItemView;
  onCollectionSelected?(): Promise<void>;
};
type NativeSearch = Zotero.Search & {
  getSQL(): Promise<string>;
  getSQLParams(): Promise<Array<string | number> | false>;
};

function collectionView(window: MainWindow): CollectionView | undefined {
  return mainPane(window)?.collectionsView as CollectionView | undefined;
}

export function mainLibraryWritable(libraryID: number): boolean {
  if (!Number.isInteger(libraryID) || libraryID <= 0) return false;
  const library = Zotero.Libraries.get(libraryID);
  return (
    !!library && library.editable === true && !library.archived && library.libraryType !== 'feed'
  );
}

export function mainCollectionRef(collectionID: number): MainCollectionRef | undefined {
  const collection = Zotero.Collections.get(collectionID);
  if (!collection || collection.deleted) return undefined;
  const names = [collection.name];
  const seen = new Set<number>([collection.id]);
  let parentID = collection.parentID;
  while (parentID) {
    if (seen.has(parentID)) return undefined;
    seen.add(parentID);
    const parent = Zotero.Collections.get(parentID);
    if (!parent || parent.deleted || parent.libraryID !== collection.libraryID) return undefined;
    names.unshift(parent.name);
    parentID = parent.parentID;
  }
  return {
    id: collection.id,
    libraryID: collection.libraryID,
    name: collection.name,
    parentID: collection.parentID || false,
    path: names.join(' / '),
  };
}

export function mainCollectionRefs(libraryID: number): readonly MainCollectionRef[] {
  return Zotero.Collections.getByLibrary(libraryID, true)
    .filter((collection) => collection.libraryID === libraryID)
    .map((collection) => mainCollectionRef(collection.id))
    .filter((collection): collection is MainCollectionRef => !!collection);
}

function collectionForScope(id: string | undefined): MainCollectionRef | undefined {
  if (!id || !/^C\d+$/.test(id)) return undefined;
  return mainCollectionRef(Number(id.slice(1)));
}

export function mainActiveCollection(window: MainWindow): MainCollectionRef | undefined {
  const view = collectionView(window);
  const ids = mainScopeSelectedIDs(window);
  if (view?.selection?.count !== 1 || ids.length !== 1) return undefined;
  return collectionForScope(ids[0]);
}

export function mainCursorCollection(window: MainWindow): MainCollectionRef | undefined {
  const view = collectionView(window);
  const row = view?.selection?.focused;
  return row !== undefined && row >= 0 ? collectionForScope(view?.getRow?.(row)?.id) : undefined;
}

export function mainCollectionLibrary(window: MainWindow): MainCollectionLibrary | undefined {
  const view = collectionView(window);
  let row: ScopeRow | undefined;
  if (mainTreeFocused(window, 'collections')) {
    const focused = view?.selection?.focused;
    if (focused !== undefined && focused >= 0) row = view?.getRow?.(focused);
  } else {
    const ids = mainScopeSelectedIDs(window);
    if (view?.selection?.count !== 1 || ids.length !== 1) return undefined;
    const index = view.getRowIndexByID?.(ids[0]!);
    if (typeof index === 'number' && index >= 0) row = view.getRow?.(index);
  }
  const libraryID = row?.ref?.libraryID;
  if (!libraryID) return undefined;
  const library = Zotero.Libraries.get(libraryID);
  if (!library || library.libraryType === 'feed') return undefined;
  return { libraryID, name: library.name, editable: mainLibraryWritable(libraryID) };
}

/** Native modal prompt; cancellation does not mutate or navigate. */
export function promptMainCollectionName(
  window: MainWindow,
  title: string,
  initial: string,
): string | undefined {
  const value = { value: initial };
  const accepted = Services.prompt.prompt(
    window as unknown as Parameters<typeof Services.prompt.prompt>[0],
    title,
    Zotero.getString('new-collection-name'),
    value,
    '',
    { value: false },
  );
  return accepted ? value.value.trim() : undefined;
}

export function confirmMainCollectionAction(
  window: MainWindow,
  title: string,
  message: string,
): boolean {
  return Services.prompt.confirm(
    window as unknown as Parameters<typeof Services.prompt.confirm>[0],
    title,
    message,
  );
}

/** Compile native title/creator/year matching, but bound IDs before loading any item objects. */
export async function queryMainCollectionItems(
  libraryID: number,
  query: string,
  limit: number,
): Promise<readonly Zotero.Item[]> {
  if (!Number.isInteger(limit) || limit < 1 || !Zotero.Libraries.get(libraryID)) return [];
  const search = new Zotero.Search() as NativeSearch;
  search.addCondition('libraryID', 'is', libraryID);
  search.addCondition('deleted', 'false');
  search.addCondition('noChildren', 'true');
  for (const type of ['attachment', 'note', 'annotation'])
    search.addCondition('itemType', 'isNot', type);
  if (query.trim()) search.addCondition('quicksearch-titleCreatorYear', 'contains', query.trim());
  const sql = await search.getSQL();
  const params = await search.getSQLParams();
  const ids = await Zotero.DB.columnQueryAsync<number>(
    `SELECT itemID FROM (${sql}) ORDER BY itemID LIMIT ?`,
    [...(params || []), Math.min(limit, 200)],
  );
  if (!ids.length) return [];
  const items = await Zotero.Items.getAsync(ids);
  const candidates = items.filter(
    (item) =>
      item.libraryID === libraryID &&
      !item.deleted &&
      item.isRegularItem() &&
      item.isTopLevelItem(),
  );
  // getAsync() loads primary data only on cold items. Load just the bounded
  // candidates' fields, creators and memberships before Picker projection.
  if (candidates.length)
    await Zotero.Items.loadDataTypes(candidates, ['creators', 'itemData', 'collections']);
  return candidates;
}

function collectionCandidate(itemID: number, libraryID: number): Zotero.Item | undefined {
  const item = mainItem(itemID);
  return item &&
    item.libraryID === libraryID &&
    !item.deleted &&
    item.isRegularItem() &&
    item.isTopLevelItem()
    ? item
    : undefined;
}

/** Load only the confirmed item: native Main rendering also requires child-item data for numNotes. */
export async function prepareMainCollectionItem(
  itemID: number,
  libraryID: number,
): Promise<Zotero.Item> {
  const item = collectionCandidate(itemID, libraryID);
  if (!item) throw new Error('Item is no longer available in this library');
  await item.loadAllData();
  if (collectionCandidate(itemID, libraryID) !== item)
    throw new Error('Item is no longer available in this library');
  return item;
}

export async function waitForMainItemView(
  window: MainWindow,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false;
  const view = mainPane(window)?.itemsView as ItemView | undefined;
  if (!view?.waitForLoad) return false;
  await view.waitForLoad();
  return isCurrent() && mainPane(window)?.itemsView === view;
}

export async function selectMainScope(
  window: MainWindow,
  id: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const pane = mainPane(window) as CollectionPane | undefined;
  const view = pane?.collectionsView;
  if (
    !view ||
    !pane?.onCollectionSelected ||
    !isCurrent() ||
    view.selection?.selectEventsSuppressed
  )
    return false;
  const row = view.getRowIndexByID?.(id);
  if (typeof row !== 'number' || row < 0) return false;
  const selected = mainScopeSelectedIDs(window);
  if (view.selection?.count !== 1 || selected.length !== 1 || selected[0] !== id) {
    if (!view.selection?.select) return false;
    view.selection.select(row, false);
  }
  if (!isCurrent() || mainPane(window) !== pane || collectionView(window) !== view) return false;
  // Selection may already name the target while its native handler is still
  // debounced or queued. Await the pane's serial handler, not an unrelated
  // collection-tree select event or the previously loaded item view.
  await pane.onCollectionSelected();
  if (!isCurrent() || mainPane(window) !== pane || collectionView(window) !== view) return false;
  if (!(await waitForMainItemView(window, isCurrent))) return false;
  const ids = mainScopeSelectedIDs(window);
  const itemScopes = pane.itemsView?.collectionTreeRows;
  if (
    !isCurrent() ||
    view.selection?.count !== 1 ||
    ids.length !== 1 ||
    ids[0] !== id ||
    itemScopes?.length !== 1 ||
    itemScopes[0]?.id !== id
  )
    return false;
  const currentRow = view.getRowIndexByID?.(id);
  if (typeof currentRow === 'number' && currentRow >= 0) view.ensureRowIsVisible?.(currentRow);
  return true;
}

/** Confirmation-only navigation: reveal ancestors and retire the native collection filter. */
export async function selectMainCollection(
  window: MainWindow,
  collectionID: number,
  isCurrent: () => boolean,
): Promise<boolean> {
  const view = collectionView(window);
  if (!view || !isCurrent() || !mainCollectionRef(collectionID)) return false;
  if (view._filter) {
    if (!view.setFilter) return false;
    const field = window.document.getElementById('zotero-collections-search') as
      | (HTMLElement & { value?: string })
      | null;
    if (field) field.value = '';
    await view.setFilter('');
    if (!isCurrent() || collectionView(window) !== view || !mainCollectionRef(collectionID))
      return false;
  }
  if (!view.expandToCollection) return false;
  await view.expandToCollection(collectionID);
  if (!isCurrent() || collectionView(window) !== view || !mainCollectionRef(collectionID))
    return false;
  return selectMainScope(window, `C${collectionID}`, isCurrent);
}

/** Capture a native scope identity synchronously; rows may move before queued selection starts. */
export function mainScopeCursorID(window: MainWindow): string | undefined {
  const view = collectionView(window);
  const row = view?.selection?.focused;
  return row !== undefined && row >= 0 ? view?.getRow?.(row)?.id : undefined;
}
