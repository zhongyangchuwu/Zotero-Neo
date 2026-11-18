import { describe, expect, it } from 'vitest';
import type { ItemAttributeDefinition } from '../../src/item-attributes/types';
import type { LiteratureItem } from '../../src/literature-table/controller';
import {
  compileLiteratureFilters,
  literatureFilterOperators,
  validLiteratureFilter,
} from '../../src/literature-table/filters';
import { projectLiteratureRows, sortLiteratureItems } from '../../src/literature-table/model';
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
  ['native:tags', { kind: 'tags' }],
  ['native:date', { kind: 'date' }],
  ['native:dateAdded', { kind: 'date' }],
  ['native:dateModified', { kind: 'date' }],
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

  it('matches whole native tags exactly and combines rules on the same field with AND', () => {
    const tag = (value: string): LiteratureFilter => ({
      field: 'native:tags',
      kind: 'tags',
      operator: 'has-tag',
      value,
    });
    const match = compileLiteratureFilters([tag('Trial'), tag('Search, Strategy')], fields)!;
    const matches = (tags: string[]) => match(item('', { native: { 'native:tags': { tags } } }));
    expect(matches(['Search, Strategy', 'Trial', 'Extra'])).toBe(true);
    expect(matches(['Trial', 'Search', 'Strategy'])).toBe(false);
    expect(matches(['trial', 'Search, Strategy'])).toBe(false);
    expect(matches(['Clinical Trial', 'Search, Strategy'])).toBe(false);
    expect(matches([' Trial ', 'Search, Strategy'])).toBe(false);
    expect(matches([])).toBe(false);
    expect(match(item())).toBe(false);
    expect(
      compileLiteratureFilters([{ ...tag('Trial'), operator: 'contains' }], fields),
    ).toBeNull();
  });

  it('uses chronological date comparisons at the requested precision, never guessing a partial date', () => {
    function publication(key: string | null) {
      return item('', { native: { 'native:date': { text: key ?? 'n.d.', key } } });
    }
    const rule: LiteratureFilter = {
      field: 'native:date',
      kind: 'date',
      operator: 'on',
      value: '2024-02',
    };
    const on = predicate(rule);
    expect(on(publication('2024-02'))).toBe(true);
    expect(on(publication('2024-02-29'))).toBe(true);
    expect(on(publication('2024'))).toBe(false);
    expect(on(publication(null))).toBe(false);
    expect(on(item())).toBe(false);

    const before = predicate({ ...rule, operator: 'on-or-before' });
    expect(before(publication('2023'))).toBe(true);
    expect(before(publication('2024-02-29'))).toBe(true);
    expect(before(publication('2024'))).toBe(false);
    expect(before(publication('2024-03'))).toBe(false);
    const after = predicate({ ...rule, operator: 'on-or-after' });
    expect(after(publication('2024'))).toBe(false);
    expect(after(publication('2024-01-31'))).toBe(false);
    expect(after(publication('2024-02-01'))).toBe(true);
    expect(after(publication('2025'))).toBe(true);
    for (const value of [
      '0000',
      '2024-00',
      '2024-02-00',
      '2024-02-30',
      '1900-02-29',
      '2024-2',
      '2024-04-31',
    ])
      expect(validLiteratureFilter({ ...rule, value }, 'date')).toBe(false);
    expect(validLiteratureFilter({ ...rule, value: '2000-02-29' }, 'date')).toBe(true);

    const timed = item('', {
      native: {
        'native:dateAdded': { text: '2024-02-29 23:59:59', key: '2024-02-29 23:59:59' },
        'native:dateModified': { text: '2024-03-01 00:00:00', key: '2024-03-01 00:00:00' },
      },
    });
    expect(predicate({ ...rule, field: 'native:dateAdded', value: '2024-02-29' })(timed)).toBe(
      true,
    );
    expect(predicate({ ...rule, field: 'native:dateModified', value: '2024-02-29' })(timed)).toBe(
      false,
    );
  });

  it('sorts tags as lists and same-day native timestamps in time order', () => {
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    const source = [
      {
        ...item(),
        id: 1,
        native: {
          'native:tags': { tags: ['Zulu', 'A'] },
          'native:dateAdded': { text: '2024-02-29 10:01:00', key: '2024-02-29 10:01:00' },
        },
      },
      {
        ...item(),
        id: 2,
        native: {
          'native:tags': { tags: ['B', 'A'] },
          'native:dateAdded': { text: '2024-02-29 09:05:00', key: '2024-02-29 09:05:00' },
        },
      },
      { ...item(), id: 3 },
    ];
    const tags = { id: 'native:tags', kind: 'tags', label: 'Tags' } as const;
    const date = { id: 'native:dateAdded', kind: 'date', label: 'Date added' } as const;
    for (const column of [tags, date]) {
      const asc = sortLiteratureItems(source, column, 'ascending', collator);
      const desc = sortLiteratureItems(source, column, 'descending', collator);
      expect(asc.map(({ id }) => id)).toEqual([2, 1, 3]);
      expect(desc.map(({ id }) => id)).toEqual([1, 2, 3]);
    }
  });
});

describe('literature saved views', () => {
  it('round-trips exact values and unavailable scope, column and field references', () => {
    expect(readLiteratureViews('')).toEqual([]);
    const raw = writeLiteratureViews([saved]);
    expect(JSON.parse(raw)).toEqual({ version: 1, views: [saved] });
    expect(readLiteratureViews(raw)).toEqual([saved]);
  });

  it('round-trips native field identities and repeated tag filters without migrating old views', () => {
    const native: SavedLiteratureView = {
      ...saved,
      name: 'Native',
      columns: ['native:tags', 'native:date', 'oldCustomId'],
      sort: 'native:date',
      filters: [
        { field: 'native:tags', kind: 'tags', operator: 'has-tag', value: 'Case, Sensitive' },
        { field: 'native:tags', kind: 'tags', operator: 'has-tag', value: 'Another Tag' },
        { field: 'native:date', kind: 'date', operator: 'on-or-before', value: '2025-03' },
        { field: 'native:removedDate', kind: 'date', operator: 'on', value: '2025' },
      ],
    };
    expect(readLiteratureViews(writeLiteratureViews([saved, native]))).toEqual([saved, native]);
    expect(compileLiteratureFilters(native.filters, fields)).toBeNull();
  });

  it('keeps option identity through a rename and refuses rules for removed options', () => {
    const definition: ItemAttributeDefinition = {
      id: 'focus',
      key: 'Reading Focus',
      label: 'Reading focus',
      type: 'multi-select',
      options: [
        { id: 'proof', label: '证明' },
        { id: 'source', label: '来源' },
      ],
    };
    const id = 'attribute:focus';
    const choice: SavedLiteratureView = {
      ...saved,
      name: 'Choice',
      columns: ['focus'],
      sort: id,
      filters: [
        { field: id, kind: 'multi-select', operator: 'has-choice', value: 'proof' },
        { field: id, kind: 'multi-select', operator: 'has-choice', value: 'source' },
      ],
    };
    const rules = readLiteratureViews(writeLiteratureViews([choice]))[0]!.filters;
    const renamed = {
      ...definition,
      options: [{ id: 'proof', label: '证明过程' }, definition.options![1]!],
    };
    const catalog = (field: ItemAttributeDefinition) =>
      new Map([[id, { kind: field.type, definition: field }]] as const);
    const matches = compileLiteratureFilters(rules, catalog(renamed))!;
    const full = item('Reading Focus: ["proof","source"]');
    expect(matches(full)).toBe(true);
    expect(matches(item('Reading Focus: ["proof"]'))).toBe(false);
    expect(matches(item('Reading Focus: ["proof","source","unknown"]'))).toBe(false);
    expect(matches(item('Reading Focus: 证明'))).toBe(false);
    expect(
      projectLiteratureRows([full], [{ id, label: 'Focus', definition: renamed }])[0]?.cells,
    ).toEqual([{ state: 'value', value: '证明过程 · 来源' }]);
    expect(
      compileLiteratureFilters(
        rules,
        catalog({ ...renamed, options: renamed.options.slice(0, 1) }),
      ),
    ).toBeNull();
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
