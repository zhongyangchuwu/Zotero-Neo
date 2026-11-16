import {
  metadataValuesEqual,
  snapshotMetadata,
  type MetadataField,
  type MetadataPlan,
  type MetadataValue,
} from '../metadata-review/model';

function writable(item: Zotero.Item): void {
  const library = Zotero.Libraries.get(item.libraryID);
  if (
    !item.isRegularItem() ||
    item.deleted ||
    !library ||
    !library.editable ||
    library.archived ||
    library.libraryType === 'feed'
  ) {
    throw new Error('The bibliographic item is no longer writable');
  }
}
function assign(item: Zotero.Item, field: MetadataField, value: MetadataValue): void {
  if (field === 'creators') {
    if (typeof value === 'string') throw new Error('Invalid creator proposal');
    item.setCreators(value.map((creator) => ({ ...creator })));
  } else {
    if (typeof value !== 'string') throw new Error('Invalid field proposal');
    item.setField(field, value);
  }
}

/** Apply only reviewed changes, rechecking the exact item and baseline within its transaction. */
export async function applyMetadataPlan(
  plan: MetadataPlan,
  selected: readonly MetadataField[],
  isCurrent: () => boolean | Promise<boolean>,
): Promise<readonly MetadataField[]> {
  const fields = [...new Set(selected)];
  const changes = fields.map((field) => {
    const change = plan.changes.find((entry) => entry.field === field);
    if (!change) throw new Error('The selected field is not part of this review');
    return change;
  });
  if (!changes.length) throw new Error('Select at least one field');
  const item = await Zotero.Items.getAsync(plan.snapshot.itemID);
  if (!item || item.key !== plan.snapshot.itemKey || item.libraryID !== plan.snapshot.libraryID) {
    throw new Error('The reviewed item is no longer available');
  }
  writable(item);
  await Zotero.DB.executeTransaction(async () => {
    if (!(await isCurrent())) throw new Error('The metadata review was cancelled');
    writable(item);
    if (fields.includes('citationKey')) {
      const next = String(changes.find((change) => change.field === 'citationKey')!.after);
      const search = new Zotero.Search();
      search.addCondition('libraryID', 'is', item.libraryID);
      search.addCondition('deleted', 'false');
      search.addCondition('citationKey', 'is', next);
      const matches = await search.search();
      if (matches.some((id) => id !== item.id))
        throw new Error('This citation key is already used in the library');
    }
    // The uniqueness lookup and currentness callback may both yield. Admit writes only
    // after their completion, with no further await before assignments and save.
    if (!(await isCurrent())) throw new Error('The metadata review was cancelled');
    if (
      item.id !== plan.snapshot.itemID ||
      item.key !== plan.snapshot.itemKey ||
      item.libraryID !== plan.snapshot.libraryID
    ) {
      throw new Error('The reviewed item is no longer available');
    }
    writable(item);
    const current = snapshotMetadata(item);
    for (const [field, before] of Object.entries(plan.snapshot.values)) {
      const now = current.values[field as MetadataField];
      if (now === undefined || !metadataValuesEqual(before, now)) {
        throw new Error('The item changed after inspection; inspect it again before applying');
      }
    }
    try {
      for (const change of changes) assign(item, change.field, change.after);
      await item.save();
    } catch (error) {
      for (const change of changes) assign(item, change.field, change.before);
      throw error;
    }
  });
  return fields;
}
