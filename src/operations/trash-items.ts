/** Move an explicit set of Zotero items to the Trash and return the affected IDs. */
export async function trashItems(items: readonly Zotero.Item[]): Promise<readonly number[]> {
  const ids = [...new Set(items.map((item) => item.id))];
  if (!ids.length) return [];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0))
    throw new Error('Trash target contains an invalid item ID');
  await Zotero.Items.trashTx(ids);
  return ids;
}
