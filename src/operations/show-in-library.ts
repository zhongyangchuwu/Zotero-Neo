export interface ShowInLibraryHost {
  selectItem?(itemID: number): void | Promise<void>;
}

/** Reveal one explicit item in Zotero's library view; Return remains a separate capability. */
export async function showItemInLibrary(
  item: Zotero.Item,
  host: ShowInLibraryHost | undefined,
): Promise<void> {
  const selectItem = host?.selectItem;
  if (!selectItem) throw new Error('Library item selection is unavailable');
  await selectItem.call(host, item.id);
}
