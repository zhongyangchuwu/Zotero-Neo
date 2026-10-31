import { fuzzyMatchScore } from '../../ui/fuzzy';
import type { ReaderCaptionTarget } from './caption-targets';

/** Literal page constraints plus fuzzy words; no model request or full-text index is involved. */
export function filterFigureTargets(
  targets: readonly ReaderCaptionTarget[],
  query: string,
): readonly ReaderCaptionTarget[] {
  const pages = [...query.matchAll(/(?:^|\s)p:(\d+)(?=\s|$)/giu)].map((m) => Number(m[1]) - 1);
  const words = query
    .replace(/(?:^|\s)p:\d+(?=\s|$)/giu, ' ')
    .normalize('NFKC')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  return targets
    .map((target, order) => {
      if (pages.length && !pages.includes(target.location.position.pageIndex)) return null;
      const text = `${target.kind === 'figure' ? 'figure fig 图' : 'table 表'} ${target.label} ${target.title} ${target.location.position.pageIndex + 1}`;
      let score = 0;
      for (const word of words) {
        const match = fuzzyMatchScore(text, word);
        if (match === null) return null;
        score += match;
      }
      return { target, score, order };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.target.location.position.pageIndex - b.target.location.position.pageIndex ||
        Math.max(...b.target.location.position.rects.map((r) => r[3])) -
          Math.max(...a.target.location.position.rects.map((r) => r[3])) ||
        a.order - b.order,
    )
    .map((row) => row.target);
}
