import { exactDecimalSortKey } from '../item-attributes/decimal';
import { readAttributeChoices, readAttributeValue } from '../item-attributes/extra';
import {
  isChoiceAttribute,
  type ItemAttributeDefinition,
  type ItemAttributeOption,
} from '../item-attributes/types';
import type { LiteratureItem } from './controller';
import { isLiteratureNativeFieldID, literatureDateKey } from './model';
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
const TAG_OPERATORS: readonly LiteratureFilterOperator[] = ['has-tag'];
const DATE_OPERATORS: readonly LiteratureFilterOperator[] = ['on', 'on-or-after', 'on-or-before'];
const SINGLE_CHOICE_OPERATORS: readonly LiteratureFilterOperator[] = ['equals'];
const MULTI_CHOICE_OPERATORS: readonly LiteratureFilterOperator[] = ['has-choice'];

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
    case 'tags':
      return TAG_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'single-select':
      return SINGLE_CHOICE_OPERATORS;
    case 'multi-select':
      return MULTI_CHOICE_OPERATORS;
    default:
      return [];
  }
}

export function validLiteratureFilter(
  filter: LiteratureFilter,
  kind: LiteratureFilterKind,
  options?: readonly ItemAttributeOption[],
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
  if (kind === 'single-select' || kind === 'multi-select')
    return options?.some(({ id }) => id === filter.value) ?? false;
  const value = filter.value.trim();
  if (kind === 'date') return literatureDateKey(value) !== null;
  return value !== '' && (kind !== 'number' || exactDecimalSortKey(value) !== null);
}

export function compileLiteratureFilters(
  filters: readonly LiteratureFilter[],
  fields: ReadonlyMap<
    LiteratureFilterFieldID,
    {
      readonly kind: LiteratureFilterKind;
      readonly key?: string;
      readonly definition?: ItemAttributeDefinition;
    }
  >,
): ((item: LiteratureItem) => boolean) | null {
  if (filters.length > MAX_LITERATURE_FILTERS) return null;
  const predicates: Array<(item: LiteratureItem) => boolean> = [];
  for (const filter of filters) {
    if (!filter || typeof filter.field !== 'string') return null;
    const field = fields.get(filter.field);
    if (!field || !validLiteratureFilter(filter, field.kind, field.definition?.options))
      return null;
    if (filter.field === 'pdf') {
      if (field.kind !== 'pdf') return null;
      const expected = filter.operator === 'has';
      predicates.push((item) => item.hasPDF === expected);
      continue;
    }
    const fieldID = filter.field;
    if (field.kind === 'single-select' || field.kind === 'multi-select') {
      const definition = field.definition;
      if (
        !definition ||
        !isChoiceAttribute(definition.type) ||
        definition.type !== field.kind ||
        fieldID !== `attribute:${definition.id}`
      )
        return null;
      const known = new Set(definition.options?.map(({ id }) => id));
      const target = filter.value;
      predicates.push((item) => {
        const state = readAttributeValue(item.extra, definition.key);
        if (state.ambiguous || state.value === null) return false;
        const ids = readAttributeChoices(definition, state.value);
        return !!ids?.includes(target) && ids.every((id) => known.has(id));
      });
      continue;
    }
    if (isLiteratureNativeFieldID(fieldID)) {
      if (field.kind === 'tags' && fieldID === 'native:tags') {
        const tag = filter.value;
        predicates.push((item) => {
          const value = item.native?.[fieldID];
          return typeof value === 'object' && 'tags' in value && value.tags.includes(tag);
        });
        continue;
      }
      if (field.kind === 'date') {
        const target = literatureDateKey(filter.value.trim())!;
        const operator = filter.operator;
        predicates.push((item) => {
          const value = item.native?.[fieldID];
          if (typeof value !== 'object' || !('key' in value) || value.key === null) return false;
          const actual = value.key;
          // A more precise date within the requested period matches it, but not vice versa.
          if (actual.startsWith(target)) return true;
          if (operator === 'on' || target.startsWith(actual)) return false;
          return operator === 'on-or-after' ? actual > target : actual < target;
        });
        continue;
      }
      if (field.kind !== 'text') return null;
    } else if (
      (fieldID === 'title' && field.kind !== 'text') ||
      (fieldID === 'year' && field.kind !== 'number') ||
      (fieldID !== 'title' &&
        fieldID !== 'year' &&
        (!fieldID.startsWith('attribute:') ||
          !fieldID.slice('attribute:'.length).trim() ||
          !field.key ||
          (field.kind !== 'text' && field.kind !== 'number')))
    )
      return null;

    const key = field.key;
    const valueOf = (item: LiteratureItem): string | null => {
      if (fieldID === 'title') return item.title.trim() || null;
      if (fieldID === 'year') return item.year.trim() || null;
      if (isLiteratureNativeFieldID(fieldID)) {
        const value = item.native?.[fieldID];
        return typeof value === 'string' ? value : null;
      }
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
