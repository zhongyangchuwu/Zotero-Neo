import { documentAttachments } from '../operations/document-attachments';
import type { DocumentAttachment } from '../document-analysis/preparation';
import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import { normalizeTopLevelItemTargets } from '../platform/zotero-items';
import { visibleMainSelectionCount } from '../toolkit/main';
import {
  resolveMainEffectiveTargets,
  type MainCurrentTarget,
  type MainSelectionSource,
} from './action-targets';

export interface MainItemTargetResolver {
  readonly source: 'main';
  resolve(
    window: MainWindow,
    selection: Pick<MainSelectionSource, 'values'> | null,
    currentTarget?: MainCurrentTarget | null,
  ): ItemTargetSet<'main'>;
}

export function resolveMainItemTarget(
  window: MainWindow,
  selection: Pick<MainSelectionSource, 'values'> | null,
  currentTarget?: MainCurrentTarget | null,
): ItemTargetSet<'main'> {
  const resolved = resolveMainEffectiveTargets(window, selection, currentTarget);
  const items = normalizeTopLevelItemTargets(resolved.items);
  const visible = visibleMainSelectionCount(
    window,
    items.map((item) => ({ libraryID: item.libraryID, itemID: item.id })),
  );
  return {
    source: 'main',
    items,
    total: resolved.total,
    missing: resolved.missing,
    presentation: {
      origin: resolved.source,
      outsideCurrentList: Math.max(0, items.length - visible),
    },
  };
}

export const MAIN_ITEM_TARGET: MainItemTargetResolver = Object.freeze({
  source: 'main',
  resolve: resolveMainItemTarget,
});

/** Document preparation preserves explicitly selected attachments instead of normalizing them to their parents. */
export function resolveMainDocumentAttachments(
  window: MainWindow,
  selection: Pick<MainSelectionSource, 'values'> | null,
  currentTarget?: MainCurrentTarget | null,
): readonly DocumentAttachment[] {
  return documentAttachments(
    resolveMainEffectiveTargets(window, selection, currentTarget).items,
    true,
  );
}
