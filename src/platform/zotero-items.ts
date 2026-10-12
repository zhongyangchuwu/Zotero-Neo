export function zoteroItem(itemID: number): Zotero.Item | undefined {
  const item = Zotero.Items.get(itemID);
  return item === false ? undefined : item;
}

/** Stable actual ownership used by Notes Preview and confirmation revalidation. */
export function noteOwnerKey(note: Zotero.Item): string {
  const parent = note.parentItemID;
  return typeof parent === 'number' && Number.isInteger(parent) && parent > 0
    ? `library:${note.libraryID}:item:${parent}`
    : `library:${note.libraryID}:note:${note.id}`;
}

function fallbackTopLevel(item: Zotero.Item): Zotero.Item {
  if ((item.isAttachment?.() || item.isNote?.()) && item.parentItemID) {
    return zoteroItem(item.parentItemID) ?? item;
  }
  return item;
}

/**
 * Shared domain normalization for item operations.
 *
 * Surface target resolvers stay local; only top-level normalization and
 * identity deduplication are shared here.
 */
export function normalizeTopLevelItemTargets(items: readonly Zotero.Item[]): Zotero.Item[] {
  let normalized: Zotero.Item[];
  const keepTopLevel = (
    Zotero.Items as unknown as {
      keepTopLevel?(items: Zotero.Item[]): Zotero.Item[];
    }
  ).keepTopLevel;

  try {
    normalized = keepTopLevel ? keepTopLevel([...items]) : items.map(fallbackTopLevel);
  } catch {
    normalized = items.map(fallbackTopLevel);
  }

  const byRef = new Map<string, Zotero.Item>();
  for (const item of normalized) {
    const topLevel = fallbackTopLevel(item);
    byRef.set(`${topLevel.libraryID}:${topLevel.id}`, topLevel);
  }
  return [...byRef.values()];
}
