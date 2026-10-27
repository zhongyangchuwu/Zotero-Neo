import { executeCollectionTransaction } from '../toolkit/main/collection-transactions';

type MembershipTransition = {
  readonly item: Zotero.Item;
  readonly collections: readonly number[];
};

function writableCollection(collectionID: number): Zotero.Collection {
  const collection = Zotero.Collections.get(collectionID);
  if (!collection || collection.deleted) throw new Error('Collection target is unavailable');
  const library = Zotero.Libraries.get(collection.libraryID);
  if (!library || !library.editable || library.archived || library.libraryType === 'feed')
    throw new Error('Collection library is read-only');
  return collection;
}

function validateItems(items: readonly Zotero.Item[], libraryID: number): Zotero.Item[] {
  const unique = new Map<number, Zotero.Item>();
  for (const item of items) {
    if (!item.id || Zotero.Items.get(item.id) !== item || item.deleted)
      throw new Error('Item target is unavailable');
    if (item.libraryID !== libraryID) throw new Error('Collection membership requires one library');
    if (!item.isTopLevelItem()) throw new Error('Collection membership requires top-level items');
    unique.set(item.id, item);
  }
  return [...unique.values()];
}

async function updateMembership(
  items: readonly Zotero.Item[],
  collectionID: number,
  present: boolean,
  sourceID: number | undefined,
  isCurrent: () => boolean,
): Promise<number> {
  const transitions: MembershipTransition[] = [];
  try {
    return await executeCollectionTransaction(async () => {
      if (!isCurrent()) throw new Error('Collection action is no longer current');
      const target = writableCollection(collectionID);
      const source = sourceID === undefined ? undefined : writableCollection(sourceID);
      if (source && source.libraryID !== target.libraryID)
        throw new Error('Collection move requires one library');
      const current = validateItems(items, target.libraryID);
      if (
        source &&
        (!current.length || current.some((item) => !item.getCollections().includes(source.id)))
      )
        throw new Error('Every item must be a direct member of the source collection');
      if (source?.id === target.id) return 0;
      for (const item of current) {
        const collections = item.getCollections();
        if (source || collections.includes(collectionID) !== present)
          transitions.push({ item, collections: [...collections] });
      }
      for (const { item } of transitions) {
        if (!isCurrent()) throw new Error('Collection action is no longer current');
        // Revalidate after each awaited save, before the next item can be changed.
        const liveTarget = writableCollection(collectionID);
        if (liveTarget !== target) throw new Error('Collection target changed');
        if (source && writableCollection(source.id) !== source)
          throw new Error('Source collection changed');
        if (
          Zotero.Items.get(item.id) !== item ||
          item.deleted ||
          item.libraryID !== target.libraryID ||
          !item.isTopLevelItem()
        )
          throw new Error('Item target changed');
        if (present) item.addToCollection(collectionID);
        else item.removeFromCollection(collectionID);
        if (source) item.removeFromCollection(source.id);
        await item.save();
        if (!isCurrent()) throw new Error('Collection action is no longer current');
        if (writableCollection(collectionID) !== target)
          throw new Error('Collection target changed');
        if (source && writableCollection(source.id) !== source)
          throw new Error('Source collection changed');
        if (
          Zotero.Items.get(item.id) !== item ||
          item.deleted ||
          item.libraryID !== target.libraryID ||
          !item.isTopLevelItem()
        )
          throw new Error('Item target changed');
      }
      // A later save can retire an earlier or already-covered target as well.
      for (const item of current) {
        if (
          Zotero.Items.get(item.id) !== item ||
          item.deleted ||
          item.libraryID !== target.libraryID ||
          !item.isTopLevelItem()
        )
          throw new Error('Item target changed');
      }
      return transitions.length;
    });
  } catch (error) {
    // Native save clears changed flags before the outer transaction commits.
    // Restore all touched objects, including earlier successfully saved objects.
    for (const { item, collections } of transitions) {
      for (const id of item.getCollections())
        if (!collections.includes(id)) item.removeFromCollection(id);
      for (const id of collections)
        if (!item.getCollections().includes(id)) item.addToCollection(id);
    }
    await Promise.all(
      transitions.map(({ item }) => item.reload(['primaryData', 'collections'], true)),
    );
    throw error;
  }
}

/** Apply changed direct memberships only, atomically, after identity and permission revalidation. */
export async function setCollectionMembership(
  items: readonly Zotero.Item[],
  collectionID: number,
  present: boolean,
  isCurrent: () => boolean = () => true,
): Promise<number> {
  return updateMembership(items, collectionID, present, undefined, isCurrent);
}

/** Move explicit direct members A→B without disturbing any other collection memberships. */
export async function moveCollectionItems(
  items: readonly Zotero.Item[],
  sourceID: number,
  targetID: number,
  isCurrent: () => boolean = () => true,
): Promise<number> {
  return updateMembership(items, targetID, true, sourceID, isCurrent);
}
