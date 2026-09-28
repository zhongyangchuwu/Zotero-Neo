function collectionIDs(item: Zotero.Item): readonly number[] {
  try {
    return item.getCollections?.() ?? [];
  } catch {
    return [];
  }
}

type MembershipTransition = {
  readonly item: Zotero.Item;
  readonly wasMember: boolean;
};

/** Apply one collection-membership transition in a single Zotero transaction. */
export async function setCollectionMembership(
  items: readonly Zotero.Item[],
  collectionID: number,
  present: boolean,
): Promise<number> {
  const transitions: MembershipTransition[] = [];
  for (const item of items) {
    const wasMember = collectionIDs(item).includes(collectionID);
    if (wasMember === present) continue;
    transitions.push({ item, wasMember });
  }
  if (!transitions.length) return 0;

  try {
    await Zotero.DB.executeTransaction(async () => {
      for (const { item } of transitions) {
        if (present) item.addToCollection(collectionID);
        else item.removeFromCollection(collectionID);
        await item.save();
      }
    });
  } catch (error) {
    for (const { item, wasMember } of transitions) {
      const isMember = collectionIDs(item).includes(collectionID);
      if (isMember === wasMember) continue;
      if (wasMember) item.addToCollection(collectionID);
      else item.removeFromCollection(collectionID);
    }
    throw error;
  }

  return transitions.length;
}
