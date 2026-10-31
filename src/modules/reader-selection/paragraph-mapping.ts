import type { DocumentRegion } from '../../document-analysis/contracts';
import { documentTextBlocks, documentText } from '../../document-analysis/text-blocks';
import type { ReaderTextSpan } from '../../toolkit/reader';
import { buildMappedTextIndex, type MappedTextIndex } from './token-boundaries';

export interface MappedParagraph {
  readonly id: string;
  readonly index: MappedTextIndex;
}

/**
 * Build a short-lived map from literal layout paragraphs to actual displayed text.
 * Every non-space character must match uniquely; no edit distance, OCR substitution or invented anchor is admitted.
 */
export function mapDocumentParagraphs(
  regions: readonly DocumentRegion[],
  spans: readonly ReaderTextSpan[],
): readonly MappedParagraph[] {
  const raw = buildMappedTextIndex(spans);
  const dropHyphens = new Map<Text, number>();
  spans.forEach((span, i) => {
    const next = spans[i + 1];
    if (
      next &&
      span.text.endsWith('-') &&
      /^\p{Ll}/u.test(next.text) &&
      Math.abs(next.rect.top - span.rect.top) > Math.min(next.rect.height, span.rect.height) * 0.5
    )
      dropHyphens.set(span.textNode, span.text.length - 1);
  });
  const characters: string[] = [],
    pointers: MappedTextIndex['pointers'][number][] = [],
    ends: MappedTextIndex['ends'][number][] = [];
  for (let i = 0; i < raw.text.length; i++) {
    const pointer = raw.pointers[i]!;
    if (
      /\s|\u00ad/u.test(raw.text[i]!) ||
      (raw.text[i] === '-' && dropHyphens.get(pointer.textNode) === pointer.offset)
    )
      continue;
    characters.push(raw.text[i]!);
    pointers.push(pointer);
    ends.push(raw.ends[i]!);
  }
  const text = characters.join('');
  const sourcePages = new Map(spans.map((span) => [span.textNode, span.sourcePageIndex]));
  const matches: { id: string; start: number; end: number; index: MappedTextIndex }[] = [];
  for (const block of documentTextBlocks(regions)) {
    if (
      block.regions.some((r) => r.flow === 'excluded' || !['text', 'markdown'].includes(r.format))
    )
      continue;
    if (block.regions.some((r) => ['image', 'table', 'other'].includes(r.kind))) continue;
    const expected = documentText(block.text),
      query = expected.replace(/\s/gu, '');
    if (!query) continue;
    const start = text.indexOf(query);
    if (start < 0 || text.indexOf(query, start + 1) >= 0) continue;
    const pages = new Set(block.regions.map((region) => region.pageIndex));
    const firstPage = sourcePages.get(pointers[start]!.textNode);
    const lastPage = sourcePages.get(ends[start + query.length - 1]!.textNode);
    if (firstPage !== undefined && !pages.has(firstPage)) continue;
    // MinerU may retain merged continuation text on the first page's region.
    // Exact literal source matching can prove its endpoint on the adjacent page;
    // never borrow a unique occurrence that starts on another page.
    if (lastPage !== undefined && !pages.has(lastPage) && lastPage !== (firstPage ?? -2) + 1)
      continue;
    const mappedPointers = [],
      mappedEnds = [];
    let at = start;
    for (let i = 0; i < expected.length; i++) {
      const space = /\s/u.test(expected[i]!);
      const pointer = pointers[at] ?? ends[at - 1]!;
      mappedPointers.push(pointer);
      mappedEnds.push(space ? pointer : ends[at]!);
      if (!space) at++;
    }
    matches.push({
      id: block.id,
      start,
      end: at,
      index: { text: expected, pointers: mappedPointers, ends: mappedEnds },
    });
  }
  return matches
    .filter(
      (match) =>
        !matches.some(
          (other) => other !== match && other.start < match.end && other.end > match.start,
        ),
    )
    .sort((a, b) => a.start - b.start)
    .map(({ id, index }) => ({ id, index }));
}
