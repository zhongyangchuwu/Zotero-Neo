import type { MainWindow } from '../core/contracts';
import {
  activeContextNoteItem,
  mainItem,
  mainReaderForTab,
  mainSelectedItems,
  selectedMainTabID,
  selectedMainTabInfo,
} from './host';

export type ItemTargetSource = 'main' | 'reader' | 'note';
export type ItemTagState = 'all' | 'mixed' | 'none';

export interface ItemTargetSet {
  readonly source: ItemTargetSource;
  readonly items: readonly Zotero.Item[];
}

function normalizedItem(item: Zotero.Item | undefined): Zotero.Item | undefined {
  if (!item) return undefined;
  if ((item.isAttachment() || item.isNote()) && item.parentItemID)
    return mainItem(item.parentItemID) ?? item;
  return item;
}

export function normalizeItemTargets(items: readonly Zotero.Item[]): Zotero.Item[] {
  const byID = new Map<number, Zotero.Item>();
  for (const item of items) {
    const normalized = normalizedItem(item);
    if (normalized) byID.set(normalized.id, normalized);
  }
  return [...byID.values()];
}

export function resolveItemTagTargets(window: MainWindow): ItemTargetSet {
  const contextNote = activeContextNoteItem(window);
  if (contextNote)
    return { source: 'note', items: normalizeItemTargets([contextNote]) };

  const tabID = selectedMainTabID(window);
  const reader = tabID ? mainReaderForTab(tabID) : null;
  if (reader) {
    const item = reader.itemID ? mainItem(reader.itemID) : undefined;
    return { source: 'reader', items: normalizeItemTargets(item ? [item] : []) };
  }

  const tab = selectedMainTabInfo(window);
  if (tab?.type?.startsWith('note')) {
    const item = tab.data?.itemID ? mainItem(tab.data.itemID) : undefined;
    return { source: 'note', items: normalizeItemTargets(item ? [item] : []) };
  }

  return { source: 'main', items: normalizeItemTargets(mainSelectedItems(window)) };
}

export function itemTagState(items: readonly Zotero.Item[], tag: string): ItemTagState {
  if (!items.length) return 'none';
  let present = 0;
  for (const item of items) if (item.hasTag(tag)) present += 1;
  if (present === 0) return 'none';
  return present === items.length ? 'all' : 'mixed';
}

export async function setTagOnTargets(
  items: readonly Zotero.Item[],
  tag: string,
  present: boolean,
): Promise<void> {
  const name = tag.trim();
  if (!name) throw new Error('Tag name is empty');
  for (const item of items) {
    const hadTag = item.hasTag(name);
    if (hadTag === present) continue;
    const previousType = hadTag ? (item.getTagType(name) ?? 0) : 0;
    const changed = present ? item.addTag(name, 0) : item.removeTag(name);
    if (!changed) continue;
    try {
      await item.saveTx();
    } catch (error) {
      if (present) item.removeTag(name);
      else item.addTag(name, previousType);
      throw error;
    }
  }
}
