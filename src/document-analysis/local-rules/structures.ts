import { bounds, height, readingOrder, width } from './geometry';
import { graphicTextLabels } from './graphic-labels';
import { pageLike, paintedComponents } from './painted-components';
import { ruledTableLinks } from './ruled-tables';
import { tableComponentLabels } from './table-membership';
import { tableTextGroups } from './unruled-tables';
import type {
  ComponentLink,
  Graphic,
  Line,
  LocalFigurePage,
  LocalRuleRect,
  PageTextLayout,
  RuleContext,
} from './types';

/** Generic shared joining owns the only cross-rule union-find and never mutates evidence. */
function joinStructures(
  page: LocalFigurePage,
  boxes: readonly LocalRuleRect[],
  labels: readonly ReadonlySet<Line>[],
  links: readonly ComponentLink[],
): Graphic[] {
  const ruleParents = boxes.map((_, index) => index);
  const ruleRoot = (index: number): number => {
    while (ruleParents[index] !== index) {
      ruleParents[index] = ruleParents[ruleParents[index]!]!;
      index = ruleParents[index]!;
    }
    return index;
  };
  // A label bridging two painted branches joins their components, not arbitrary whitespace.
  const labelOwners = new Map<Line, number>();
  labels.forEach((members, index) => {
    for (const line of members) {
      const previous = labelOwners.get(line);
      if (previous !== undefined) ruleParents[ruleRoot(index)] = ruleRoot(previous);
      else labelOwners.set(line, index);
    }
  });
  for (const link of links) ruleParents[ruleRoot(link.to)] = ruleRoot(link.from);
  const structures = new Map<number, { rects: LocalRuleRect[]; labels: Set<Line> }>();
  boxes.forEach((rect, index) => {
    const key = ruleRoot(index);
    const members = structures.get(key) ?? { rects: [], labels: new Set<Line>() };
    members.rects.push(rect);
    for (const line of labels[index]!) {
      members.labels.add(line);
      members.rects.push(line.rect);
    }
    structures.set(key, members);
  });
  return [...structures.values()]
    .map((members) => ({ rect: bounds(members.rects), labels: members.labels }))
    .filter((graphic) => !pageLike(page, graphic.rect))
    .sort((a, b) => readingOrder(a.rect, b.rect))
    .map((graphic, index) => ({ ...graphic, index }));
}

export function graphicsFromPage(
  page: LocalFigurePage,
  layout: PageTextLayout,
  context: RuleContext,
): Graphic[] {
  const { unit, leading, lines, captions, barriers } = layout;
  const { rects, groups } = paintedComponents(page, unit, barriers, captions, context);
  const tables = tableTextGroups(lines, captions, rects, barriers, unit, leading, context);
  const boxes = [...groups.map((group) => group.rect), ...tables.map((table) => table.rect)];
  const connectors = [
    ...groups.map((group) =>
      group.members.some(
        (rect) =>
          (width(rect) <= unit * 0.6 && height(rect) >= Math.max(unit * 1.5, width(rect) * 4)) ||
          (height(rect) <= unit * 0.3 && width(rect) >= unit * 1.5),
      ),
    ),
    ...tables.map(() => false),
  ];
  const reserved = new Set(tables.flatMap((table) => [...table.labels]));
  const graphicLabels = graphicTextLabels(
    boxes,
    connectors,
    lines,
    captions,
    barriers,
    reserved,
    unit,
    leading,
    context,
  );
  const tableLabels = tableComponentLabels(
    tables,
    groups,
    captions,
    barriers,
    unit,
    leading,
    context,
  );
  // Combine independent memberships here, rather than allowing rules to modify one another.
  const labels = boxes.map(
    (_, index) => new Set([...graphicLabels[index]!, ...tableLabels[index]!]),
  );
  const links = ruledTableLinks(boxes, labels, lines, captions, barriers, unit, leading, context);
  return joinStructures(page, boxes, labels, links);
}
