import { describe, expect, it } from 'vitest';
import { documentExcerpts } from '../../src/document-analysis/excerpts';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
const region = (
  id: string,
  kind: DocumentRegion['kind'],
  rect: DocumentRegion['rect'],
  pageIndex = 0,
): DocumentRegion => ({
  id,
  kind,
  rect,
  pageIndex,
  text: '',
  format: 'text',
  flow: 'auxiliary',
  anchorPrecision: 'region',
  sourceObject: { id: 'figure2', kind: 'figure' },
});
describe('source object excerpts', () => {
  it('retains two panels and their caption together and offers individual bodies as an explicit fallback', () => {
    const regions = [
      region('left', 'image', [0, 100, 80, 180]),
      region('right', 'image', [100, 100, 180, 180]),
      { ...region('caption', 'caption', [0, 70, 180, 90]), text: 'Figure 2. Two panels.' },
    ];
    const targets = documentExcerpts(regions),
      group = targets.find((t) => t.part === 'object')!;
    expect(group.regionIds).toEqual(['left', 'right', 'caption']);
    expect(group.locations[0]!.rects).toHaveLength(3);
    expect(group.caption).toBe('Figure 2. Two panels.');
    expect(targets.filter((t) => t.part === 'body')).toHaveLength(2);
  });
  it('rejects incompatible provider pages instead of silently keeping only the first page', () => {
    expect(() =>
      documentExcerpts([
        region('a', 'image', [0, 100, 80, 180]),
        region('b', 'image', [0, 100, 80, 180], 1),
      ]),
    ).toThrow('Incompatible explicit');
  });
  it('exposes standalone formulas and structure without splitting equations embedded in a table', () => {
    const formula = {
      ...region('math', 'formula', [0, 0, 30, 30]),
      sourceObject: undefined,
      text: '\\alpha + \\beta',
      format: 'latex' as const,
    };
    const embedded = {
      ...formula,
      id: 'inside-table',
      sourceObject: { id: 'table1', kind: 'table' as const },
    };
    const targets = documentExcerpts([formula, embedded]);
    expect(targets.filter((t) => t.kind === 'formula')).toHaveLength(1);
    expect(targets.find((t) => t.kind === 'formula')!.structures).toEqual([
      { text: formula.text, format: 'latex' },
    ]);
  });
});
