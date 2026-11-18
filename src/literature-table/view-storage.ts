import type { LiteratureColumnID } from './model';
import { literatureFilterOperators } from './filters';
import {
  MAX_LITERATURE_FILTERS,
  MAX_LITERATURE_FILTER_VALUE,
  MAX_LITERATURE_VIEW_NAME,
  type LiteratureFilter,
  type SavedLiteratureView,
} from './views';

const CONTROL = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

export function cleanLiteratureViewName(name: string): string | null {
  if (typeof name !== 'string' || CONTROL.test(name)) return null;
  const clean = name.trim().normalize('NFC');
  return clean && clean.length <= MAX_LITERATURE_VIEW_NAME ? clean : null;
}

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function boundedString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_LITERATURE_FILTER_VALUE &&
    value.trim().length > 0 &&
    !CONTROL.test(value)
  );
}

function columnID(value: unknown): value is LiteratureColumnID {
  return (
    value === 'title' ||
    value === 'year' ||
    (boundedString(value) &&
      value.startsWith('attribute:') &&
      boundedString(value.slice('attribute:'.length)))
  );
}

function validStoredFilter(value: unknown): value is LiteratureFilter {
  if (
    !record(value, ['field', 'kind', 'operator', 'value']) ||
    (!columnID(value.field) && value.field !== 'pdf') ||
    (value.kind !== 'text' && value.kind !== 'number' && value.kind !== 'pdf') ||
    typeof value.operator !== 'string' ||
    typeof value.value !== 'string' ||
    value.value.length > MAX_LITERATURE_FILTER_VALUE
  )
    return false;
  const filter = value as unknown as LiteratureFilter;
  if (
    filter.field === 'pdf'
      ? filter.kind !== 'pdf'
      : filter.field === 'title'
        ? filter.kind !== 'text'
        : filter.field === 'year'
          ? filter.kind !== 'number'
          : filter.kind === 'pdf'
  )
    return false;
  return literatureFilterOperators(filter.kind).includes(filter.operator);
}

export function readLiteratureViews(raw: string): readonly SavedLiteratureView[] {
  if (raw === '') return [];
  const data: unknown = JSON.parse(raw);
  if (!record(data, ['version', 'views']) || data.version !== 1 || !Array.isArray(data.views))
    throw new Error('Invalid literature views');
  const names = new Set<string>();
  for (const view of data.views as unknown[]) {
    if (
      !record(view, ['name', 'scope', 'columns', 'sort', 'direction', 'filters']) ||
      typeof view.name !== 'string' ||
      !record(view.scope, ['id', 'label']) ||
      !boundedString(view.scope.id) ||
      !boundedString(view.scope.label) ||
      !Array.isArray(view.columns) ||
      !view.columns.every(boundedString) ||
      !columnID(view.sort) ||
      (view.direction !== 'ascending' && view.direction !== 'descending') ||
      !Array.isArray(view.filters) ||
      view.filters.length > MAX_LITERATURE_FILTERS ||
      !view.filters.every(validStoredFilter)
    )
      throw new Error('Invalid literature view');
    const name = cleanLiteratureViewName(view.name);
    if (name === null || view.name !== name) throw new Error('Invalid literature view name');
    const identity = name.toLowerCase().normalize('NFC');
    if (names.has(identity)) throw new Error('Duplicate literature view name');
    names.add(identity);
  }
  return data.views as SavedLiteratureView[];
}

export function writeLiteratureViews(views: readonly SavedLiteratureView[]): string {
  const raw = JSON.stringify({ version: 1, views });
  readLiteratureViews(raw);
  return raw;
}
