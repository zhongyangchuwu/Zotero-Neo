import type { MainWindow } from '../core/contracts';
import {
  activeContextNoteItem,
  mainReaderForTab,
  selectedMainTabID,
  selectedMainTabInfo,
} from './host';

export type ActiveSurface =
  | { readonly kind: 'main' }
  | { readonly kind: 'note' }
  | { readonly kind: 'reader'; readonly tabID: string };

/**
 * Derives the currently active Neo Surface from Zotero-owned focus/tab state.
 * No mutable current-surface state is stored by Neo.
 */
export function resolveActiveSurface(window: MainWindow): ActiveSurface {
  if (activeContextNoteItem(window)) return { kind: 'note' };

  const tab = selectedMainTabInfo(window);
  if (tab?.type?.startsWith('note')) return { kind: 'note' };

  const tabID = selectedMainTabID(window);
  if (tabID && mainReaderForTab(tabID)) return { kind: 'reader', tabID };

  return { kind: 'main' };
}
