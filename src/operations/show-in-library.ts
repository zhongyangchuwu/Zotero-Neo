export type SelectLibraryItemResult = boolean | void | Promise<boolean | void>;

export interface ShowInLibraryHost {
  selectItem?(itemID: number): SelectLibraryItemResult;
}

/** Reveal one explicit item in Zotero's library view; Return remains a separate capability. */
export async function showItemInLibrary(
  itemID: number,
  host: ShowInLibraryHost | undefined,
): Promise<void> {
  const selectItem = host?.selectItem;
  if (!selectItem) throw new Error('Library item selection is unavailable');
  if ((await selectItem.call(host, itemID)) === false)
    throw new Error('Library item selection failed');
}
