import { describe, expect, it } from 'vitest';
import { mapDocumentParagraphs } from '../../src/modules/reader-selection/paragraph-mapping';
import { indexedStructuralTextPosition } from '../../src/modules/reader-selection/text-boundary-motion';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import type { ReaderTextSpan } from '../../src/toolkit/reader';
const region = (text: string, id = 'p'): DocumentRegion => ({
  id,
  kind: 'text',
  text,
  pageIndex: 0,
  rect: [0, 0, 200, 300],
  format: 'text',
  flow: 'body',
  anchorPrecision: 'region',
});
const span = (text: string, top = 0): ReaderTextSpan => ({
  textNode: { data: text, length: text.length } as Text,
  text,
  rect: { left: 0, right: 200, width: 200, top, bottom: top + 10, height: 10 },
});

describe('literal source paragraph mapping', () => {
  it('maps an OmniDocBench continuation across columns to the real final node', () => {
    const a = span(
      '• High-quality, diverse evaluation set: We include pages from 9 distinct document types, ranging from textbooks',
      700,
    );
    const b = span(
      'to newspapers, annotated using a combination of automated tools, manual verification, and expert review.',
      100,
    );
    const text = `${a.text}\n${b.text}`;
    const mapped = mapDocumentParagraphs([region(text)], [a, b]);
    expect(mapped).toHaveLength(1);
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 1 },
        'forward',
        'paragraph',
      ),
    ).toEqual({ textNode: b.textNode, offset: b.text.length });
  });

  it('retains exact original glyph endpoints across line hyphens, ligatures and whitespace', () => {
    const a = span('We use comprehen-', 0),
      b = span('sive ﬂow. Next sentence.', 20);
    const mapped = mapDocumentParagraphs(
      [region('We use comprehen-\nsive flow. Next sentence.')],
      [a, b],
    );
    expect(mapped[0]!.index.text).toBe('We use comprehensive flow. Next sentence.');
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 1 },
        'forward',
        'sentence',
      ),
    ).toEqual({ textNode: b.textNode, offset: 'sive ﬂow.'.length });
  });

  it('rejects OCR substitutions, ambiguous duplicate text and missing page fragments', () => {
    const a = span('The value is 0.9.'),
      b = span('The value is 0.9.', 20);
    expect(mapDocumentParagraphs([region('The value is 0.8.')], [a])).toEqual([]);
    expect(mapDocumentParagraphs([region(a.text)], [a, b])).toEqual([]);
    expect(mapDocumentParagraphs([region(a.text + ' Continued on the next page.')], [a])).toEqual(
      [],
    );
  });

  it('rejects overlapping block identities instead of choosing a paragraph boundary arbitrarily', () => {
    const a = span('First sentence. Second sentence.');
    expect(mapDocumentParagraphs([region(a.text), region('Second sentence.', 'p2')], [a])).toEqual(
      [],
    );
  });

  it('rejects a literal occurrence on another source page', () => {
    const a = { ...span('This is a unique paragraph.'), sourcePageIndex: 1 };
    expect(mapDocumentParagraphs([region(a.text)], [a])).toEqual([]);
  });

  it('recovers a uniquely matched continuation on the adjacent source page without inventing coordinates', () => {
    const a = { ...span('This paragraph begins here and '), sourcePageIndex: 0 };
    const b = { ...span('continues on the next page.', 20), sourcePageIndex: 1 };
    const mapped = mapDocumentParagraphs([region(a.text + b.text)], [a, b]);
    expect(mapped).toHaveLength(1);
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 0 },
        'forward',
        'paragraph',
      ),
    ).toEqual({ textNode: b.textNode, offset: b.text.length });
    expect(
      mapDocumentParagraphs([region(a.text + b.text)], [a, { ...b, sourcePageIndex: 2 }]),
    ).toEqual([]);
  });

  it('merges common academic abbreviations while keeping real sentence endings', () => {
    const a = span('Dr. Smith uses Eq. (3) and Fig. 2. The score is 0.9. Next.');
    const mapped = mapDocumentParagraphs([region(a.text)], [a]);
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 1 },
        'forward',
        'sentence',
      ),
    ).toEqual({ textNode: a.textNode, offset: 'Dr. Smith uses Eq. (3) and Fig. 2.'.length });
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 'Dr. Smith uses Eq. (3) and Fig. 2.'.length },
        'forward',
        'sentence',
      ),
    ).toEqual({
      textNode: a.textNode,
      offset: 'Dr. Smith uses Eq. (3) and Fig. 2. The score is 0.9.'.length,
    });
  });

  it('keeps formula glyphs in sentence matching and rejects a LaTeX substitution for source glyphs', () => {
    const a = span('The score is α + β. Next sentence.');
    const mapped = mapDocumentParagraphs([region(a.text)], [a]);
    expect(
      indexedStructuralTextPosition(
        mapped.map((p) => p.index),
        { textNode: a.textNode, offset: 1 },
        'forward',
        'sentence',
      ),
    ).toEqual({ textNode: a.textNode, offset: 'The score is α + β.'.length });
    expect(
      mapDocumentParagraphs([region('The score is $\\alpha + \\beta$. Next sentence.')], [a]),
    ).toEqual([]);
  });
});
