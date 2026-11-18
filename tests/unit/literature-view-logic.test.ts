import { describe, expect, it } from 'vitest';
import type { LiteratureItem } from '../../src/literature-table/controller';
import {
  compileLiteratureFilters,
  literatureFilterOperators,
  validLiteratureFilter,
} from '../../src/literature-table/filters';
import {
  cleanLiteratureViewName,
  readLiteratureViews,
  writeLiteratureViews,
} from '../../src/literature-table/view-storage';
import {
  MAX_LITERATURE_FILTERS,
  MAX_LITERATURE_FILTER_VALUE,
  MAX_LITERATURE_VIEW_NAME,
  type LiteratureFilter,
  type LiteratureFilterFieldID,
  type LiteratureFilterKind,
  type SavedLiteratureView,
} from '../../src/literature-table/views';

const fields = new Map<LiteratureFilterFieldID, { kind: LiteratureFilterKind; key?: string }>([
  ['title', { kind: 'text' }],
  ['year', { kind: 'number' }],
  ['pdf', { kind: 'pdf' }],
  ['attribute:score', { kind: 'number', key: 'Research Score' }],
  ['attribute:note', { kind: 'text', key: 'Note' }],
]);

function item(extra = '', properties: Partial<LiteratureItem> = {}): LiteratureItem {
  return { id: 1, title: 'An Article', year: '2026', extra, ...properties };
}

function predicate(filter: LiteratureFilter): (item: LiteratureItem) => boolean {
  const result = compileLiteratureFilters([filter], fields);
  if (!result) throw new Error('Expected a valid filter');
  return result;
}

const saved: SavedLiteratureView = {
  name: 'Reading',
  scope: { id: 'collection:unavailable', label: 'Old collection' },
  columns: ['unavailable'],
  sort: 'attribute:unavailable',
  direction: 'descending',
  filters: [
    {
      field: 'attribute:unavailable',
      kind: 'text',
      operator: 'contains',
      value: '  exact value  ',
    },
  ],
};

describe('literature filters', () => {
  it('compares exact decimal values without rounding and supports equivalent spellings', () => {
    const atLeast = predicate({
      field: 'attribute:score',
      kind: 'number',
      operator: 'at-least',
      value: ' 9007199254740993 ',
    });
    expect(atLeast(item('Research Score: 9007199254740992'))).toBe(false);
    expect(atLeast(item('Research Score: 9007199254740993'))).toBe(true);
    const equal = predicate({
      field: 'attribute:score',
      kind: 'number',
      operator: 'equals',
      value: '2e0',
    });
    expect(equal(item('Research Score: 2.00'))).toBe(true);
    const atMost = predicate({
      field: 'attribute:score',
      kind: 'number',
      operator: 'at-most',
      value: '1e-400',
    });
    expect(atMost(item('Research Score: 0'))).toBe(true);
    expect(atMost(item('Research Score: 2e-400'))).toBe(false);
    expect(atMost(item('Research Score: -3'))).toBe(true);
  });

  it('normalizes Unicode and case for trimmed text comparisons', () => {
    const includes = predicate({
      field: 'title',
      kind: 'text',
      operator: 'contains',
      value: '  CAFÉ  ',
    });
    expect(includes(item('', { title: 'A CAFE\u0301 study' }))).toBe(true);
    const equals = predicate({
      field: 'attribute:note',
      kind: 'text',
      operator: 'equals',
      value: '  résumé ',
    });
    expect(equals(item('Note:  RE\u0301SUME\u0301  '))).toBe(true);
    expect(equals(item('Note: résumé extra'))).toBe(false);
  });

  it('never matches missing, invalid, blank or ambiguous cell values', () => {
    const number = predicate({
      field: 'attribute:score',
      kind: 'number',
      operator: 'at-most',
      value: '9',
    });
    for (const extra of [
      '',
      'Research Score: ',
      'Research Score: 0x10',
      'Research Score: 2\nresearch_score: 3',
    ]) {
      expect(number(item(extra))).toBe(false);
    }
    const text = predicate({
      field: 'attribute:note',
      kind: 'text',
      operator: 'contains',
      value: 'hello',
    });
    expect(text(item('Note: hello\nNOTE: hello'))).toBe(false);
    expect(text(item('Note: '))).toBe(false);
    expect(
      predicate({ field: 'title', kind: 'text', operator: 'equals', value: 'x' })(
        item('', { title: ' ' }),
      ),
    ).toBe(false);
    expect(
      predicate({ field: 'year', kind: 'number', operator: 'at-least', value: '2020' })(
        item('', { year: 'unknown' }),
      ),
    ).toBe(false);
  });

  it('distinguishes absent PDF metadata from true and false', () => {
    const has = predicate({ field: 'pdf', kind: 'pdf', operator: 'has', value: '' });
    const missing = predicate({ field: 'pdf', kind: 'pdf', operator: 'missing', value: '' });
    expect([has(item('', { hasPDF: true })), missing(item('', { hasPDF: true }))]).toEqual([
      true,
      false,
    ]);
    expect([has(item('', { hasPDF: false })), missing(item('', { hasPDF: false }))]).toEqual([
      false,
      true,
    ]);
    expect([has(item()), missing(item())]).toEqual([false, false]);
  });

  it('rejects unresolved fields, incompatible operators and invalid input rather than dropping filters', () => {
    expect(literatureFilterOperators('number')).toEqual(['equals', 'at-least', 'at-most']);
    const bad: LiteratureFilter[] = [
      { field: 'attribute:removed', kind: 'text', operator: 'equals', value: '1' },
      { field: 'attribute:score', kind: 'text', operator: 'equals', value: '1' },
      { field: 'title', kind: 'text', operator: 'at-least', value: '1' },
      { field: 'year', kind: 'number', operator: 'contains', value: '2' },
      { field: 'year', kind: 'number', operator: 'equals', value: 'NaN' },
      { field: 'title', kind: 'text', operator: 'contains', value: '  ' },
      {
        field: 'title',
        kind: 'text',
        operator: 'equals',
        value: 'a'.repeat(MAX_LITERATURE_FILTER_VALUE + 1),
      },
    ];
    for (const filter of bad) expect(compileLiteratureFilters([filter], fields)).toBeNull();
    expect(
      validLiteratureFilter(
        { field: 'year', kind: 'number', operator: 'equals', value: '1.00' },
        'number',
      ),
    ).toBe(true);
    expect(
      compileLiteratureFilters(
        Array(MAX_LITERATURE_FILTERS + 1).fill({
          field: 'title',
          kind: 'text',
          operator: 'equals',
          value: 'x',
        }),
        fields,
      ),
    ).toBeNull();
    const noKey = new Map<LiteratureFilterFieldID, { kind: LiteratureFilterKind }>([
      ['attribute:score', { kind: 'number' }],
    ]);
    expect(
      compileLiteratureFilters(
        [{ field: 'attribute:score', kind: 'number', operator: 'equals', value: '2' }],
        noKey,
      ),
    ).toBeNull();
    const combined = compileLiteratureFilters(
      [
        { field: 'title', kind: 'text', operator: 'contains', value: 'article' },
        { field: 'pdf', kind: 'pdf', operator: 'has', value: '' },
      ],
      fields,
    )!;
    expect(combined(item('', { hasPDF: false }))).toBe(false);
    expect(combined(item('', { hasPDF: true }))).toBe(true);
  });
});

describe('literature saved views', () => {
  it('round-trips exact values and unavailable scope, column and field references', () => {
    expect(readLiteratureViews('')).toEqual([]);
    const raw = writeLiteratureViews([saved]);
    expect(JSON.parse(raw)).toEqual({ version: 1, views: [saved] });
    expect(readLiteratureViews(raw)).toEqual([saved]);
  });

  it('preserves incomplete filter values without making them executable', () => {
    const incomplete: SavedLiteratureView = {
      ...saved,
      filters: [{ field: 'year', kind: 'number', operator: 'at-least', value: 'wrong' }],
    };
    const restored = readLiteratureViews(writeLiteratureViews([incomplete]))[0]!;
    expect(restored.filters).toEqual(incomplete.filters);
    expect(compileLiteratureFilters(restored.filters, fields)).toBeNull();
  });

  it('cleans names with NFC and rejects controls, blank or oversized names', () => {
    expect(cleanLiteratureViewName('  Cafe\u0301  ')).toBe('Café');
    expect(cleanLiteratureViewName(' \tName')).toBeNull();
    expect(cleanLiteratureViewName('  ')).toBeNull();
    expect(cleanLiteratureViewName('a'.repeat(MAX_LITERATURE_VIEW_NAME + 1))).toBeNull();
  });

  it('rejects corrupt, future, duplicate and structurally invalid storage', () => {
    expect(() => readLiteratureViews('{')).toThrow();
    const invalid = [
      { version: 2, views: [] },
      { version: 1, views: [], extra: true },
      { version: 1, views: [saved, { ...saved, name: ' reading ' }] },
      {
        version: 1,
        views: [
          { ...saved, name: 'Café' },
          { ...saved, name: 'CAFE\u0301' },
        ],
      },
      { version: 1, views: [{ ...saved, scope: { id: '', label: 'old' } }] },
      { version: 1, views: [{ ...saved, columns: [''] }] },
      { version: 1, views: [{ ...saved, sort: 'unknown' }] },
      { version: 1, views: [{ ...saved, direction: 'up' }] },
      {
        version: 1,
        views: [
          { ...saved, filters: [{ field: 'title', kind: 'text', operator: 'has', value: '' }] },
        ],
      },
      {
        version: 1,
        views: [
          {
            ...saved,
            filters: [{ field: 'attribute:', kind: 'text', operator: 'equals', value: 'x' }],
          },
        ],
      },
      {
        version: 1,
        views: [{ ...saved, filters: [{ field: 'pdf', kind: 'pdf', operator: 'missing' }] }],
      },
    ];
    for (const value of invalid) expect(() => readLiteratureViews(JSON.stringify(value))).toThrow();
    expect(() => writeLiteratureViews([saved, { ...saved, name: 'READING' }])).toThrow();
  });
});
