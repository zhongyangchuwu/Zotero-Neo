import type { MainWindow } from '../core/contracts';
import {
  currentMainItemCursorRef,
  mainItem,
  mainSelectedItemRefs,
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
  readonly source: 'selection' | 'visual' | 'native-selection' | 'cursor';
}

export interface MainCurrentTarget {
  readonly refs: readonly ItemRef[];
  readonly source: 'visual' | 'native-selection' | 'cursor';
}

function itemForRef(ref: ItemRef): Zotero.Item | undefined {
  const item = mainItem(ref.itemID);
  return item && item.libraryID === ref.libraryID ? item : undefined;
}

export function mainCursorItem(window: MainWindow): Zotero.Item | undefined {
  const ref = currentMainItemCursorRef(window);
  return ref ? itemForRef(ref) : undefined;
}

export function resolveMainCurrentTarget(window: MainWindow): MainCurrentTarget | null {
  const native = mainSelectedItemRefs(window);
  if (native.length > 1) return { refs: native, source: 'native-selection' };
  const cursor = currentMainItemCursorRef(window);
  if (cursor) return { refs: [cursor], source: 'cursor' };
  if (native.length === 1) return { refs: native, source: 'cursor' };
  return null;
}

export function resolveMainEffectiveTargets(
  window: MainWindow,
  session: MainWindowSession,
  currentTarget?: MainCurrentTarget | null,
): MainResolvedTargets {
  const explicit = session.selection.values();
  const transient = currentTarget ?? resolveMainCurrentTarget(window);
  const refs = explicit.length ? explicit : (transient?.refs ?? []);
  const source = explicit.length ? 'selection' : (transient?.source ?? 'cursor');
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
