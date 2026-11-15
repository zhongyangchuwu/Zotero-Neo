import { bounds, contains, gapY, height, intersects, overlapX, overlapY, width } from './geometry';
import type { Caption, Line, PaintedComponent, RuleContext, TextEvidence } from './types';

/** Table-owned text independently licenses compatible painted separators, not arbitrary labels. */
export function tableComponentLabels(
  tables: readonly TextEvidence[],
  groups: readonly PaintedComponent[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): readonly ReadonlySet<Line>[] {
  const barrierLines = [...barriers];
  const labels = [
    ...groups.map(() => new Set<Line>()),
    ...tables.map((table) => new Set(table.labels)),
  ];
  tables.forEach((table) => {
    groups.forEach((group, graphicIndex) => {
      const r = group.rect;
      const contained = contains(table.rect, r, unit * 0.8);
      const separator =
        height(r) <= unit * 0.3 &&
        overlapX(r, table.rect) >= width(table.rect) * 0.8 &&
        ((r[0] >= table.rect[0] - unit * 1.2 && r[2] <= table.rect[2] + unit * 1.2) ||
          groups.some(
            (other) =>
              other !== group &&
              height(other.rect) <= unit * 0.3 &&
              Math.abs(other.rect[0] - r[0]) <= unit * 0.2 &&
              Math.abs(other.rect[2] - r[2]) <= unit * 0.2 &&
              gapY(other.rect, table.rect) <= leading * 1.6 &&
              (overlapY(other.rect, table.rect) > 0 ||
                (r[1] >= table.rect[3] && other.rect[3] <= table.rect[1]) ||
                (other.rect[1] >= table.rect[3] && r[3] <= table.rect[1])),
          )) &&
        width(r) >= width(table.rect) * 0.8 &&
        gapY(r, table.rect) <= leading * 1.6;
      if (!contained && !separator) return;
      const enclosure = bounds([r, table.rect]);
      if (
        captions.some((caption) => intersects(caption.rect, enclosure)) ||
        barrierLines.some((line) => !table.labels.has(line) && intersects(line.rect, enclosure))
      ) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'unruledTables',
          outcome: 'rejected',
          reason: 'prose-or-caption-barrier',
          rect: enclosure,
        });
        return;
      }
      for (const line of table.labels) labels[graphicIndex]!.add(line);
    });
  });
  return labels;
}
