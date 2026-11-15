import { gapY, height, overlapY } from './geometry';
import { sameColumn } from './text';
import type { Graphic, RuleContext } from './types';

/** Optional panel grouping proposes bands, leaving barriers and ownership to association. */
export function compoundPanelBands(
  direction: readonly Graphic[],
  unit: number,
  context: RuleContext,
): readonly (readonly Graphic[])[] {
  const { enabled, maxGapEm, minOverlapRatio } = context.profile.rules.compoundPanels;
  const bands: Graphic[][] = [];
  const remaining = new Set(direction);
  for (const seed of direction) {
    if (!remaining.delete(seed)) continue;
    const connected = [seed];
    for (let i = 0; i < connected.length; i++) {
      const other = connected[i]!;
      for (const graphic of remaining) {
        if (
          enabled &&
          (overlapY(graphic.rect, other.rect) >=
            Math.min(height(graphic.rect), height(other.rect)) * minOverlapRatio ||
            (gapY(graphic.rect, other.rect) <= unit * maxGapEm &&
              sameColumn(graphic.rect, other.rect, unit)))
        ) {
          remaining.delete(graphic);
          connected.push(graphic);
        }
      }
    }
    bands.push(connected);
    if (connected.length > 1)
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'compoundPanels',
        outcome: 'candidate',
        reason: 'connected-panel-band',
        candidateIds: connected.map((graphic) => `graphic:${context.pageIndex}:${graphic.index}`),
      });
  }
  return bands;
}
