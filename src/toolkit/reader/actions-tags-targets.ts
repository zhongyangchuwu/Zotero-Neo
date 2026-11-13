import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime } from './private-types';

/** Resolve the same targets as the Actions & Tags Reader menu, without changing selection. */
export function readerActionsTagsItemIDs(readerHandle: ReaderRuntime): readonly number[] {
  try {
    const reader = readerHandle as NativeReaderRuntime | null | undefined;
    if (!reader) return [];

    const selected = reader._internalReader?._lastView?._selectedAnnotationIDs;
    const items = typeof Zotero === 'undefined' ? undefined : Zotero.Items;
    const attachment =
      reader._item ?? (reader.itemID == null ? undefined : items?.get(reader.itemID));

    if (selected?.length) {
      if (!attachment || typeof attachment.libraryID !== 'number' || !items?.getByLibraryAndKey) {
        return [];
      }
      const ids: number[] = [];
      // Read primitives from the native view instead of passing its array across compartments.
      for (let i = 0; i < selected.length; i++) {
        const key = selected[i];
        if (typeof key !== 'string' || !key) continue;
        try {
          const item = items.getByLibraryAndKey(attachment.libraryID, key);
          if (item && typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id > 0) {
            ids.push(item.id);
          }
        } catch {
          // A stale or invalid key must not discard other selected annotations.
        }
      }
      return ids;
    }

    const id = attachment && attachment.id;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? [id] : [];
  } catch {
    // Reader wrappers may become invalid while their window is closing.
    return [];
  }
}
