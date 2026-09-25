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

export interface ItemTargetSet {
  readonly source: ItemTargetContext;
  readonly items: readonly Zotero.Item[];
  readonly total: number;
  readonly missing: number;
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

/**
 * Resolve semantic item targets by invocation context.
 *
 * Main consumes Neo EffectiveSelection. Reader and Note never borrow Main
 * Selection; each resolves only its active contextual item.
 */
export function resolveItemTargets(
  window: MainWindow,
  session: MainWindowSession,
  context: ItemTargetContext,
  currentTarget?: MainCurrentTarget | null,
): ItemTargetSet {
  if (context === 'main') {
    const resolved = resolveMainEffectiveTargets(window, session, currentTarget);
    return {
      source: 'main',
      items: normalizeTopLevelItemTargets(resolved.items),
      total: resolved.total,
      missing: resolved.missing,
    };
  }

  const resolved = contextualItem(window, context);
  const raw = resolved.item ? [resolved.item] : [];
  return {
    source: context,
    items: normalizeTopLevelItemTargets(raw),
    total: resolved.item || resolved.missing ? 1 : 0,
    missing: resolved.missing,
  };
}
