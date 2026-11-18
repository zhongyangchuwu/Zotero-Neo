import { exactDecimalSortKey } from '../item-attributes/decimal';
import { readAttributeValue } from '../item-attributes/extra';
import type { LiteratureItem } from './controller';
import {
  MAX_LITERATURE_FILTERS,
  MAX_LITERATURE_FILTER_VALUE,
  type LiteratureFilter,
  type LiteratureFilterFieldID,
  type LiteratureFilterKind,
  type LiteratureFilterOperator,
} from './views';

const TEXT_OPERATORS: readonly LiteratureFilterOperator[] = ['contains', 'equals'];
const NUMBER_OPERATORS: readonly LiteratureFilterOperator[] = ['equals', 'at-least', 'at-most'];
const PDF_OPERATORS: readonly LiteratureFilterOperator[] = ['has', 'missing'];

export function literatureFilterOperators(
  kind: LiteratureFilterKind,
): readonly LiteratureFilterOperator[] {
  switch (kind) {
    case 'text':
      return TEXT_OPERATORS;
    case 'number':
      return NUMBER_OPERATORS;
    case 'pdf':
      return PDF_OPERATORS;
    default:
      return [];
  }
}

export function validLiteratureFilter(
  filter: LiteratureFilter,
  kind: LiteratureFilterKind,
): boolean {
  if (
    !filter ||
    filter.kind !== kind ||
    typeof filter.value !== 'string' ||
    filter.value.length > MAX_LITERATURE_FILTER_VALUE ||
    !literatureFilterOperators(kind).includes(filter.operator)
  )
    return false;
  if (kind === 'pdf') return filter.value === '';
  const value = filter.value.trim();
  return value !== '' && (kind !== 'number' || exactDecimalSortKey(value) !== null);
}

export function compileLiteratureFilters(
  filters: readonly LiteratureFilter[],
  fields: ReadonlyMap<
    LiteratureFilterFieldID,
    { readonly kind: LiteratureFilterKind; readonly key?: string }
  >,
): ((item: LiteratureItem) => boolean) | null {
  if (filters.length > MAX_LITERATURE_FILTERS) return null;
  const predicates: Array<(item: LiteratureItem) => boolean> = [];
  for (const filter of filters) {
    if (!filter || typeof filter.field !== 'string') return null;
    const field = fields.get(filter.field);
    if (!field || !validLiteratureFilter(filter, field.kind)) return null;
    if (filter.field === 'pdf') {
      if (field.kind !== 'pdf') return null;
      const expected = filter.operator === 'has';
      predicates.push((item) => item.hasPDF === expected);
      continue;
    }
    if (
      (filter.field === 'title' && field.kind !== 'text') ||
      (filter.field === 'year' && field.kind !== 'number') ||
      (filter.field !== 'title' &&
        filter.field !== 'year' &&
        (!filter.field.startsWith('attribute:') ||
          !filter.field.slice('attribute:'.length).trim() ||
          !field.key ||
          field.kind === 'pdf'))
    )
      return null;

    const key = field.key;
    const fieldID = filter.field;
    const valueOf = (item: LiteratureItem): string | null => {
      if (fieldID === 'title') return item.title.trim() || null;
      if (fieldID === 'year') return item.year.trim() || null;
      const state = readAttributeValue(item.extra, key!);
      return state.ambiguous ? null : state.value;
    };
    if (field.kind === 'number') {
      const target = exactDecimalSortKey(filter.value.trim())!;
      const operator = filter.operator;
      predicates.push((item) => {
        const value = valueOf(item);
        const actual = value === null ? null : exactDecimalSortKey(value);
        if (actual === null) return false;
        if (operator === 'equals') return actual === target;
        return operator === 'at-least' ? actual >= target : actual <= target;
      });
    } else {
      const target = filter.value.trim().normalize('NFC').toLowerCase().normalize('NFC');
      const contains = filter.operator === 'contains';
      predicates.push((item) => {
        const value = valueOf(item);
        if (value === null || !value.trim()) return false;
        const actual = value.trim().normalize('NFC').toLowerCase().normalize('NFC');
        return contains ? actual.includes(target) : actual === target;
      });
    }
  }
  return (item) => predicates.every((predicate) => predicate(item));
}
