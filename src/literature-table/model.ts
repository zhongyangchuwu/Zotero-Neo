import { exactDecimalSortKey, isExactDecimal } from '../item-attributes/decimal';
import { readAttributeValue } from '../item-attributes/extra';
import type { ItemAttributeDefinition } from '../item-attributes/types';
import type { LiteratureItem, LiteratureScope } from './controller';

export type LiteratureLanguage = 'en' | 'zh-CN';
export type LiteratureColumnID = 'title' | 'year' | `attribute:${string}`;
export type LiteratureSortDirection = 'ascending' | 'descending';

interface LiteratureHeading {
  readonly id: LiteratureColumnID;
  readonly label: string;
}

export interface LiteratureColumn extends LiteratureHeading {
  readonly definition?: ItemAttributeDefinition;
}

type LiteratureCell =
  | { readonly state: 'missing' | 'ambiguous' }
  | { readonly state: 'value' | 'invalid'; readonly value: string };

export interface LiteratureRow {
  readonly id: number;
  readonly cells: readonly LiteratureCell[];
}

export interface LiteratureTableModel {
  readonly language: LiteratureLanguage;
  readonly scopes: readonly LiteratureScope[];
  readonly scope: LiteratureScope | undefined;
  readonly status: 'loading' | 'ready' | 'unavailable' | 'error';
  readonly columns: readonly LiteratureHeading[];
  readonly choices: readonly {
    readonly id: string;
    readonly label: string;
    readonly shown: boolean;
  }[];
  readonly sortColumn: LiteratureColumnID;
  readonly sortDirection: LiteratureSortDirection;
  readonly rows: readonly LiteratureRow[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
  readonly locating: boolean;
  readonly locateFailed: boolean;
}

export type LiteratureTableCommand =
  | { readonly type: 'scope'; readonly id: string }
  | { readonly type: 'column'; readonly id: string }
  | { readonly type: 'sort'; readonly id: LiteratureColumnID }
  | { readonly type: 'page'; readonly delta: -1 | 1 }
  | { readonly type: 'retry' }
  | { readonly type: 'locate'; readonly id: number };

const MISSING: LiteratureCell = { state: 'missing' };
const AMBIGUOUS: LiteratureCell = { state: 'ambiguous' };

function cell(item: LiteratureItem, column: LiteratureColumn): LiteratureCell {
  const definition = column.definition;
  if (!definition) {
    const value = column.id === 'title' ? item.title : item.year;
    return value.trim() ? { state: 'value', value } : MISSING;
  }
  const state = readAttributeValue(item.extra, definition.key);
  if (state.ambiguous) return AMBIGUOUS;
  if (state.value === null) return MISSING;
  return {
    state: definition.type === 'number' && !isExactDecimal(state.value) ? 'invalid' : 'value',
    value: state.value,
  };
}

export function projectLiteratureRows(
  items: readonly LiteratureItem[],
  columns: readonly LiteratureColumn[],
): LiteratureRow[] {
  return items.map((item) => ({ id: item.id, cells: columns.map((column) => cell(item, column)) }));
}

export function sortLiteratureItems(
  items: readonly LiteratureItem[],
  column: LiteratureColumn,
  direction: LiteratureSortDirection,
  collator: Intl.Collator,
): LiteratureItem[] {
  const definition = column.definition;
  const numeric = column.id === 'year' || definition?.type === 'number';
  const rows = items.map((item) => {
    const value = definition
      ? readAttributeValue(item.extra, definition.key).value
      : column.id === 'title'
        ? item.title.trim()
        : item.year.trim();
    return { item, key: !value ? null : numeric ? exactDecimalSortKey(value) : value };
  });
  const sign = direction === 'ascending' ? 1 : -1;
  rows.sort((left, right) => {
    const a = left.key;
    const b = right.key;
    const tie = left.item.id - right.item.id;
    if (a === null) return b === null ? tie : 1;
    if (b === null) return -1;
    const order = numeric ? (a < b ? -1 : a > b ? 1 : 0) : collator.compare(a, b);
    return sign * order || tie;
  });
  return rows.map(({ item }) => item);
}

export const LITERATURE_TABLE_TEXT = {
  en: {
    heading: 'Literature Table',
    scope: 'Library or collection',
    columns: 'Columns',
    noColumns: 'No custom attributes are defined.',
    title: 'Title',
    year: 'Year',
    actions: 'Actions',
    locate: 'Locate in library',
    locateFailed: 'Could not locate this item in the library.',
    loading: 'Loading literature…',
    mountError: 'Could not open the literature table interface.',
    error: 'Could not load this scope.',
    unavailable:
      'This scope is no longer available. Choose another library or collection, or retry.',
    empty: 'No items in this scope.',
    retry: 'Retry',
    previous: 'Previous page',
    next: 'Next page',
    page: (number: number, count: number, total: number) =>
      `Page ${number} of ${count} · ${total} items`,
    ambiguous: 'Conflicting values',
    invalid: 'Invalid number',
  },
  'zh-CN': {
    heading: '文献表格',
    scope: '文库或分类',
    columns: '列',
    noColumns: '尚未定义自定义属性。',
    title: '标题',
    year: '年份',
    actions: '操作',
    locate: '在文库定位',
    locateFailed: '无法在文库中定位此条目。',
    loading: '正在载入文献…',
    mountError: '无法打开文献表格界面。',
    error: '无法载入此范围。',
    unavailable: '此范围已不可用。请选择其他文库或分类，或重试。',
    empty: '此范围内没有条目。',
    retry: '重试',
    previous: '上一页',
    next: '下一页',
    page: (number: number, count: number, total: number) =>
      `第 ${number} / ${count} 页 · 共 ${total} 条`,
    ambiguous: '属性值冲突',
    invalid: '数字无效',
  },
} as const;
