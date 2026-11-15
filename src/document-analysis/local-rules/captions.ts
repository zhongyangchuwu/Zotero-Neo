import { documentCaptionIdentity, type DocumentCaptionIdentity } from './caption-identity';
import { bounds, centerX, centerY, contains, height, overlapX, valid, width } from './geometry';
import { lineLeading, proseLine, sameColumn } from './text';
import type { Caption, Line, LocalRuleRect } from './types';

export function captionsFromLines(
  lines: readonly Line[],
  unit: number,
  leading: number,
  graphics: readonly LocalRuleRect[],
): Caption[] {
  const seeds = new Map<Line, DocumentCaptionIdentity>();
  for (const line of lines) {
    const identity = documentCaptionIdentity(line.text);
    if (identity) seeds.set(line, identity);
  }
  const proseLeading = lineLeading(
    lines.filter((line) => !seeds.has(line)),
    unit,
  );
  const separators = graphics.filter(
    (r) => valid(r) && height(r) <= unit * 0.3 && width(r) >= unit * 6,
  );
  const sameParagraphBaseline = (previous: Line, next: Line): boolean => {
    if (
      Math.abs(previous.fontSize - next.fontSize) > unit * 0.05 ||
      Math.abs(previous.rect[0] - next.rect[0]) > unit ||
      !sameColumn(previous.rect, next.rect, unit)
    )
      return false;
    const distance = centerY(previous.rect) - centerY(next.rect);
    const gap = previous.rect[1] - next.rect[3];
    return (
      distance >= unit * 0.7 &&
      distance <= proseLeading * 1.35 &&
      // Native ascent/descent boxes can overlap even on distinct paragraph baselines.
      gap >= -unit * 0.25 &&
      gap <= Math.min(unit * 0.65, proseLeading - height(previous.rect) + unit * 0.25) &&
      !graphics.some(
        (r) =>
          valid(r) &&
          width(r) >= unit * 3 &&
          height(r) >= unit * 2 &&
          contains(r, previous.rect) !== contains(r, next.rect),
      )
    );
  };
  const used = new Set<Line>();
  const captions: Caption[] = [];
  for (const [seed, identity] of seeds) {
    // An unpunctuated label followed by a sentence predicate can start a prose paragraph.
    // Require a matching body-text baseline too: the identity alone remains valid for captions.
    const paragraphReference =
      /^\s*(?:fig(?:ure)?\.?|table)\s*\S+(?<![.:：,，])\s+(?:also\s+)?(?:shows?|illustrates?|summari[sz]es?|presents?|compares?|reports?|describes?|demonstrates?|contains?)\b/iu.test(
        seed.text,
      ) &&
      Math.abs(seed.fontSize - unit) <= unit * 0.05 &&
      lines.some(
        (next) => !seeds.has(next) && proseLine(next, unit) && sameParagraphBaseline(seed, next),
      );
    if (paragraphReference) continue;
    // A numbered reference on the next normal paragraph baseline is not a caption lead.
    if (
      lines.some(
        (previous) =>
          !seeds.has(previous) &&
          proseLine(previous, unit) &&
          sameParagraphBaseline(previous, seed) &&
          (proseLine(seed, unit) ||
            // A short reference can be the final words of an unfinished prose sentence.
            (Math.abs(seed.fontSize - unit) <= unit * 0.05 &&
              !/[.!?。！？]\s*$/u.test(previous.text))),
      )
    )
      continue;
    const parts = [seed];
    used.add(seed);
    let last = seed;
    for (const line of lines) {
      if (line === seed || used.has(line) || seeds.has(line)) continue;
      if (centerY(line.rect) >= centerY(last.rect)) continue;
      const gap = last.rect[1] - line.rect[3];
      if (gap > Math.max(unit * 0.65, leading - height(last.rect) + unit * 0.2)) continue;
      if (gap < -unit * 0.2 || !sameColumn(last.rect, line.rect, unit)) continue;
      // Body prose is commonly only one point larger than a caption; a 15% tolerance crosses
      // that typography boundary and can swallow the paragraph after an otherwise valid caption.
      if (Math.abs(line.fontSize - seed.fontSize) > Math.min(unit, seed.fontSize) * 0.08) continue;
      // A nearby diagram's labels are not caption continuation, even at the same font size.
      if (
        graphics.some(
          (r) =>
            valid(r) &&
            width(r) >= unit * 3 &&
            height(r) >= unit * 2 &&
            contains(r, line.rect) &&
            !contains(r, seed.rect),
        )
      )
        continue;
      // Caption wrapping cannot cross a table's top rule into its header/cells.
      if (
        separators.some(
          (r) =>
            r[1] >= line.rect[3] - unit * 0.1 &&
            r[3] <= last.rect[1] + unit * 0.1 &&
            overlapX(r, seed.rect) >= Math.min(width(r), width(seed.rect)) * 0.6 &&
            overlapX(r, line.rect) >= Math.min(width(r), width(line.rect)) * 0.6,
        )
      )
        continue;
      // Continuations hang under the label or share its left edge; a paragraph indent is a boundary.
      if (
        Math.abs(line.rect[0] - seed.rect[0]) > unit * 3 &&
        Math.abs(centerX(line.rect) - centerX(seed.rect)) > unit * 2
      )
        continue;
      parts.push(line);
      used.add(line);
      last = line;
    }
    captions.push({
      identity,
      lines: parts,
      rect: bounds(parts.map((p) => p.rect)),
      text: parts.map((p) => p.text).join('\n'),
    });
  }
  return captions;
}

/** Long prose and aligned paragraph rows are barriers, not labels inside a plot. */
export function bodyLines(
  lines: readonly Line[],
  captions: readonly Caption[],
  unit: number,
  leading: number,
): Set<Line> {
  const captionLines = new Set(captions.flatMap((c) => c.lines));
  const prose = lines.filter(
    (l) =>
      !captionLines.has(l) &&
      l.fontSize >= unit * 0.85 &&
      l.fontSize <= unit * 1.25 &&
      proseLine(l, unit),
  );
  const barriers = new Set(
    prose.filter(
      (line) =>
        (line.text.length >= 55 && /[.!?。！？,，;；]/u.test(line.text)) ||
        prose.some(
          (other) =>
            other !== line &&
            Math.abs(centerY(other.rect) - centerY(line.rect)) <= leading * 1.6 &&
            Math.abs(centerY(other.rect) - centerY(line.rect)) >= unit * 0.6 &&
            sameColumn(line.rect, other.rect, unit) &&
            Math.abs(line.rect[0] - other.rect[0]) <= unit * 2,
        ),
    ),
  );
  // Short final lines inherit a proved paragraph's typography and line spacing.
  for (const line of lines) {
    if (barriers.has(line) || captionLines.has(line)) continue;
    for (const previous of barriers) {
      const gap = previous.rect[1] - line.rect[3];
      if (
        gap >= -unit * 0.15 &&
        gap <= leading * 0.65 &&
        Math.abs(line.fontSize - previous.fontSize) <= unit * 0.08 &&
        Math.abs(line.rect[0] - previous.rect[0]) <= unit * 2 &&
        sameColumn(line.rect, previous.rect, unit)
      ) {
        barriers.add(line);
        break;
      }
    }
  }
  return barriers;
}
