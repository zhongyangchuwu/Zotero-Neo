type TagTransition = {
  readonly item: Zotero.Item;
  readonly previousType: number;
};

/** Apply one tag-presence operation to an explicit item target set. */
export async function setItemTag(
  items: readonly Zotero.Item[],
  tag: string,
  present: boolean,
): Promise<number> {
  const name = tag.trim();
  if (!name) throw new Error('Tag name is empty');

  const transitions: TagTransition[] = [];
  for (const item of items) {
    const hadTag = item.hasTag(name);
    if (hadTag === present) continue;
    transitions.push({
      item,
      previousType: hadTag ? (item.getTagType(name) ?? 0) : 0,
    });
  }
  if (!transitions.length) return 0;

  try {
    await Zotero.DB.executeTransaction(async () => {
      for (const transition of transitions) {
        const { item } = transition;
        const changed = present ? item.addTag(name, 0) : item.removeTag(name);
        if (changed) await item.save();
      }
    });
  } catch (error) {
    for (const { item, previousType } of transitions) {
      if (present) {
        if (item.hasTag(name)) item.removeTag(name);
      } else if (!item.hasTag(name)) {
        item.addTag(name, previousType);
      }
    }
    throw error;
  }

  return transitions.length;
}
