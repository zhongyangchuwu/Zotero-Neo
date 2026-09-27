import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet, ItemTargetSource } from '../core/item-target';
import { normalizeTopLevelItemTargets } from '../platform/zotero-items';
import { READER_ITEM_TARGET, type ReaderItemTargetResolver } from '../reader/item-target';
import type { MainCurrentTarget } from './action-targets';
import { mainReaderForTab, selectedMainTabID } from './host';
import { MAIN_ITEM_TARGET, type MainItemTargetResolver } from './main-item-target';
import { NOTE_ITEM_TARGET, type NoteItemTargetResolver } from './note-item-target';
import type { MainWindowSession } from './session';

export type ItemTargetContext = ItemTargetSource;
export type {
  ItemTargetSet,
  MainItemTargetResolver,
  NoteItemTargetResolver,
  ReaderItemTargetResolver,
};
export { MAIN_ITEM_TARGET, NOTE_ITEM_TARGET, READER_ITEM_TARGET, normalizeTopLevelItemTargets };

/**
 * Compatibility dispatcher while cross-Surface consumers are migrated to the
 * typed resolver owned by their exact Surface.
 */
export function resolveItemTargets(
  window: MainWindow,
  session: MainWindowSession,
  context: ItemTargetContext,
  currentTarget?: MainCurrentTarget | null,
): ItemTargetSet {
  switch (context) {
    case 'main':
      return MAIN_ITEM_TARGET.resolve(window, session, currentTarget);
    case 'reader': {
      const tabID = selectedMainTabID(window);
      return READER_ITEM_TARGET.resolve(tabID ? mainReaderForTab(tabID) : null);
    }
    case 'note':
      return NOTE_ITEM_TARGET.resolve(window);
  }
}
