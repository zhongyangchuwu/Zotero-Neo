import { executeCollectionTransaction } from '../toolkit/main/collection-transactions';
import {
  applyCollectionMembership,
  type CollectionBatchOutcome,
  writableCollection as currentCollection,
  writableLibrary,
} from './item-collections';

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

async function saveNewCollection(
  collection: Zotero.Collection,
  parentID: number | false,
): Promise<number> {
  if (parentID) collection.parentID = parentID;
  // Creation must not change the user's current library scope.
  const id = await collection.save({ skipSelect: true });
  if (typeof id !== 'number' || id <= 0) throw new Error('Collection was not created');
  return id;
}

export async function createCollection(
  libraryID: number,
  name: string,
  parentID: number | false = false,
  isCurrent: () => boolean = () => true,
): Promise<number> {
  let collection: Zotero.Collection | undefined;
  return executeCollectionTransaction(
    async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      validateParent(libraryID, parentID);
      const parent = parentID ? currentCollection(parentID) : undefined;
      collection = new Zotero.Collection({ libraryID, name: collectionName(name) });
      const id = await saveNewCollection(collection, parentID);
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      validateParent(libraryID, parentID);
      if (
        currentCollection(id) !== collection ||
        collection.libraryID !== libraryID ||
        (collection.parentID || false) !== parentID ||
        (parent && currentCollection(parent.id) !== parent)
      )
        throw new Error('Collection target changed');
      return id;
    },
    {
      reportCommittedError: true,
      onRollback: async (error) => {
        const library = Zotero.Libraries.get(libraryID);
        if (!collection?.id || !library) return;
        try {
          await library.updateCollections();
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            'Collection creation and rollback state restoration both failed',
            { cause: error },
          );
        }
      },
    },
  );
}

/** The first successful assignment commits with creation; a zero-write batch leaves no collection. */
export async function createCollectionAndAdd(
  items: readonly Zotero.Item[],
  libraryID: number,
  name: string,
  parentID: number | false = false,
  isCurrent: () => boolean = () => true,
): Promise<CollectionBatchOutcome> {
  const value = collectionName(name);
  const parent = parentID ? currentCollection(parentID) : undefined;
  let collection: Zotero.Collection | undefined;
  return applyCollectionMembership(
    items,
    {
      libraryID,
      checkParent: () => {
        validateParent(libraryID, parentID);
        if (parent && currentCollection(parent.id) !== parent)
          throw new Error('Collection parent changed');
        if (collection && (collection.parentID || false) !== parentID)
          throw new Error('Collection target changed');
      },
      createTarget: async () => {
        collection = new Zotero.Collection({ libraryID, name: value });
        const id = await saveNewCollection(collection, parentID);
        if (collection.id !== id) throw new Error('Collection target changed');
        return collection;
      },
      recoverCreation: async () => {
        const failed = collection;
        collection = undefined;
        const library = Zotero.Libraries.get(libraryID);
        if (failed?.id && library) await library.updateCollections();
      },
    },
    isCurrent,
  );
}

export async function moveCollection(
  collectionID: number,
  parentID: number | false,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  let collection: Zotero.Collection | undefined;
  let originalParentID = 0;
  return executeCollectionTransaction(
    async () => {
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
    },
    {
      reportCommittedError: true,
      onRollback: async () => {
        if (collection) {
          collection.parentID = originalParentID;
          await collection.reload(['primaryData'], true);
        }
      },
    },
  );
}

export async function renameCollection(
  collectionID: number,
  name: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const nextName = collectionName(name);
  let collection: Zotero.Collection | undefined;
  let originalName = '';
  return executeCollectionTransaction(
    async () => {
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
    },
    {
      reportCommittedError: true,
      onRollback: async () => {
        if (collection) {
          collection.name = originalName;
          await collection.reload(['primaryData'], true);
        }
      },
    },
  );
}

/** Match native 10.0.6 deletion: trash the collection subtree, never its items. */
export async function deleteCollection(
  collectionID: number,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const snapshots: Array<{ collection: Zotero.Collection; deleted: boolean }> = [];
  await executeCollectionTransaction(
    async () => {
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
    },
    {
      reportCommittedError: true,
      onRollback: async () => {
        for (const snapshot of snapshots) snapshot.collection.deleted = snapshot.deleted;
        await Promise.all(
          snapshots.map(({ collection }) =>
            collection.reload(['primaryData', 'childCollections'], true),
          ),
        );
      },
    },
  );
}
