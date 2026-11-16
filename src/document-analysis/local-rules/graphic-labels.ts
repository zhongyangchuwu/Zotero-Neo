import { algorithmPanelLabels } from './body-evidence';
import { expansionBarrier } from './expansion';
import {
  bounds,
  centerY,
  corridor,
  gapX,
  gapY,
  height,
  intersects,
  overlapX,
  overlapY,
  width,
} from './geometry';
import { panelCaptionLead, proseLine } from './text';
import type {
  Caption,
  ComponentLink,
  Line,
  LocalRuleRect,
  PaintedComponent,
  RuleContext,
} from './types';

/**
 * Painted connectors can share small node labels. Other labels need an uncontested nearest
 * component; panel subcaptions may wrap, but normal prose remains a barrier.
 */
export function graphicTextLabels(
  boxes: readonly LocalRuleRect[],
  connectors: readonly boolean[],
  lines: readonly Line[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  reserved: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): Set<Line>[] {
  const { enabled, maxFontSizeEm, maxGapEm } = context.profile.rules.graphicLabels;
  if (!enabled) return boxes.map(() => new Set<Line>());
  const captionLines = new Set(captions.flatMap((caption) => caption.lines));
  const labels = algorithmPanelLabels(
    boxes,
    lines,
    captions,
    unit,
    leading,
    maxFontSizeEm,
    maxGapEm,
  );
  const panelLabels = new Set<Line>();
  const barrierLines = [...barriers];
  const hasPanels = lines.some((line) => panelCaptionLead(line.text));
  // Panel distance starts at the completed ordinary-label envelope, not the bare path.
  // Freeze those envelopes before assigning siblings so one subcaption cannot grow another.
  for (let pass = 0; pass < (hasPanels ? 2 : 1); pass++) {
    const adjacentBoxes =
      pass === 0
        ? boxes
        : boxes.map((rect, index) =>
            labels[index]!.size
              ? bounds([rect, ...Array.from(labels[index]!, (line) => line.rect)])
              : rect,
          );
    for (const line of lines) {
      const panelLead = panelCaptionLead(line.text);
      if (panelLead !== (pass === 1)) continue;
      if (labels.some((members) => members.has(line))) continue;
      if (
        captionLines.has(line) ||
        reserved.has(line) ||
        line.fontSize > unit * maxFontSizeEm ||
        captions.some((caption) => intersects(caption.rect, line.rect))
      )
        continue;
      if (
        (barriers.has(line) || (line.fontSize >= unit * 0.85 && proseLine(line, unit))) &&
        !panelLead
      )
        continue;
      const candidates: { index: number; distance: number }[] = [];
      adjacentBoxes.forEach((r, index) => {
        const painted = boxes[index]!;
        const structure = width(painted) >= unit * 3 && height(painted) >= unit * 2;
        const connectorLabel = connectors[index] && line.fontSize < unit * 0.85;
        if (!structure && !connectorLabel) return;
        const beside =
          gapX(r, line.rect) <= unit * maxGapEm &&
          overlapY(r, line.rect) >= Math.min(height(r), height(line.rect)) * 0.25;
        const aboveBelow =
          gapY(r, line.rect) <= leading &&
          overlapX(r, line.rect) >= Math.min(width(r), width(line.rect)) * 0.5;
        if (!beside && !aboveBelow) return;
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'graphicLabels',
          outcome: 'candidate',
          reason: 'adjacent-text',
          candidateIds: [`component:${context.pageIndex}:${index}`],
          rect: line.rect,
        });
        const passage = corridor(r, line.rect);
        if (
          captions.some(
            (caption) => intersects(caption.rect, passage) || intersects(caption.rect, r),
          ) ||
          barrierLines.some(
            (other) => other !== line && !panelLabels.has(other) && intersects(other.rect, passage),
          )
        ) {
          context.observe?.({
            pageIndex: context.pageIndex,
            ruleId: 'graphicLabels',
            outcome: 'rejected',
            reason: 'prose-or-caption-barrier',
            candidateIds: [`component:${context.pageIndex}:${index}`],
            rect: passage,
          });
          return;
        }
        if (
          connectors[index] &&
          line.fontSize < unit * 0.85 &&
          (beside || gapY(r, line.rect) <= unit * 0.3)
        )
          labels[index]!.add(line);
        if (structure)
          candidates.push({ index, distance: gapX(r, line.rect) + gapY(r, line.rect) });
      });
      candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);
      if (!candidates.length) continue;
      if (candidates[1] && candidates[1].distance === candidates[0]!.distance) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'graphicLabels',
          outcome: 'ambiguous',
          reason: 'competing-components',
          candidateIds: candidates.map(
            (candidate) => `component:${context.pageIndex}:${candidate.index}`,
          ),
          rect: line.rect,
        });
        continue;
      }
      const owner = candidates[0]!.index;
      labels[owner]!.add(line);
      if (panelLead) panelLabels.add(line);
    }
  }
  for (const seed of panelLabels) {
    const owner = labels.findIndex((members) => members.has(seed));
    let last = seed;
    for (const line of lines) {
      if (
        centerY(line.rect) >= centerY(last.rect) ||
        captionLines.has(line) ||
        reserved.has(line) ||
        line.fontSize > unit * maxFontSizeEm ||
        panelCaptionLead(line.text) ||
        Math.abs(line.fontSize - seed.fontSize) > unit * 0.08 ||
        Math.abs(line.rect[0] - seed.rect[0]) > unit ||
        last.rect[1] - line.rect[3] < -unit * 0.1 ||
        last.rect[1] - line.rect[3] > unit * 0.65
      )
        continue;
      // Wrapping is anchored by the panel lead and typography, not a fixed number of lines.
      if (
        boxes.some(
          (box, index) =>
            index !== owner &&
            width(box) >= unit * 3 &&
            height(box) >= unit * 2 &&
            intersects(box, line.rect),
        )
      )
        continue;
      labels[owner]!.add(line);
      last = line;
    }
  }
  if (context.observe)
    labels.forEach((members, index) => {
      for (const line of members)
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'graphicLabels',
          outcome: 'accepted',
          reason: 'proved-label-membership',
          candidateIds: [`component:${context.pageIndex}:${index}`],
          rect: line.rect,
        });
    });
  return labels;
}

/**
 * Small native glyph/tag paths need a unique structural owner within one text baseline.
 * Join their real ink bounds, not empty padding; prose, captions and competing owners veto.
 */
export function nativeGraphicLabelLinks(
  groups: readonly PaintedComponent[],
  labels: readonly ReadonlySet<Line>[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): ComponentLink[] {
  const { enabled, maxFontSizeEm } = context.profile.rules.graphicLabels;
  if (!enabled) return [];
  const minWidth = unit * context.profile.association.minWidthEm;
  const minHeight = unit * context.profile.association.minHeightEm;
  const links: ComponentLink[] = [];
  for (let child = 0; child < groups.length; child++) {
    const small = groups[child]!.rect;
    if (
      width(small) >= minWidth ||
      height(small) >= minHeight ||
      height(small) > unit * maxFontSizeEm
    )
      continue;
    let owner = -1;
    let nearest = Infinity;
    let competing = -1;
    for (let index = 0; index < groups.length; index++) {
      if (index === child) continue;
      const parent = groups[index]!.rect;
      if (width(parent) < minWidth || height(parent) < minHeight) continue;
      const beside =
        gapX(parent, small) <= leading &&
        overlapY(parent, small) >= Math.min(height(parent), height(small)) * 0.25;
      const aboveBelow =
        gapY(parent, small) <= leading &&
        overlapX(parent, small) >= Math.min(width(parent), width(small)) * 0.5;
      if (!beside && !aboveBelow) continue;
      const enclosure = bounds([parent, small]);
      const barrier = expansionBarrier(parent, enclosure, captions, barriers, labels[index]!);
      if (barrier) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'graphicLabels',
          outcome: 'rejected',
          reason: barrier,
          candidateIds: [`component:${context.pageIndex}:${index}`],
          rect: enclosure,
        });
        continue;
      }
      const distance = gapX(parent, small) + gapY(parent, small);
      if (distance < nearest) {
        owner = index;
        nearest = distance;
        competing = -1;
      } else if (distance === nearest) competing = index;
    }
    if (owner < 0) continue;
    if (competing >= 0) {
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'graphicLabels',
        outcome: 'ambiguous',
        reason: 'competing-components',
        candidateIds: [
          `component:${context.pageIndex}:${owner}`,
          `component:${context.pageIndex}:${competing}`,
        ],
        rect: small,
      });
      continue;
    }
    links.push({ from: owner, to: child });
    context.observe?.({
      pageIndex: context.pageIndex,
      ruleId: 'graphicLabels',
      outcome: 'accepted',
      reason: 'native-glyph-membership',
      candidateIds: [
        `component:${context.pageIndex}:${owner}`,
        `component:${context.pageIndex}:${child}`,
      ],
      rect: small,
    });
  }
  return links;
}
