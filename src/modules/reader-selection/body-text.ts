import type { DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderTextSourceLocation } from '../../toolkit/reader';

/** Selection policy keeps formulas in the reading flow; figures, tables and excluded margin text are auxiliary. */
export function bodyTextAdmission(
  regions: readonly DocumentRegion[],
): (source: ReaderTextSourceLocation) => boolean {
  const excluded = regions.filter(
    (region) =>
      region.flow === 'excluded' || (region.kind !== 'formula' && region.flow === 'auxiliary'),
  );
  const blocks = new Set(
    excluded.flatMap((region) => (region.sourceBlock ? [region.sourceBlock.id] : [])),
  );
  const pages = new Map<number, (readonly number[])[]>();
  for (const region of excluded) {
    const rects = pages.get(region.pageIndex) ?? [];
    rects.push(region.rect);
    pages.set(region.pageIndex, rects);
  }
  return (source) => {
    if (source.sourceBlockId) return !blocks.has(source.sourceBlockId);
    const rect = source.rect;
    if (source.pageIndex === null || !rect || rect[2]! <= rect[0]! || rect[3]! <= rect[1]!)
      return true;
    const centerX = (rect[0]! + rect[2]!) / 2;
    const centerY = (rect[1]! + rect[3]!) / 2;
    return !(pages.get(source.pageIndex) ?? []).some((box) => {
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
        width / (rect[2]! - rect[0]!) >= 0.9
      );
    });
  };
}
