import type { DocumentRegion } from './contracts';

/** Normalize authored line wraps for comparison while preserving meaningful punctuation. */
export function documentText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/-\s*\n\s*(?=\p{Ll})/gu, '')
    .replace(/\u00ad/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface DocumentTextBlock {
  readonly id: string;
  readonly text: string;
  readonly regions: readonly DocumentRegion[];
}

/** Page fragments of the same provider block share text and identity; never join unrelated regions by proximity. */
export function documentTextBlocks(
  regions: readonly DocumentRegion[],
): readonly DocumentTextBlock[] {
  const blocks = new Map<string, { id: string; text: string; regions: DocumentRegion[] }>();
  for (const region of regions) {
    const id = region.sourceBlock?.id ?? region.id;
    const block = blocks.get(id) ?? { id, text: region.text, regions: [] };
    block.regions.push(region);
    blocks.set(id, block);
  }
  return [...blocks.values()];
}
