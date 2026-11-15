import { algorithmPanelLines } from './body-evidence';
import { bounds, centerY, contains, gapY, height, intersects, width } from './geometry';
import type { Caption, ComponentLink, Line, LocalRuleRect, RuleContext } from './types';

/** Independent link proposals; shared assembly alone owns component joining. */
export function ruledTableLinks(
  boxes: readonly LocalRuleRect[],
  labels: readonly ReadonlySet<Line>[],
  lines: readonly Line[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): readonly ComponentLink[] {
  const links: ComponentLink[] = [];
  if (!context.profile.rules.ruledTables.enabled) return links;
  const captionLines = new Set(captions.flatMap((c) => c.lines));
  const barrierLines = [...barriers];
  // Booktabs-style tables have disconnected horizontal rules. Join only with aligned endpoints,
  // intervening cell text, and no prose/caption barrier; empty whitespace is not table evidence.
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    if (height(a) > unit * 0.3 || width(a) < unit * 5) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (
        height(b) > unit * 0.3 ||
        Math.abs(a[0] - b[0]) > unit * context.profile.rules.ruledTables.endpointToleranceEm ||
        Math.abs(a[2] - b[2]) > unit * context.profile.rules.ruledTables.endpointToleranceEm ||
        gapY(a, b) < unit * 0.5
      )
        continue;
      const enclosure = bounds([a, b]);
      let authored: readonly Line[] | undefined;
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'ruledTables',
        outcome: 'candidate',
        reason: 'aligned-horizontal-rules',
        candidateIds: [
          `component:${context.pageIndex}:${i}`,
          `component:${context.pageIndex}:${j}`,
        ],
        rect: enclosure,
      });
      if (
        captions.some((c) => intersects(c.rect, enclosure)) ||
        barrierLines.some((line) => {
          if (!intersects(line.rect, enclosure) || labels[i]!.has(line) || labels[j]!.has(line))
            return false;
          authored ??= context.profile.rules.graphicLabels.enabled
            ? algorithmPanelLines(
                enclosure,
                lines,
                captions,
                unit,
                context.profile.rules.graphicLabels.maxFontSizeEm,
              )
            : [];
          return !authored.includes(line);
        })
      ) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'ruledTables',
          outcome: 'rejected',
          reason: 'prose-or-caption-barrier',
          rect: enclosure,
        });
        continue;
      }
      const cells = lines.filter(
        (line) => !captionLines.has(line) && contains(enclosure, line.rect),
      );
      if (cells.length < 2) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'ruledTables',
          outcome: 'rejected',
          reason: 'missing-intervening-cells',
          rect: enclosure,
        });
        continue;
      }
      const levels = [...new Set(cells.map((line) => centerY(line.rect)))].sort((x, y) => y - x);
      if (
        a[1] - levels[0]! > leading * 2 ||
        levels[levels.length - 1]! - b[3] > leading * 2 ||
        levels.some((level, index) => index > 0 && levels[index - 1]! - level > leading * 2)
      ) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'ruledTables',
          outcome: 'rejected',
          reason: 'missing-continuous-cell-rows',
          rect: enclosure,
        });
        continue;
      }
      links.push({ from: i, to: j });
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'ruledTables',
        outcome: 'accepted',
        reason: 'aligned-rules-with-cells',
        candidateIds: [
          `component:${context.pageIndex}:${i}`,
          `component:${context.pageIndex}:${j}`,
        ],
        rect: enclosure,
      });
    }
  }
  return links;
}
