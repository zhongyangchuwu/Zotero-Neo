import { describe, expect, it } from 'vitest';
import {
  documentSections,
  sectionForBlock,
  searchDocumentSection,
} from '../../src/document-analysis/sections';
import { documentTextBlocks } from '../../src/document-analysis/text-blocks';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
const region = (
  id: string,
  text: string,
  kind: DocumentRegion['kind'] = 'text',
): DocumentRegion => ({
  id,
  text,
  kind,
  rect: [0, 0, 100, 100],
  pageIndex: 0,
  format: 'text',
  flow: 'body',
  anchorPrecision: 'region',
});
describe('academic document sections', () => {
  const regions = [
    region('s1', '1. Method', 'heading'),
    region('p1', 'A literal x+y query.'),
    region('s11', '1.1. Encoder', 'heading'),
    region('p11', 'The ENCODER is comprehen-\nsive.'),
    region('s2', '2. Experiments', 'heading'),
    region('p2', 'A literal x+y query.'),
  ];
  it('includes subsections within the parent scope and assigns the current block to the deepest section', () => {
    const sections = documentSections(documentTextBlocks(regions));
    expect(sections.map((s) => [s.id, s.start, s.end, s.level])).toEqual([
      ['s1', 0, 4, 1],
      ['s11', 2, 4, 2],
      ['s2', 4, 6, 1],
    ]);
    expect(sectionForBlock(sections, 3)?.id).toBe('s11');
    expect(sectionForBlock(sections, 5)?.id).toBe('s2');
  });
  it('uses literal case-insensitive matching and does not leak adjacent chapters or margin text', () => {
    const sections = documentSections(documentTextBlocks(regions));
    expect(searchDocumentSection(regions, sections[0]!, 'x+y').map((r) => r.id)).toEqual(['p1']);
    expect(searchDocumentSection(regions, sections[0]!, 'comprehensive').map((r) => r.id)).toEqual([
      'p11',
    ]);
    expect(searchDocumentSection(regions, sections[0]!, '.*')).toEqual([]);
    const margin = { ...region('margin', 'encoder'), flow: 'excluded' as const };
    const whole = documentSections(documentTextBlocks([margin]))[0]!;
    expect(searchDocumentSection([margin], whole, 'encoder')).toEqual([]);
  });
  it('retains a whole-document fallback for papers with no recognized headings', () => {
    const plain = [region('p', 'No authored headings.')],
      section = documentSections(documentTextBlocks(plain))[0]!;
    expect(section).toMatchObject({ id: 'document', start: 0, end: 1 });
    expect(searchDocumentSection(plain, section, 'headings')).toHaveLength(1);
  });
});
