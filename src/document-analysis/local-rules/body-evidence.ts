import { contains, intersects } from './geometry';
import type { Caption, Line, LocalRuleRect } from './types';

/** An authored algorithm lead and repeated instructions prove text inside a painted frame. */
export function algorithmPanelLines(
  rect: LocalRuleRect,
  lines: readonly Line[],
  captions: readonly Caption[],
  unit: number,
  maxFontSizeEm = 1.4,
): readonly Line[] {
  const enclosed = lines.filter(
    (line) =>
      line.fontSize <= unit * maxFontSizeEm &&
      contains(rect, line.rect, unit * 0.2) &&
      !captions.some((caption) => intersects(caption.rect, line.rect)),
  );
  if (
    !enclosed.some(
      (line) => /^Algorithm\s+\d+\b/iu.test(line.text) && rect[3] - line.rect[3] <= unit * 2,
    )
  )
    return [];
  const numbered = enclosed.filter((line) => /^\d+:\s*\S/u.test(line.text));
  const controls = enclosed.filter((line) =>
    /^(?:\d+:\s*)?(?:if|for|while|return|end\s+(?:if|for|while))\b/iu.test(line.text),
  );
  return numbered.length >= 3 || controls.length >= 3 ? enclosed : [];
}
