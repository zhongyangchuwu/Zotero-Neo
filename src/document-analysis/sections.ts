import type { DocumentRegion, DocumentLocation } from './contracts';
import { documentTextBlocks, documentText, type DocumentTextBlock } from './text-blocks';

export interface DocumentSection {
  readonly id: string;
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

/** Numbered academic headings retain their hierarchy; unnumbered headings are conservative top-level sections. */
export function documentSections(blocks: readonly DocumentTextBlock[]): readonly DocumentSection[] {
  const headings = blocks.flatMap((block, start) => {
    if (!block.regions.some((r) => r.kind === 'heading' && r.flow === 'body')) return [];
    const title = documentText(block.text);
    if (!title) return [];
    const number = /^\s*(\d+(?:\.\d+)*)(?:[.)、])?\s*\p{L}/u.exec(title);
    return [{ id: block.id, title, start, level: number ? number[1]!.split('.').length : 1 }];
  });
  if (!headings.length)
    return [{ id: 'document', title: '', start: 0, end: blocks.length, level: 1 }];
  return headings.map((heading, index) => ({
    ...heading,
    start: index === 0 ? 0 : heading.start,
    end:
      headings.slice(index + 1).find((next) => next.level <= heading.level)?.start ?? blocks.length,
  }));
}

export interface SectionSearchResult {
  readonly id: string;
  readonly text: string;
  readonly excerpt: string;
  readonly location: DocumentLocation;
}

export function sectionForBlock(
  sections: readonly DocumentSection[],
  index: number,
): DocumentSection | null {
  return sections.findLast((section) => section.start <= index && section.end > index) ?? null;
}

/** Literal, per-paragraph search with source-region navigation; no native Find state is touched. */
export function searchDocumentSection(
  regions: readonly DocumentRegion[],
  section: DocumentSection,
  query: string,
): readonly SectionSearchResult[] {
  const needle = documentText(query).toLocaleLowerCase();
  if (!needle) return [];
  return documentTextBlocks(regions)
    .slice(section.start, section.end)
    .flatMap((block) => {
      const usable = block.regions.filter(
        (r) => r.flow !== 'excluded' && ['text', 'markdown', 'latex'].includes(r.format),
      );
      if (!usable.length) return [];
      const text = documentText(block.text),
        at = text.toLocaleLowerCase().indexOf(needle);
      if (at < 0) return [];
      const pageIndex = Math.min(...usable.map((r) => r.pageIndex));
      return [
        {
          id: block.id,
          text,
          excerpt: `${at > 70 ? '…' : ''}${text.slice(Math.max(0, at - 70), at + needle.length + 100)}${at + needle.length + 100 < text.length ? '…' : ''}`,
          location: {
            pageIndex,
            rects: usable.filter((r) => r.pageIndex === pageIndex).map((r) => r.rect),
          },
        },
      ];
    });
}
