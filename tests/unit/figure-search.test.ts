import { describe, expect, it } from 'vitest';
import { filterFigureTargets } from '../../src/modules/reader-navigation/figure-search';
import { documentVisualBodies } from '../../src/document-analysis/visual-bodies';
import type { ReaderCaptionTarget } from '../../src/modules/reader-navigation/caption-targets';
import type { DocumentRegion } from '../../src/document-analysis/contracts';

const targets: ReaderCaptionTarget[] = [
  {
    kind: 'table',
    label: '2',
    title: 'Table 2: multilingual recognition',
    location: { position: { pageIndex: 5, rects: [[10, 10, 100, 100]] } },
  },
  {
    kind: 'figure',
    label: '2',
    title: 'Figure 2: model architecture',
    location: { position: { pageIndex: 1, rects: [[10, 10, 100, 100]] } },
  },
  {
    kind: 'table',
    label: '',
    title: 'Table on page 6',
    location: { position: { pageIndex: 5, rects: [[10, 200, 100, 300]] } },
  },
];
describe('local figure search', () => {
  it('combines fuzzy caption words with explicit one-based page constraints', () => {
    expect(filterFigureTargets(targets, 'table recog p:6')).toEqual([targets[0]]);
    expect(filterFigureTargets(targets, 'p:2 图')).toEqual([targets[1]]);
    expect(filterFigureTargets(targets, 'p:0')).toEqual([]);
    expect(filterFigureTargets(targets, 'p:6 p:2')).toHaveLength(3);
    expect(filterFigureTargets(targets, 'no-match-at-all')).toEqual([]);
  });
  it('keeps duplicate numbers and uncaptioned targets, sorted by source position', () => {
    expect(filterFigureTargets(targets, '')).toEqual([targets[1], targets[2], targets[0]]);
    expect(filterFigureTargets(targets, '２')).toHaveLength(2);
    expect(targets[0]!.kind).toBe('table');
  });
  it('keeps independent body blocks even when the backend puts them under the same object', () => {
    const region = (
      id: string,
      kind: DocumentRegion['kind'],
      sourceBlock = id,
    ): DocumentRegion => ({
      id,
      kind,
      sourceBlock: { id: sourceBlock, order: 0 },
      sourceObject: { id: 'wrong-group', kind: 'table' },
      pageIndex: 0,
      rect: [10, 10, 30, 40],
      text: '',
      format: 'text',
      flow: 'auxiliary',
      anchorPrecision: 'region',
    });
    const bodies = documentVisualBodies([
      region('a', 'table'),
      region('b', 'table'),
      region('c', 'caption'),
      region('a-copy', 'table', 'a'),
    ]);
    expect(bodies).toHaveLength(2);
    expect(bodies.every((body) => body.location.rects.length === 1)).toBe(true);
    expect(new Set(bodies.map((body) => body.id)).size).toBe(2);
  });
});
