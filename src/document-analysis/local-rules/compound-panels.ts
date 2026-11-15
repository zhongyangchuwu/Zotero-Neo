import { bounds, gapY, height, overlapY, readingOrder } from './geometry';
import { sameColumn } from './text';
import type { Graphic, LocalRuleRect, RuleContext } from './types';

interface PanelRow {
  readonly rect: LocalRuleRect;
  readonly members: readonly Graphic[];
}

/** Optional panel grouping proposes bands, leaving barriers and ownership to association. */
export function compoundPanelBands(
  direction: readonly Graphic[],
  unit: number,
  context: RuleContext,
): readonly (readonly Graphic[])[] {
  const { enabled, maxGapEm, minOverlapRatio, maxRepeatedGapRatio } =
    context.profile.rules.compoundPanels;
  if (!enabled) return direction.map((graphic) => [graphic]);

  // Compare complete horizontal rows, not a wide row against each narrow tile of its next row.
  // A native path may cover several subplots while the adjacent row has separate operators.
  const rows: PanelRow[] = [];
  const rowRemaining = new Set(direction);
  for (const seed of direction) {
    if (!rowRemaining.delete(seed)) continue;
    const members = [seed];
    for (let index = 0; index < members.length; index++) {
      const other = members[index]!;
      for (const graphic of rowRemaining) {
        if (
          overlapY(graphic.rect, other.rect) <
          Math.min(height(graphic.rect), height(other.rect)) * minOverlapRatio
        )
          continue;
        rowRemaining.delete(graphic);
        members.push(graphic);
      }
    }
    rows.push({ rect: bounds(members.map((graphic) => graphic.rect)), members });
  }

  // Three repeated row envelopes license a height-relative gap, not a larger caption radius.
  const repeated = new Map<PanelRow, Set<PanelRow>>();
  const ordered = [...rows].sort((a, b) => readingOrder(a.rect, b.rect));
  const grouped = new Set<PanelRow>();
  for (const seed of ordered) {
    if (grouped.has(seed)) continue;
    const aligned = ordered.filter(
      (row) =>
        Math.abs(row.rect[0] - seed.rect[0]) <= unit * 0.2 &&
        Math.abs(row.rect[2] - seed.rect[2]) <= unit * 0.2 &&
        Math.abs(height(row.rect) - height(seed.rect)) <=
          Math.min(height(row.rect), height(seed.rect)) * 0.1,
    );
    for (const row of aligned) grouped.add(row);
    for (let index = 2; index < aligned.length; index++) {
      const a = aligned[index - 2]!,
        b = aligned[index - 1]!,
        c = aligned[index]!;
      const firstGap = gapY(a.rect, b.rect),
        secondGap = gapY(b.rect, c.rect);
      const limit = Math.min(height(a.rect), height(b.rect), height(c.rect)) * maxRepeatedGapRatio;
      if (
        Math.max(height(a.rect), height(b.rect), height(c.rect)) >
          Math.min(height(a.rect), height(b.rect), height(c.rect)) * 1.1 ||
        overlapY(a.rect, b.rect) >= 0 ||
        overlapY(b.rect, c.rect) >= 0 ||
        firstGap > limit ||
        secondGap > limit ||
        Math.abs(firstGap - secondGap) > unit * 0.2
      )
        continue;
      for (const [from, to] of [
        [a, b],
        [b, c],
      ] as const) {
        const next = repeated.get(from) ?? new Set<PanelRow>();
        next.add(to);
        repeated.set(from, next);
        const previous = repeated.get(to) ?? new Set<PanelRow>();
        previous.add(from);
        repeated.set(to, previous);
      }
    }
  }

  const bands: (readonly Graphic[])[] = [];
  const remaining = new Set(rows);
  for (const seed of rows) {
    if (!remaining.delete(seed)) continue;
    const connected = [seed];
    for (let index = 0; index < connected.length; index++) {
      const other = connected[index]!;
      for (const row of remaining) {
        if (
          (gapY(row.rect, other.rect) <= unit * maxGapEm &&
            sameColumn(row.rect, other.rect, unit) &&
            Math.abs(row.rect[0] - other.rect[0]) <= unit * maxGapEm &&
            Math.abs(row.rect[2] - other.rect[2]) <= unit * maxGapEm) ||
          repeated.get(other)?.has(row)
        ) {
          remaining.delete(row);
          connected.push(row);
        }
      }
    }
    const members = connected.length === 1 ? seed.members : connected.flatMap((row) => row.members);
    bands.push(members);
    if (members.length > 1)
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'compoundPanels',
        outcome: 'candidate',
        reason: 'connected-panel-band',
        candidateIds: members.map((graphic) => `graphic:${context.pageIndex}:${graphic.index}`),
      });
  }
  return bands;
}
