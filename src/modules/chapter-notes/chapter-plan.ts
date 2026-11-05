import type { SourceNoteEntry } from '../../core/source-note';
import type { DocumentRegion } from '../../document-analysis/contracts';
import { documentText, documentTextBlocks } from '../../document-analysis/text-blocks';
import {
  documentSections,
  sectionForBlock,
  type DocumentSection,
} from '../../document-analysis/sections';
import { escapeHTML } from '../../core/html';

export interface ChapterNoteEntry extends SourceNoteEntry {
  readonly section: DocumentSection | null;
}

/** Exact quotes or unambiguous region membership may assign a chapter; uncertain and cross-chapter content stays unclassified. */
export function chapterNoteEntries(
  entries: readonly SourceNoteEntry[],
  regions: readonly DocumentRegion[],
): readonly ChapterNoteEntry[] {
  const blocks = documentTextBlocks(regions),
    sections = documentSections(blocks);
  const body = blocks
    .map((block, index) => ({
      index,
      text: block.regions.some((r) => r.flow === 'body') ? documentText(block.text) : '',
    }))
    .filter((block) => block.text);
  const stream = body.map((b) => b.text).join(' ');
  const offsets: number[] = [];
  let offset = 0;
  for (const block of body) {
    offsets.push(offset);
    offset += block.text.length + 1;
  }
  const unique = new Map<string, ChapterNoteEntry>();
  for (const entry of entries) {
    const signature =
      entry.kind === 'annotation'
        ? entry.id
        : JSON.stringify([entry.kind, entry.quote, entry.comment, entry.locations, entry.images]);
    if (unique.has(signature)) continue;
    const quote = documentText(entry.quote);
    let candidates: number[] = [];
    if (quote) {
      const matches: number[][] = [];
      for (let at = stream.indexOf(quote); at >= 0; at = stream.indexOf(quote, at + 1)) {
        const indices = body
          .filter(
            (b, i) => b.text && offsets[i]! < at + quote.length && offsets[i]! + b.text.length > at,
          )
          .map((b) => b.index);
        if (
          indices.length &&
          indices.every((i) =>
            blocks[i]!.regions.some((r) =>
              entry.locations.some((l) => l.pageIndex === r.pageIndex),
            ),
          )
        )
          matches.push(indices);
      }
      if (matches.length === 1) candidates = matches[0]!;
    } else {
      for (const location of entry.locations) {
        const matches = blocks.flatMap((block, i) =>
          block.regions.some(
            (r) =>
              r.pageIndex === location.pageIndex &&
              location.rects.some((rect) => {
                const x = (r.rect[0] + r.rect[2]) / 2,
                  y = (r.rect[1] + r.rect[3]) / 2;
                return x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
              }),
          )
            ? [i]
            : [],
        );
        if (!matches.length) {
          candidates = [];
          break;
        }
        candidates.push(...matches);
      }
    }
    const assigned = candidates.map((index) => sectionForBlock(sections, index));
    const section =
      assigned.length && assigned.every((s) => s?.id === assigned[0]?.id) ? assigned[0]! : null;
    unique.set(signature, { ...entry, section });
  }
  return [...unique.values()].sort(
    (a, b) =>
      (a.section?.start ?? Infinity) - (b.section?.start ?? Infinity) ||
      (a.locations[0]?.pageIndex ?? Infinity) - (b.locations[0]?.pageIndex ?? Infinity) ||
      (b.locations[0]?.rects[0]?.[3] ?? 0) - (a.locations[0]?.rects[0]?.[3] ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

/** Preserve each native source fragment and rebase only our image slots; no handwritten note is edited. */
export function chapterNoteMarkup(
  entries: readonly ChapterNoteEntry[],
  title: (entry: ChapterNoteEntry) => string,
) {
  const images: string[] = [],
    html: string[] = [];
  let previous: string | undefined;
  for (const entry of entries) {
    const section = entry.section?.id ?? 'unclassified';
    if (section !== previous) {
      html.push(`<h2>${escapeHTML(title(entry))}</h2>`);
      previous = section;
    }
    const base = images.length;
    html.push(
      entry.html.replace(
        /src="neo-image:(\d+)"/gu,
        (_match, i: string) => `src="neo-image:${base + Number(i)}"`,
      ),
    );
    images.push(...entry.images);
  }
  return {
    html: html.join('\n'),
    images,
    schemaVersion: entries.some((e) => e.schemaVersion === 10) ? (10 as const) : (9 as const),
  };
}
