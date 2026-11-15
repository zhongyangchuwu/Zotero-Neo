import { bounds, contains, height, intersects, overlapX, overlapY, width } from './geometry';
import { expansionBarrier } from './expansion';
import type { Graphic, Line, LocalRuleRegion, PageTextLayout, RuleContext } from './types';

export function figureTextExclusions(
  layout: PageTextLayout,
  graphics: readonly Graphic[],
  objects: readonly LocalRuleRegion[],
  context: RuleContext,
): ReadonlySet<Line> {
  const { lines, barriers, unit } = layout;
  const barrierLines = [...barriers];
  // Uncaptioned diagrams exclude their labels, not paragraphs enclosed by a border/background.
  const diagramBounds = graphics.filter(
    (graphic) =>
      width(graphic.rect) >= unit * 3 &&
      height(graphic.rect) >= unit * 2 &&
      !barrierLines.some(
        (line) => intersects(line.rect, graphic.rect) && !graphic.labels.has(line),
      ),
  );
  return new Set(
    lines.filter(
      (line) =>
        objects.some(
          (object) =>
            overlapX(object.rect, line.rect) >= width(line.rect) * 0.5 &&
            overlapY(object.rect, line.rect) >= height(line.rect) * 0.5,
        ) ||
        diagramBounds.some(
          (graphic) =>
            (context.profile.rules.graphicLabels.enabled || graphic.labels.has(line)) &&
            line.fontSize <= unit * context.profile.rules.graphicLabels.maxFontSizeEm &&
            contains(
              graphic.rect,
              line.rect,
              unit * context.profile.rules.graphicLabels.maxGapEm,
            ) &&
            !expansionBarrier(
              graphic.rect,
              bounds([graphic.rect, line.rect]),
              layout.captions,
              barriers,
              graphic.labels,
            ),
        ),
    ),
  );
}
