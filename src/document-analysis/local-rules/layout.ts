import { bodyLines, captionsFromLines } from './captions';
import { height, intersects, valid, width } from './geometry';
import { lineLeading, textLines, textScale } from './text';
import type { LocalFigurePage, PageTextLayout, RuleContext } from './types';

export function pageTextLayout(page: LocalFigurePage, context: RuleContext): PageTextLayout | null {
  if (!valid(page.viewBox)) return null;
  const text = page.text.filter(
    (t) => t.text.trim() && valid(t.rect) && intersects(page.viewBox, t.rect),
  );
  const unit = textScale(text, Math.min(width(page.viewBox), height(page.viewBox)) / 60);
  const lines = textLines(text, unit);
  const leading = lineLeading(lines, unit);
  const captions = captionsFromLines(lines, unit, leading, page.graphics);
  if (context.observe) {
    captions.forEach((caption, index) =>
      context.observe?.({
        pageIndex: page.pageIndex,
        ruleId: 'captions',
        outcome: 'accepted',
        reason: 'authored-caption',
        captionId: `local:${page.pageIndex}:caption:${index}`,
        rect: caption.rect,
      }),
    );
  }
  if (!captions.length)
    context.observe?.({
      pageIndex: page.pageIndex,
      ruleId: 'captions',
      outcome: 'rejected',
      reason: 'missing-caption-evidence',
    });
  return { unit, lines, leading, captions, barriers: bodyLines(lines, captions, unit, leading) };
}
