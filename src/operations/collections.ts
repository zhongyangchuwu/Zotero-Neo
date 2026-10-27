import { executeCollectionTransaction } from '../toolkit/main/collection-transactions';

function writableLibrary(libraryID: number): void {
  const library = Zotero.Libraries.get(libraryID);
  if (!library || !library.editable || library.archived || library.libraryType === 'feed')
    throw new Error('Collection library is read-only');
}

function currentCollection(collectionID: number): Zotero.Collection {
  const collection = Zotero.Collections.get(collectionID);
  if (!collection || collection.deleted) throw new Error('Collection target is unavailable');
  writableLibrary(collection.libraryID);
  // A collection below a trashed ancestor is not a usable target, either.
  const seen = new Set<number>([collection.id]);
  let parentID = collection.parentID;
  while (parentID) {
    if (seen.has(parentID)) throw new Error('Collection ancestry is invalid');
    seen.add(parentID);
    const parent = Zotero.Collections.get(parentID);
    if (!parent || parent.deleted || parent.libraryID !== collection.libraryID)
      throw new Error('Collection target is unavailable');
    parentID = parent.parentID;
  }
  return collection;
}

function validateParent(libraryID: number, parentID: number | false, collectionID?: number): void {
  writableLibrary(libraryID);
  if (parentID === false) return;
  let parent: Zotero.Collection | undefined = currentCollection(parentID);
  if (parent.libraryID !== libraryID) throw new Error('Collection move requires one library');
  while (parent) {
    if (parent.id === collectionID)
      throw new Error('Cannot move a collection into itself or its descendants');
    parent = parent.parentID ? currentCollection(parent.parentID) : undefined;
  }
}

function collectionName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error('Collection name cannot be empty');
  return value;
}

async function create(
  libraryID: number,
  name: string,
  parentID: number | false,
  items: readonly Zotero.Item[],
  isCurrent: () => boolean,
): Promise<number> {
  const touchedItems: Zotero.Item[] = [];
  let createdCollection: Zotero.Collection | undefined;
  try {
    return await executeCollectionTransaction(async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      validateParent(libraryID, parentID);
      const parent = parentID ? currentCollection(parentID) : undefined;
      const uniqueItems = new Map<number, Zotero.Item>();
      for (const item of items) {
        if (!item.id || Zotero.Items.get(item.id) !== item || item.deleted)
          throw new Error('Item target is unavailable');
        if (item.libraryID !== libraryID)
          throw new Error('Collection membership requires one library');
        if (!item.isTopLevelItem())
          throw new Error('Collection membership requires top-level items');
        uniqueItems.set(item.id, item);
      }
      const collection = new Zotero.Collection({ libraryID, name: collectionName(name) });
      createdCollection = collection;
      if (parentID) collection.parentID = parentID;
      // Never let a membership helper change the user's current library scope.
      const id = await collection.save({ skipSelect: true });
      if (typeof id !== 'number' || id <= 0) throw new Error('Collection was not created');
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      validateParent(libraryID, parentID);
      for (const item of uniqueItems.values()) {
        if (
          Zotero.Items.get(item.id) !== item ||
          item.deleted ||
          item.libraryID !== libraryID ||
          !item.isTopLevelItem()
        )
          throw new Error('Item target changed');
        touchedItems.push(item);
      }
      if (uniqueItems.size) await collection.addItems([...uniqueItems.keys()]);
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      validateParent(libraryID, parentID);
      if (
        currentCollection(id) !== collection ||
        collection.libraryID !== libraryID ||
        (collection.parentID || false) !== parentID ||
        (parent && currentCollection(parent.id) !== parent)
      )
        throw new Error('Collection target changed');
      for (const item of uniqueItems.values()) {
        if (
          Zotero.Items.get(item.id) !== item ||
          item.deleted ||
          item.libraryID !== libraryID ||
          !item.isTopLevelItem()
        )
          throw new Error('Item target changed');
      }
      return id;
    });
  } catch (error) {
    // Outer rollback unloads the new collection before reaching this catch.
    // Reload directly: filtered getCollections() would dereference that unloaded ID.
    const recovery = touchedItems.map((item) => item.reload(['primaryData', 'collections'], true));
    const library = Zotero.Libraries.get(libraryID);
    if (createdCollection?.id && library) recovery.push(library.updateCollections());
    const outcomes = await Promise.allSettled(recovery);
    const failures = outcomes
      .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
      .map((outcome) => outcome.reason);
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        `Collection creation failed (${String(error)}); rollback state restoration also failed`,
        { cause: error },
      );
    throw error;
  }
}

export async function createCollection(
  libraryID: number,
  name: string,
  parentID: number | false = false,
  isCurrent: () => boolean = () => true,
): Promise<number> {
  return create(libraryID, name, parentID, [], isCurrent);
}

/** Creation and assignment commit together; failure cannot leave an empty orphan collection. */
export async function createCollectionAndAdd(
  items: readonly Zotero.Item[],
  libraryID: number,
  name: string,
  parentID: number | false = false,
  isCurrent: () => boolean = () => true,
): Promise<number> {
  if (!items.length) throw new Error('No item target');
  return create(libraryID, name, parentID, items, isCurrent);
}

export async function moveCollection(
  collectionID: number,
  parentID: number | false,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  let collection: Zotero.Collection | undefined;
  let originalParentID = 0;
  try {
    return await executeCollectionTransaction(async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      collection = currentCollection(collectionID);
      originalParentID = collection.parentID || 0;
      validateParent(collection.libraryID, parentID, collectionID);
      if (originalParentID === (parentID || 0)) return false;
      // Native _setParentID normalizes a falsy value to the library root.
      collection.parentID = parentID || 0;
      await collection.save();
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      if (currentCollection(collectionID) !== collection)
        throw new Error('Collection target changed');
      return true;
    });
  } catch (error) {
    if (collection) {
      collection.parentID = originalParentID;
      await collection.reload(['primaryData'], true);
    }
    throw error;
  }
}

export async function renameCollection(
  collectionID: number,
  name: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const nextName = collectionName(name);
  let collection: Zotero.Collection | undefined;
  let originalName = '';
  try {
    return await executeCollectionTransaction(async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      collection = currentCollection(collectionID);
      originalName = collection.name;
      if (originalName === nextName) return false;
      collection.name = nextName;
      await collection.save();
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      if (currentCollection(collectionID) !== collection)
        throw new Error('Collection target changed');
      return true;
    });
  } catch (error) {
    if (collection) {
      collection.name = originalName;
      await collection.reload(['primaryData'], true);
    }
    throw error;
  }
}

/** Match native 10.0.6 deletion: trash the collection subtree, never its items. */
export async function deleteCollection(
  collectionID: number,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const snapshots: Array<{ collection: Zotero.Collection; deleted: boolean }> = [];
  try {
    await executeCollectionTransaction(async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      const collection = currentCollection(collectionID);
      snapshots.push({ collection, deleted: collection.deleted });
      for (const descendent of collection.getDescendents(false, 'collection', true)) {
        const child = Zotero.Collections.get(descendent.id);
        if (!child || child.libraryID !== collection.libraryID)
          throw new Error('Collection subtree changed');
        snapshots.push({ collection: child, deleted: child.deleted });
      }
      collection.deleted = true;
      // deleteItems is a supported native save option missing from installed declarations.
      const options: Zotero.DataObject.SaveOptions & { deleteItems: false } = {
        deleteItems: false,
      };
      await collection.save(options);
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      writableLibrary(collection.libraryID);
    });
  } catch (error) {
    for (const snapshot of snapshots) snapshot.collection.deleted = snapshot.deleted;
    await Promise.all(
      snapshots.map(({ collection }) =>
        collection.reload(['primaryData', 'childCollections'], true),
      ),
    );
    throw error;
  }
}
