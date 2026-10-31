import { describe, expect, it } from 'vitest';
import { chapterNoteEntries, chapterNoteMarkup } from '../../src/modules/notes/chapter-plan';
import type { SourceNoteEntry } from '../../src/core/source-note';
import type { DocumentRegion } from '../../src/document-analysis/contracts';

const region = (
  id: string,
  text: string,
  pageIndex: number,
  kind: DocumentRegion['kind'] = 'text',
): DocumentRegion => ({
  id,
  text,
  pageIndex,
  kind,
  flow: 'body',
  format: 'text',
  anchorPrecision: 'region',
  rect: [0, 0, 100, 20],
});
const entry = (id: string, quote: string, pages = [0]): SourceNoteEntry => ({
  id,
  quote,
  comment: 'original comment',
  kind: 'annotation',
  locations: pages.map((pageIndex) => ({ pageIndex, rects: [[0, 0, 100, 20]] })),
  html: `<p>${id}</p>`,
  images: [],
  schemaVersion: 9,
});
const regions = [
  region('s1', '1 Method', 0, 'heading'),
  region('p1', 'The encoder is comprehen-\nsive.', 0),
  region('p2', 'Continuation on next page.', 1),
  region('s2', '2 Results', 2, 'heading'),
  region('p3', 'The measured result is exact.', 2),
];

describe('chapter note source assignment', () => {
  it('keeps original quotes and comments while assigning normalized exact cross-page evidence', () => {
    const quote = 'The encoder is comprehensive. Continuation on next page.';
    const [mapped] = chapterNoteEntries([entry('a', quote, [0, 1])], regions);
    expect(mapped?.section?.title).toBe('1 Method');
    expect(mapped?.quote).toBe(quote);
    expect(mapped?.comment).toBe('original comment');
    expect(chapterNoteEntries([entry('wrong-page', quote, [2])], regions)[0]?.section).toBeNull();
  });
  it('does not guess for OCR substitutions, repeated quotes or a cross-chapter highlight', () => {
    expect(
      chapterNoteEntries([entry('ocr', 'The encoder is comprehens1ve.')], regions)[0]?.section,
    ).toBeNull();
    const repeated = [...regions, region('repeat', 'The encoder is comprehensive.', 0)];
    expect(
      chapterNoteEntries([entry('ambiguous', 'The encoder is comprehensive.')], repeated)[0]
        ?.section,
    ).toBeNull();
    const crossing = entry(
      'cross',
      'Continuation on next page. 2 Results The measured result is exact.',
      [1, 2],
    );
    expect(chapterNoteEntries([crossing], regions)[0]?.section).toBeNull();
  });
  it('deduplicates identical source objects and leaves geometrically uncertain content unclassified', () => {
    const image = { ...entry('image', '', [2]), kind: 'excerpt' as const, images: ['png'] };
    const items = chapterNoteEntries(
      [image, { ...image, id: 'duplicate' }, entry('unknown', '', [10])],
      regions,
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.section?.title).toBe('2 Results');
    expect(items[1]?.section).toBeNull();
    expect(
      chapterNoteEntries(
        [
          entry('highlight', 'The encoder is comprehensive.'),
          entry('underline', 'The encoder is comprehensive.'),
        ],
        regions,
      ),
    ).toHaveLength(2);
  });
  it('retains whole-document fallback without an outline and rebases embedded image slots', () => {
    const plain = [region('p', 'No headings.', 0)];
    const a = {
      ...entry('a', 'No headings.'),
      html: '<img src="neo-image:0"/>',
      images: ['first'],
    };
    const b = {
      ...entry('b', 'No headings.'),
      comment: 'second comment',
      html: '<img src="neo-image:0"/>',
      images: ['second'],
      schemaVersion: 10 as const,
    };
    const items = chapterNoteEntries([a, b], plain);
    expect(items.every((item) => item.section?.id === 'document')).toBe(true);
    const draft = chapterNoteMarkup(items, () => 'Chapter <title>');
    expect(draft.html).toBe(
      '<h2>Chapter &lt;title&gt;</h2>\n<img src="neo-image:0"/>\n<img src="neo-image:1"/>',
    );
    expect(draft.images).toEqual(['first', 'second']);
    expect(draft.schemaVersion).toBe(10);
  });
});
