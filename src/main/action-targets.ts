import type { MainWindow } from '../core/contracts';
import {
  currentMainItemCursorRef,
  mainItem,
  visibleMainSelectionCount,
} from './host';
import type { MainWindowSession } from './session';
import type { ItemRef } from './selection-store';

export interface MainResolvedTargets {
  readonly refs: readonly ItemRef[];
  readonly items: readonly Zotero.Item[];
  readonly total: number;
  readonly visible: number;
  readonly hidden: number;
  readonly missing: number;
  readonly source: 'selection' | 'cursor';
}

function itemForRef(ref: ItemRef): Zotero.Item | undefined {
  const item = mainItem(ref.itemID);
  return item && item.libraryID === ref.libraryID ? item : undefined;
}

export function mainCursorItem(window: MainWindow): Zotero.Item | undefined {
  const ref = currentMainItemCursorRef(window);
  return ref ? itemForRef(ref) : undefined;
}

export function resolveMainEffectiveTargets(
  window: MainWindow,
  session: MainWindowSession,
): MainResolvedTargets {
  const explicit = session.selection.values();
  const cursor = currentMainItemCursorRef(window);
  const refs = explicit.length ? explicit : cursor ? [cursor] : [];
  const source = explicit.length ? 'selection' : 'cursor';
  const items = refs.flatMap((ref) => {
    const item = itemForRef(ref);
    return item ? [item] : [];
  });
  const visible = visibleMainSelectionCount(window, refs);

  return {
    refs,
    items,
    total: refs.length,
    visible,
    hidden: Math.max(0, refs.length - visible),
    missing: Math.max(0, refs.length - items.length),
    source,
  };
}
