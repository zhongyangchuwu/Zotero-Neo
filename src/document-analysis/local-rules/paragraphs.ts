import { bounds, centerX, centerY, height, readingOrder } from './geometry';
import { region } from './regions';
import { sameColumn } from './text';
import type { Line, LocalRuleRegion, PageTextLayout } from './types';

/** Paragraph membership consumes explicit exclusions, with no hidden figure state. */
export function paragraphRegions(
  pageIndex: number,
  layout: PageTextLayout,
  excludedLines: ReadonlySet<Line>,
  firstOrder: number,
): LocalRuleRegion[] {
  const { unit, leading } = layout;
  const lines = layout.lines.filter((line) => !excludedLines.has(line));
  const headings = new Set(
    lines.filter((line) => {
      if (
        line.text.length > 120 ||
        line.text.split(/\s+/u).length > 18 ||
        /[.!?。！？;；]$/u.test(line.text)
      )
        return false;
      if (line.fontSize >= unit * 1.25) return true;
      if (
        line.fontSize < unit * 0.95 ||
        !/^(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+\p{L}/u.test(line.text)
      )
        return false;
      // Same-size numbered section titles need whitespace evidence as well as a short title.
      if (line.text.split(/\s+/u).length > 10) return false;
      const neighbors = lines.filter(
        (other) => other !== line && sameColumn(line.rect, other.rect, unit),
      );
      const above = neighbors.filter((other) => other.rect[1] >= line.rect[3]);
      const below = neighbors.filter((other) => other.rect[3] <= line.rect[1]);
      return (
        above.every((other) => other.rect[1] - line.rect[3] >= unit * 0.65) &&
        below.every((other) => line.rect[1] - other.rect[3] >= unit * 0.4)
      );
    }),
  );
  const paragraphs: { lines: Line[]; heading: boolean }[] = [];
  for (const line of lines) {
    const heading = headings.has(line);
    const matches = paragraphs.filter((paragraph) => {
      if (paragraph.heading !== heading) return false;
      const last = paragraph.lines[paragraph.lines.length - 1]!;
      const distance = centerY(last.rect) - centerY(line.rect);
      if (
        distance < unit * 0.55 ||
        distance > leading * 1.65 ||
        last.rect[1] - line.rect[3] >
          Math.max(unit * 0.7, leading - height(last.rect) + unit * 0.35) ||
        Math.abs(last.fontSize - line.fontSize) > unit * 0.12 ||
        !sameColumn(last.rect, line.rect, unit)
      )
        return false;
      const left = Math.min(...paragraph.lines.map((part) => part.rect[0]));
      if (heading)
        return (
          Math.abs(centerX(last.rect) - centerX(line.rect)) <= unit * 2 ||
          Math.abs(last.rect[0] - line.rect[0]) <= unit
        );
      const hanging = /^(?:[-•*]|\d+[.)])\s/u.test(paragraph.lines[0]!.text);
      return line.rect[0] <= left + unit * 0.8 || hanging;
    });
    if (matches.length === 1) matches[0]!.lines.push(line);
    else paragraphs.push({ lines: [line], heading });
  }
  return paragraphs
    .map((paragraph) => ({ ...paragraph, rect: bounds(paragraph.lines.map((line) => line.rect)) }))
    .sort((a, b) => readingOrder(a.rect, b.rect))
    .map((paragraph, index) => {
      let content = '';
      for (const line of paragraph.lines) {
        const joined =
          /[-\u00ad]$/u.test(content) ||
          (/[\u3400-\u9fff]$/u.test(content) && /^[\u3400-\u9fff]/u.test(line.text));
        content = content.replace(/\u00ad$/u, '') + (content && !joined ? ' ' : '') + line.text;
      }
      const id = `local:${pageIndex}:paragraph:${index}`;
      return {
        ...region(id, pageIndex, paragraph.heading ? 'heading' : 'text', paragraph.rect, content),
        flow: 'body' as const,
        sourceBlock: { id, order: firstOrder + index },
      };
    });
}
