import type { ItemTargetSet } from '../core/item-target';
import { normalizeTopLevelItemTargets, zoteroItem } from '../platform/zotero-items';

export interface ReaderItemTargetContext {
  readonly itemID?: number;
}

export interface ReaderItemTargetResolver {
  readonly source: 'reader';
  resolve(reader: ReaderItemTargetContext | null): ItemTargetSet<'reader'>;
}

export function resolveReaderItemTarget(
  reader: ReaderItemTargetContext | null,
): ItemTargetSet<'reader'> {
  const itemID = reader?.itemID;
  if (!itemID) return { source: 'reader', items: [], total: 0, missing: 0 };
  const item = zoteroItem(itemID);
  return {
    source: 'reader',
    items: normalizeTopLevelItemTargets(item ? [item] : []),
    total: 1,
    missing: item ? 0 : 1,
  };
}

export const READER_ITEM_TARGET: ReaderItemTargetResolver = Object.freeze({
  source: 'reader',
  resolve: resolveReaderItemTarget,
});
