import type { LocalRuleRect, LocalRuleRegion } from './types';

export function region(
  id: string,
  pageIndex: number,
  kind: LocalRuleRegion['kind'],
  rect: LocalRuleRect,
  text: string,
  sourceObject?: LocalRuleRegion['sourceObject'],
): LocalRuleRegion {
  return {
    id,
    pageIndex,
    kind,
    rect,
    text,
    format: 'text',
    flow: 'auxiliary',
    anchorPrecision: 'region',
    ...(sourceObject ? { sourceObject } : {}),
  };
}
