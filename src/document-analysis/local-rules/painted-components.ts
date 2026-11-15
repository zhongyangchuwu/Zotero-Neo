import { bounds, gapX, height, intersects, readingOrder, valid, width } from './geometry';
import type {
  Caption,
  Line,
  LocalFigurePage,
  LocalRuleRect,
  PaintedComponent,
  RuleContext,
} from './types';

export function pageLike(page: LocalFigurePage, rect: LocalRuleRect): boolean {
  const pageArea = width(page.viewBox) * height(page.viewBox);
  return (
    width(rect) * height(rect) >= pageArea * 0.8 ||
    (width(rect) >= width(page.viewBox) * 0.9 && height(rect) >= height(page.viewBox) * 0.85)
  );
}

/** Painted proximity is mandatory geometry, independent of optional semantic joins. */
export function paintedComponents(
  page: LocalFigurePage,
  unit: number,
  barriers: ReadonlySet<Line>,
  captions: readonly Caption[],
  context: RuleContext,
): { readonly rects: readonly LocalRuleRect[]; readonly groups: readonly PaintedComponent[] } {
  const barrierLines = [...barriers];
  const seen = new Set<string>();
  const rects = page.graphics
    .filter((r) => {
      if (!valid(r) || !intersects(page.viewBox, r)) return false;
      // A scan/background/unknown operator bounding the page is not object evidence.
      if (pageLike(page, r)) return false;
      // An operator envelope spanning authored caption text is not a body primitive.
      // Keeping it would swallow the caption and join otherwise independent painted marks.
      if (captions.some((caption) => intersects(caption.rect, r))) {
        context.observe?.({
          pageIndex: page.pageIndex,
          ruleId: 'paintedComponents',
          outcome: 'rejected',
          reason: 'caption-spanning-envelope',
          rect: r,
        });
        return false;
      }
      const key = r.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(readingOrder);
  const parents = rects.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };
  // Sweep downward: only graphics in overlapping vertical intervals need a proximity test.
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    for (let j = i + 1; j < rects.length; j++) {
      if (rects[j]![3] < r[1] - unit * 0.35) break;
      const other = rects[j]!;
      if (gapX(r, other) > unit * 0.35 || root(i) === root(j)) continue;
      // A nearby page rule must not turn a one-column plot into a hull over the prose beside it.
      // Inspect the prospective hull before joining otherwise disconnected painted members.
      if (
        !intersects(r, other) &&
        barrierLines.some(
          (line) =>
            line.rect[0] < Math.max(r[2], other[2]) &&
            line.rect[2] > Math.min(r[0], other[0]) &&
            line.rect[1] < Math.max(r[3], other[3]) &&
            line.rect[3] > Math.min(r[1], other[1]) &&
            !intersects(line.rect, r) &&
            !intersects(line.rect, other),
        )
      ) {
        context.observe?.({
          pageIndex: page.pageIndex,
          ruleId: 'paintedComponents',
          outcome: 'rejected',
          reason: 'prose-barrier',
          rect: bounds([r, other]),
        });
        continue;
      }
      parents[root(j)] = root(i);
    }
  }
  const components = new Map<number, LocalRuleRect[]>();
  rects.forEach((rect, index) => {
    const key = root(index);
    const members = components.get(key) ?? [];
    members.push(rect);
    components.set(key, members);
  });
  const groups = [...components.values()]
    .map((members) => ({ members, rect: bounds(members) }))
    .sort((a, b) => readingOrder(a.rect, b.rect));
  if (context.observe)
    groups.forEach((group, index) =>
      context.observe?.({
        pageIndex: page.pageIndex,
        ruleId: 'paintedComponents',
        outcome: 'candidate',
        reason: 'painted-component',
        candidateIds: [`component:${page.pageIndex}:${index}`],
        rect: group.rect,
      }),
    );
  return { rects, groups };
}
