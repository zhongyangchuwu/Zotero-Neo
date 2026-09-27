import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import { normalizeTopLevelItemTargets, zoteroItem } from '../platform/zotero-items';
import { activeContextNoteItem, selectedMainTabInfo } from './host';

export interface NoteItemTargetResolver {
  readonly source: 'note';
  resolve(window: MainWindow): ItemTargetSet<'note'>;
}

export function resolveNoteItemTarget(window: MainWindow): ItemTargetSet<'note'> {
  const focusedNote = activeContextNoteItem(window);
  if (focusedNote) {
    return {
      source: 'note',
      items: normalizeTopLevelItemTargets([focusedNote]),
      total: 1,
      missing: 0,
    };
  }

  const tab = selectedMainTabInfo(window);
  const itemID = tab?.type?.startsWith('note') ? tab.data?.itemID : undefined;
  if (!itemID) return { source: 'note', items: [], total: 0, missing: 0 };
  const item = zoteroItem(itemID);
  return {
    source: 'note',
    items: normalizeTopLevelItemTargets(item ? [item] : []),
    total: 1,
    missing: item ? 0 : 1,
  };
}

export const NOTE_ITEM_TARGET: NoteItemTargetResolver = Object.freeze({
  source: 'note',
  resolve: resolveNoteItemTarget,
});
