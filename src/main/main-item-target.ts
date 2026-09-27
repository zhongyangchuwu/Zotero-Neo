import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import { normalizeTopLevelItemTargets } from '../platform/zotero-items';
import { resolveMainEffectiveTargets, type MainCurrentTarget } from './action-targets';
import type { MainWindowSession } from './session';

export interface MainItemTargetResolver {
  readonly source: 'main';
  resolve(
    window: MainWindow,
    session: MainWindowSession,
    currentTarget?: MainCurrentTarget | null,
  ): ItemTargetSet<'main'>;
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

export const MAIN_ITEM_TARGET: MainItemTargetResolver = Object.freeze({
  source: 'main',
  resolve: resolveMainItemTarget,
});
