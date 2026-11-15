import { overlapX, overlapY } from './geometry';
import type { Caption, Line, LocalRuleRect } from './types';

function overlapArea(a: LocalRuleRect, b: LocalRuleRect): number {
  return Math.max(0, overlapX(a, b)) * Math.max(0, overlapY(a, b));
}

/** Keep accepted edge tolerance, but never grow label bounds farther into prose or a caption. */
export function expansionBarrier(
  base: LocalRuleRect,
  expanded: LocalRuleRect,
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  members: ReadonlySet<Line>,
): 'prose-barrier' | 'caption-barrier' | null {
  for (const line of barriers) {
    if (!members.has(line) && overlapArea(expanded, line.rect) > overlapArea(base, line.rect))
      return 'prose-barrier';
  }
  for (const caption of captions) {
    if (overlapArea(expanded, caption.rect) > overlapArea(base, caption.rect))
      return 'caption-barrier';
  }
  return null;
}
