import type { DocumentRect, DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderTextSourceLocation } from '../../toolkit/reader';

function hasGeometry(rect: readonly number[]): boolean {
  return (
    rect.length === 4 && rect.every(Number.isFinite) && rect[2]! > rect[0]! && rect[3]! > rect[1]!
  );
}

export function isBodyExclusion(region: DocumentRegion): boolean {
  return (
    hasGeometry(region.rect) &&
    (region.flow === 'excluded' || (region.kind !== 'formula' && region.flow === 'auxiliary'))
  );
}

/** Selection policy keeps formulas in the reading flow; figures, tables and excluded margin text are auxiliary. */
export function bodyTextAdmission(
  regions: readonly DocumentRegion[],
): (source: ReaderTextSourceLocation) => boolean {
  const pages = new Map<number, { excluded: DocumentRect[]; body: DocumentRect[] }>();
  for (const region of regions) {
    if (!hasGeometry(region.rect)) continue;
    const page = pages.get(region.pageIndex) ?? { excluded: [], body: [] };
    (isBodyExclusion(region) ? page.excluded : page.body).push(region.rect);
    pages.set(region.pageIndex, page);
  }
  return (source) => {
    const { pageIndex, rect } = source;
    if (pageIndex === null || !rect || !hasGeometry(rect)) return true;
    const page = pages.get(pageIndex);
    if (!page?.excluded.length) return true;
    const centerX = (rect[0]! + rect[2]!) / 2;
    const centerY = (rect[1]! + rect[3]!) / 2;
    const covers = (box: readonly number[]): boolean => {
      const width = Math.max(
        0,
        Math.min(rect[2]!, box[2]! + 0.5) - Math.max(rect[0]!, box[0]! - 0.5),
      );
      // Native ink boxes are shorter than DOM font boxes. Compare vertical
      // centers while keeping horizontal coverage strict to avoid other columns.
      return (
        centerX >= box[0]! - 0.5 &&
        centerX <= box[2]! + 0.5 &&
        centerY >= box[1]! - 0.5 &&
        centerY <= box[3]! + 0.5 &&
        width / (rect[2]! - rect[0]!) >= (source.vertical ? 0.7 : 0.9)
      );
    };
    const covered = (boxes: readonly (readonly number[])[]): boolean => {
      if (!source.vertical) return boxes.some(covers);
      // A rotated PDF text span can contain many native character runs separated
      // by spaces. Require coverage of its length rather than a character at its midpoint.
      const intervals = boxes
        .flatMap((box) => {
          const width = Math.max(
            0,
            Math.min(rect[2]!, box[2]! + 0.5) - Math.max(rect[0]!, box[0]! - 0.5),
          );
          const start = Math.max(rect[1]!, box[1]! - 0.5),
            end = Math.min(rect[3]!, box[3]! + 0.5);
          return width / (rect[2]! - rect[0]!) >= 0.7 && end > start ? [[start, end] as const] : [];
        })
        .sort(([a], [b]) => a - b);
      let end = -Infinity,
        length = 0;
      for (const [start, stop] of intervals) {
        length += Math.max(0, stop - Math.max(start, end));
        end = Math.max(end, stop);
      }
      return length / (rect[3]! - rect[1]!) >= 0.9;
    };
    // Conflicting layout is not sufficient evidence to remove real body text.
    return covered(page.body) || !covered(page.excluded);
  };
}
