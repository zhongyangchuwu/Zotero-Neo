import {
  bounds,
  contains,
  corridor,
  gapY,
  height,
  intersects,
  overlapX,
  overlapY,
  width,
} from './geometry';
import { compoundPanelBands } from './compound-panels';
import { expansionBarrier } from './expansion';
import { sameColumn } from './text';
import type { Body, Caption, Graphic, Line, RuleContext } from './types';

export function bodiesForCaption(
  caption: Caption,
  captions: readonly Caption[],
  graphics: readonly Graphic[],
  lines: readonly Line[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): Body[] {
  const { maxDistanceLines, minWidthEm, minHeightEm } = context.profile.association;
  const { enabled: joinPanels, maxGapEm } = context.profile.rules.compoundPanels;
  const captionId = context.observe
    ? `local:${context.pageIndex}:caption:${captions.indexOf(caption)}`
    : undefined;
  const above: Graphic[] = [],
    below: Graphic[] = [];
  const barrierLines = [...barriers];
  for (const graphic of graphics) {
    const r = graphic.rect;
    if (width(r) < unit * minWidthEm || height(r) < unit * minHeightEm) continue;
    if (!sameColumn(caption.rect, r, unit)) continue;
    const direction =
      r[1] >= caption.rect[3] - unit * 0.15
        ? above
        : r[3] <= caption.rect[1] + unit * 0.15
          ? below
          : null;
    if (!direction) continue;
    // A farther row may continue a near-caption band, not annex a separate neighboring object.
    const farther = gapY(caption.rect, r) > leading * maxDistanceLines;
    const continuesNearBand =
      farther &&
      joinPanels &&
      graphics.some(
        (nearer) =>
          nearer !== graphic &&
          gapY(caption.rect, nearer.rect) <= leading * maxDistanceLines &&
          gapY(r, nearer.rect) <= unit * maxGapEm &&
          sameColumn(r, nearer.rect, unit),
      );
    if (
      farther &&
      captions.some(
        (other) =>
          other !== caption &&
          (!continuesNearBand ||
            other.identity.kind !== caption.identity.kind ||
            (direction === above
              ? r[1] >= other.rect[3] - unit * 0.15
              : r[3] <= other.rect[1] + unit * 0.15)) &&
          sameColumn(other.rect, r, unit) &&
          !intersects(other.rect, r) &&
          gapY(other.rect, r) <= leading * maxDistanceLines,
      )
    )
      continue;
    context.observe?.({
      pageIndex: context.pageIndex,
      ruleId: 'captionAssociation',
      outcome: 'candidate',
      reason: 'aligned-body',
      captionId,
      candidateIds: [`graphic:${context.pageIndex}:${graphic.index}`],
      rect: r,
    });
    const passage = corridor(caption.rect, r);
    if (
      barrierLines.some(
        (line) =>
          !graphic.labels.has(line) &&
          overlapX(line.rect, r) > width(line.rect) * 0.5 &&
          overlapY(line.rect, r) > height(line.rect) * 0.5,
      )
    ) {
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'captionAssociation',
        outcome: 'rejected',
        reason: 'prose-barrier',
        captionId,
        candidateIds: [`graphic:${context.pageIndex}:${graphic.index}`],
        rect: r,
      });
      continue;
    }
    if (
      captions.some(
        (other) =>
          other !== caption && (intersects(other.rect, passage) || intersects(other.rect, r)),
      )
    ) {
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'captionAssociation',
        outcome: 'rejected',
        reason: 'caption-barrier',
        captionId,
        candidateIds: [`graphic:${context.pageIndex}:${graphic.index}`],
        rect: passage,
      });
      continue;
    }
    direction.push(graphic);
  }
  const bands: Graphic[][] = [];
  for (const direction of [above, below]) {
    for (const connected of compoundPanelBands(direction, unit, context)) {
      // Test a compound band's passage against all its proved labels, not only its farthest
      // panel's labels. A nearer panel subcaption is not intervening document prose.
      const band = bounds(connected.map((graphic) => graphic.rect));
      const passage = corridor(caption.rect, band);
      if (
        connected.some(
          (graphic) => gapY(graphic.rect, caption.rect) <= leading * maxDistanceLines,
        ) &&
        !barrierLines.some(
          (line) =>
            (intersects(line.rect, band) || intersects(line.rect, passage)) &&
            !connected.some((graphic) => graphic.labels.has(line)),
        ) &&
        !captions.some((other) => other !== caption && intersects(other.rect, band))
      ) {
        bands.push([...connected]);
        if (connected.length > 1)
          context.observe?.({
            pageIndex: context.pageIndex,
            ruleId: 'compoundPanels',
            outcome: 'accepted',
            reason: 'unobstructed-panel-band',
            captionId,
            candidateIds: connected.map(
              (graphic) => `graphic:${context.pageIndex}:${graphic.index}`,
            ),
            rect: band,
          });
      } else
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'captionAssociation',
          outcome: 'rejected',
          reason: connected.every(
            (graphic) => gapY(graphic.rect, caption.rect) > leading * maxDistanceLines,
          )
            ? 'outside-association-distance'
            : 'prose-or-caption-barrier',
          captionId,
          candidateIds: connected.map((graphic) => `graphic:${context.pageIndex}:${graphic.index}`),
          rect: band,
        });
    }
  }
  // Both directions, or disconnected nearby bands, are competing hypotheses. Do not guess.
  if (bands.length !== 1) {
    context.observe?.({
      pageIndex: context.pageIndex,
      ruleId: 'captionAssociation',
      outcome: bands.length > 1 ? 'ambiguous' : 'rejected',
      reason: bands.length > 1 ? 'competing-bands' : 'missing-uncontested-band',
      captionId,
      candidateIds: bands.flatMap((band) =>
        band.map((graphic) => `graphic:${context.pageIndex}:${graphic.index}`),
      ),
    });
    return [];
  }
  const selected = bands[0]!.sort((a, b) => a.index - b.index);
  const allCaptionLines = new Set(captions.flatMap((c) => c.lines));
  return selected.map((graphic) => {
    const labels: Line[] = [];
    let rect = graphic.rect;
    for (const line of lines) {
      if (
        allCaptionLines.has(line) ||
        (barriers.has(line) && !graphic.labels.has(line)) ||
        (caption.identity.kind !== 'table' &&
          !context.profile.rules.graphicLabels.enabled &&
          !graphic.labels.has(line)) ||
        line.fontSize >
          unit *
            (caption.identity.kind === 'table'
              ? 1.4
              : context.profile.rules.graphicLabels.maxFontSizeEm) ||
        !contains(
          graphic.rect,
          line.rect,
          unit *
            (caption.identity.kind === 'table'
              ? 0.8
              : context.profile.rules.graphicLabels.maxGapEm),
        )
      )
        continue;
      const expanded = bounds([rect, line.rect]);
      const barrier = expansionBarrier(rect, expanded, captions, barriers, graphic.labels);
      if (barrier) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'captionAssociation',
          outcome: 'rejected',
          reason: `label-expansion-${barrier}`,
          captionId,
          candidateIds: [`graphic:${context.pageIndex}:${graphic.index}`],
          rect: expanded,
        });
        continue;
      }
      rect = expanded;
      labels.push(line);
    }
    return {
      graphic,
      rect,
      text: labels.map((l) => l.text).join('\n'),
    };
  });
}
