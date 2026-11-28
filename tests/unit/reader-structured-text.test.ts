import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import { readerStructuredParagraphs } from '../../src/modules/reader-selection/structured-text';
import { textAdmissionFixture } from '../fixtures/reader-text-admission';

const paragraph = (text: string, pageIndex: number): DocumentRegion => ({
  id: `${pageIndex}:${text}`,
  pageIndex,
  rect: [0, 0, 100, 100],
  kind: 'text',
  text,
  format: 'text',
  flow: 'body',
  anchorPrecision: 'region',
});

afterEach(() => vi.unstubAllGlobals());

describe('cached PDF paragraphs for structural motions', () => {
  it('returns a synchronous miss without reading the text layer when the focus page is cold', () => {
    const fixture = textAdmissionFixture();
    const query = vi.spyOn(fixture.document, 'querySelectorAll');
    const layout = { visibleRegions: () => [paragraph('alpha', 1)] };
    expect(
      readerStructuredParagraphs(layout, fixture.window, {
        textNode: fixture.nodes[0]!,
        offset: 0,
      }),
    ).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('maps cached local paragraphs to live character endpoints without measuring uncached spans', () => {
    vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
    const fixture = textAdmissionFixture();
    const offPage = { dataset: { pageNumber: '2' } } as unknown as HTMLElement;
    vi.spyOn(fixture.elements[1]!, 'closest').mockReturnValue(offPage);
    const uncachedBounds = vi.spyOn(fixture.elements[1]!, 'getBoundingClientRect');
    const layout = { visibleRegions: () => [paragraph('alpha', 0), paragraph('omega', 0)] };
    const paragraphs = readerStructuredParagraphs(layout, fixture.window, {
      textNode: fixture.nodes[0]!,
      offset: 1,
    });
    expect(paragraphs?.map((index) => index.text)).toEqual(['alpha', 'omega']);
    expect(paragraphs?.[1]?.ends.at(-1)).toEqual({ textNode: fixture.nodes[2], offset: 5 });
    expect(uncachedBounds).not.toHaveBeenCalled();
  });
});
