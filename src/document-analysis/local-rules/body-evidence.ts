import { contains, gapX, height, intersects, overlapY } from './geometry';
import { proseLine } from './text';
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

/** Prove authored panel text and shared definitions against complete painted enclosures. */
export function algorithmPanelLabels(
  boxes: readonly LocalRuleRect[],
  lines: readonly Line[],
  captions: readonly Caption[],
  unit: number,
  leading: number,
  maxFontSizeEm: number,
  maxGapEm: number,
): Set<Line>[] {
  const labels = boxes.map(
    (rect) => new Set(algorithmPanelLines(rect, lines, captions, unit, maxFontSizeEm)),
  );
  const captionLines = new Set(captions.flatMap((caption) => caption.lines));
  // Shared small-type definitions need authored peers, an explicit reference and an equation.
  labels.forEach((members, index) => {
    if (!members.size) return;
    const box = boxes[index]!;
    boxes.forEach((peer, peerIndex) => {
      if (
        peerIndex === index ||
        !labels[peerIndex]!.size ||
        peer[1] >= box[1] ||
        gapX(box, peer) <= 0 ||
        overlapY(box, peer) < Math.min(height(box), height(peer)) * 0.5
      )
        return;
      const note = lines.filter(
        (line) =>
          line.rect[0] >= box[0] - unit * maxGapEm &&
          line.rect[2] <= box[2] + unit * maxGapEm &&
          line.rect[3] <= box[1] &&
          line.rect[3] >= peer[1] - leading &&
          line.fontSize <= unit * maxFontSizeEm &&
          !captionLines.has(line) &&
          !captions.some((caption) => intersects(caption.rect, line.rect)),
      );
      if (
        !note.some((line) => /\b(?:both|these)\s+algorithms\b/iu.test(line.text)) ||
        !note.some((line) => /[∑∏∫]/u.test(line.text)) ||
        !note.some((line) => /=/u.test(line.text)) ||
        note.some((line) => proseLine(line, unit) && line.fontSize >= unit * 0.95)
      )
        return;
      for (const line of note) members.add(line);
    });
  });
  return labels;
}
