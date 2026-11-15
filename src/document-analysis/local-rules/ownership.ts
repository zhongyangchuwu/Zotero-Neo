import { bodiesForCaption } from './association';
import { region } from './regions';
import type { Body, Graphic, LocalRuleRegion, PageTextLayout, RuleContext } from './types';

export function pageFigureRegions(
  pageIndex: number,
  layout: PageTextLayout,
  graphics: readonly Graphic[],
  context: RuleContext,
): LocalRuleRegion[] {
  const { captions, lines, barriers, unit, leading } = layout;
  const owners = new Map<Graphic, number>();
  const propose = (): Body[][] =>
    captions.map((caption, index) =>
      bodiesForCaption(
        caption,
        captions,
        graphics.filter((graphic) => !owners.has(graphic) || owners.get(graphic) === index),
        lines,
        barriers,
        unit,
        leading,
        context,
      ),
    );
  let proposals = propose();
  // Resolve stacked objects by uncontested single-band anchors, never by preferring a distance or
  // caption orientation. Equal competing singletons remain conflicts and are dropped below.
  for (let round = 0; round < captions.length; round++) {
    const claims = new Map<Graphic, number>();
    for (const proposal of proposals) {
      for (const body of proposal) claims.set(body.graphic, (claims.get(body.graphic) ?? 0) + 1);
    }
    let changed = false;
    proposals.forEach((proposal, index) => {
      if (proposal.some((body) => claims.get(body.graphic)! > 1)) return;
      for (const body of proposal) {
        if (!owners.has(body.graphic)) {
          owners.set(body.graphic, index);
          changed = true;
        }
      }
    });
    if (!changed) break;
    proposals = propose();
  }
  const claims = new Map<Graphic, number>();
  for (const proposal of proposals) {
    for (const body of proposal) claims.set(body.graphic, (claims.get(body.graphic) ?? 0) + 1);
  }
  const regions: LocalRuleRegion[] = [];
  captions.forEach((caption, index) => {
    const proposed = proposals[index]!;
    const conflict = proposed.some((body) => claims.get(body.graphic)! > 1);
    const bodies = conflict ? [] : proposed;
    if (conflict)
      context.observe?.({
        pageIndex,
        ruleId: 'ownership',
        outcome: 'ambiguous',
        reason: 'shared-body-ownership',
        captionId: `local:${pageIndex}:caption:${index}`,
        candidateIds: proposed.map((body) => `graphic:${pageIndex}:${body.graphic.index}`),
      });
    const id = `local:${pageIndex}:caption:${index}`;
    const object = bodies.length ? { id: `object:${id}`, kind: caption.identity.kind } : undefined;
    regions.push(region(id, pageIndex, 'caption', caption.rect, caption.text, object));
    for (const body of bodies) {
      context.observe?.({
        pageIndex,
        ruleId: 'captionAssociation',
        outcome: 'accepted',
        reason: 'uncontested-body',
        captionId: id,
        candidateIds: [`graphic:${pageIndex}:${body.graphic.index}`],
        rect: body.rect,
      });
      regions.push(
        region(
          `local:${pageIndex}:body:${body.graphic.index}`,
          pageIndex,
          caption.identity.kind === 'table' ? 'table' : 'image',
          body.rect,
          body.text,
          object,
        ),
      );
    }
  });
  return regions;
}
