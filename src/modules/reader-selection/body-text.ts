import type { DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderTextSourceLocation } from '../../toolkit/reader';

/** Selection policy keeps formulas in the reading flow; figures, tables and excluded margin text are auxiliary. */
export function bodyTextAdmission(
  regions: readonly DocumentRegion[],
  nativeRegions: readonly DocumentRegion[] = regions,
): (source: ReaderTextSourceLocation) => boolean {
  const excluded = (region: DocumentRegion): boolean =>
    region.flow === 'excluded' || (region.kind !== 'formula' && region.flow === 'auxiliary');
  const pages = new Map<number, { excluded: (readonly number[])[]; body: (readonly number[])[] }>();
  for (const region of regions) {
    const page = pages.get(region.pageIndex) ?? { excluded: [], body: [] };
    (excluded(region) ? page.excluded : page.body).push(region.rect);
    pages.set(region.pageIndex, page);
  }
  const acceptsGeometry = (source: ReaderTextSourceLocation): boolean => {
    const rect = source.rect;
    if (source.pageIndex === null || !rect || rect[2]! <= rect[0]! || rect[3]! <= rect[1]!)
      return true;
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
    const page = pages.get(source.pageIndex);
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
    return !page || covered(page.body) || !covered(page.excluded);
  };
  const nativeBlocks = new Map<string, DocumentRegion[]>();
  for (const region of nativeRegions) {
    if (!region.sourceBlock?.id.startsWith('native:')) continue;
    const block = nativeBlocks.get(region.sourceBlock.id) ?? [];
    block.push(region);
    nativeBlocks.set(region.sourceBlock.id, block);
  }
  const excludedBlocks = new Set<string>();
  const fullyExcluded = (region: DocumentRegion): boolean => {
    const page = pages.get(region.pageIndex),
      rect = region.rect;
    return (
      !!page &&
      !page.body.some(
        (box) =>
          Math.min(rect[2], box[2]!) > Math.max(rect[0], box[0]!) &&
          Math.min(rect[3], box[3]!) > Math.max(rect[1], box[1]!),
      ) &&
      page.excluded.some(
        (box) =>
          rect[0] >= box[0]! - 0.5 &&
          rect[1] >= box[1]! - 0.5 &&
          rect[2] <= box[2]! + 0.5 &&
          rect[3] <= box[3]! + 0.5,
      )
    );
  };
  for (const [id, block] of nativeBlocks) {
    // Native identities and cloud identities cannot be interchanged. A cloud policy
    // may retire a native block only when every known source fragment is excluded.
    if (block.every(excluded) || block.every(fullyExcluded)) excludedBlocks.add(id);
  }
  return (source) => {
    if (source.sourceBlockId) return !excludedBlocks.has(source.sourceBlockId);
    return acceptsGeometry(source);
  };
}
