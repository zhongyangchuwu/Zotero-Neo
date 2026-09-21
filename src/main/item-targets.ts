import type { MainWindow } from '../core/contracts';
import { mainCursorItemRef, mainItem, mainSelectedItems } from './host';
import type { SelectionStore } from './selection-store';

function uniqueItems(items: readonly Zotero.Item[]): Zotero.Item[] {
  const byID = new Map<number, Zotero.Item>();
  for (const item of items) byID.set(item.id, item);
  return [...byID.values()];
}

export function mainCursorItem(window: MainWindow): Zotero.Item | undefined {
  const ref = mainCursorItemRef(window);
  if (!ref) return undefined;
  const item = mainItem(ref.itemID);
  return item?.libraryID === ref.libraryID ? item : undefined;
}

/**
 * Resolve the Main workset contract.
 *
 * A real MainWindowSession always supplies SelectionStore. The optional form exists only for
 * legacy/test callers that have not yet been migrated; those retain native-selection behavior.
 */
export function mainEffectiveItems(
  window: MainWindow,
  selection: SelectionStore | undefined,
): readonly Zotero.Item[] {
  if (!selection) return uniqueItems(mainSelectedItems(window));

  if (selection.empty) {
    const cursor = mainCursorItem(window);
    return cursor ? [cursor] : [];
  }

  const items: Zotero.Item[] = [];
  for (const ref of selection.values()) {
    const item = mainItem(ref.itemID);
    if (item?.libraryID === ref.libraryID) items.push(item);
  }
  return uniqueItems(items);
}
