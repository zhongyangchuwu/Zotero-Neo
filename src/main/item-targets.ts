import type { MainWindow } from '../core/contracts';
import type { MainWindowSession } from './session';
import { resolveMainEffectiveTargets, type MainCurrentTarget } from './action-targets';
import {
  activeContextNoteItem,
  mainItem,
  mainReaderForTab,
  selectedMainTabID,
  selectedMainTabInfo,
} from './host';

export type ItemTargetContext = 'main' | 'reader' | 'note';

export interface ItemTargetSet<Source extends ItemTargetContext = ItemTargetContext> {
  readonly source: Source;
  readonly items: readonly Zotero.Item[];
  readonly total: number;
  readonly missing: number;
}

export interface MainItemTargetResolver {
  readonly source: 'main';
  resolve(
    window: MainWindow,
    session: MainWindowSession,
    currentTarget?: MainCurrentTarget | null,
  ): ItemTargetSet<'main'>;
}

export interface ReaderItemTargetResolver {
  readonly source: 'reader';
  resolve(window: MainWindow): ItemTargetSet<'reader'>;
}

export interface NoteItemTargetResolver {
  readonly source: 'note';
  resolve(window: MainWindow): ItemTargetSet<'note'>;
}

function fallbackTopLevel(item: Zotero.Item): Zotero.Item {
  if ((item.isAttachment?.() || item.isNote?.()) && item.parentItemID) {
    return mainItem(item.parentItemID) ?? item;
  }
  return item;
}

/**
 * Normalize item-action targets to top-level bibliographic items and deduplicate
 * them. Prefer Zotero's native helper, with the previous parent lookup as a
 * fail-closed compatibility fallback.
 */
export function normalizeTopLevelItemTargets(items: readonly Zotero.Item[]): Zotero.Item[] {
  let normalized: Zotero.Item[];
  const keepTopLevel = (
    Zotero.Items as unknown as {
      keepTopLevel?(items: Zotero.Item[]): Zotero.Item[];
    }
  ).keepTopLevel;

  try {
    normalized = keepTopLevel ? keepTopLevel([...items]) : items.map(fallbackTopLevel);
  } catch {
    normalized = items.map(fallbackTopLevel);
  }

  const byRef = new Map<string, Zotero.Item>();
  for (const item of normalized) {
    const topLevel = fallbackTopLevel(item);
    byRef.set(`${topLevel.libraryID}:${topLevel.id}`, topLevel);
  }
  return [...byRef.values()];
}

function contextualItem(
  window: MainWindow,
  context: 'reader' | 'note',
): {
  item?: Zotero.Item;
  missing: number;
} {
  if (context === 'reader') {
    const tabID = selectedMainTabID(window);
    const reader = tabID ? mainReaderForTab(tabID) : null;
    const itemID = reader?.itemID;
    if (!itemID) return { missing: 0 };
    const item = mainItem(itemID);
    return { item, missing: item ? 0 : 1 };
  }

  const focusedNote = activeContextNoteItem(window);
  if (focusedNote) return { item: focusedNote, missing: 0 };

  const tab = selectedMainTabInfo(window);
  const itemID = tab?.type?.startsWith('note') ? tab.data?.itemID : undefined;
  if (!itemID) return { missing: 0 };
  const item = mainItem(itemID);
  return { item, missing: item ? 0 : 1 };
}

export function resolveMainItemTarget(
  window: MainWindow,
  session: MainWindowSession,
  currentTarget?: MainCurrentTarget | null,
): ItemTargetSet<'main'> {
  const resolved = resolveMainEffectiveTargets(window, session, currentTarget);
  return {
    source: 'main',
    items: normalizeTopLevelItemTargets(resolved.items),
    total: resolved.total,
    missing: resolved.missing,
  };
}

function resolveContextualItemTarget<Source extends 'reader' | 'note'>(
  window: MainWindow,
  source: Source,
): ItemTargetSet<Source> {
  const resolved = contextualItem(window, source);
  const raw = resolved.item ? [resolved.item] : [];
  return {
    source,
    items: normalizeTopLevelItemTargets(raw),
    total: resolved.item || resolved.missing ? 1 : 0,
    missing: resolved.missing,
  };
}

export function resolveReaderItemTarget(window: MainWindow): ItemTargetSet<'reader'> {
  return resolveContextualItemTarget(window, 'reader');
}

export function resolveNoteItemTarget(window: MainWindow): ItemTargetSet<'note'> {
  return resolveContextualItemTarget(window, 'note');
}

export const MAIN_ITEM_TARGET: MainItemTargetResolver = Object.freeze({
  source: 'main',
  resolve: resolveMainItemTarget,
});

export const READER_ITEM_TARGET: ReaderItemTargetResolver = Object.freeze({
  source: 'reader',
  resolve: resolveReaderItemTarget,
});

export const NOTE_ITEM_TARGET: NoteItemTargetResolver = Object.freeze({
  source: 'note',
  resolve: resolveNoteItemTarget,
});

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
    case 'reader':
      return READER_ITEM_TARGET.resolve(window);
    case 'note':
      return NOTE_ITEM_TARGET.resolve(window);
  }
}
