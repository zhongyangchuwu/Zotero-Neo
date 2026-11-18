import { exactDecimalSortKey } from '../item-attributes/decimal';
import { displayAttributeValue, readAttributeValue } from '../item-attributes/extra';
import { isChoiceAttribute, type ItemAttributeDefinition } from '../item-attributes/types';
import type { LiteratureItem, LiteratureScope } from './controller';
import type { LiteratureFilter, LiteratureFilterField, LiteratureViewMessage } from './views';

export type LiteratureLanguage = 'en' | 'zh-CN';
export type LiteratureNativeFieldID = `native:${string}`;
export type LiteratureColumnID = 'title' | 'year' | LiteratureNativeFieldID | `attribute:${string}`;
export type LiteratureSortDirection = 'ascending' | 'descending';

interface LiteratureHeading {
  readonly id: LiteratureColumnID;
  readonly label: string;
}

export interface LiteratureNativeField extends LiteratureHeading {
  readonly id: LiteratureNativeFieldID;
  readonly kind: 'text' | 'tags' | 'date';
}

export interface LiteratureDateValue {
  readonly text: string;
  /** Canonical calendar date at its actual precision, with UTC time if stored by Zotero. */
  readonly key: string | null;
}

export type LiteratureNativeValue =
  | string
  | LiteratureDateValue
  | { readonly tags: readonly string[] };

export function isLiteratureNativeFieldID(value: unknown): value is LiteratureNativeFieldID {
  return typeof value === 'string' && /^native:[A-Za-z][A-Za-z0-9]*$/u.test(value);
}

const DAYS_BY_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** ISO calendar values only; Date.parse would silently invent or roll over components. */
export function literatureDateKey(value: string): string | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (!year) return null;
  if (match[2] === undefined) return value;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  if (match[3] === undefined) return value;
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const limit = month === 2 && leap ? 29 : DAYS_BY_MONTH[month - 1]!;
  return day >= 1 && day <= limit ? value : null;
}

export interface LiteratureColumn extends LiteratureHeading {
  readonly definition?: ItemAttributeDefinition;
  readonly kind?: LiteratureNativeField['kind'];
}

type LiteratureCell =
  | { readonly state: 'missing' | 'ambiguous' }
  | {
      readonly state: 'value' | 'invalid' | 'invalid-date' | 'invalid-choice';
      readonly value: string;
    }
  | { readonly state: 'value'; readonly values: readonly string[] };

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
    readonly columnID: LiteratureColumnID;
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
  readonly filterFields: readonly LiteratureFilterField[];
  readonly filters: readonly LiteratureFilter[];
  readonly filterUnavailable: boolean;
  readonly layoutUnavailable: boolean;
  readonly scopeTotal: number;
  readonly viewNames: readonly string[];
  readonly activeViewName: string | null;
  readonly viewDirty: boolean;
  readonly viewCanSave: boolean;
  readonly viewMessage: LiteratureViewMessage | null;
}

export type LiteratureTableCommand =
  | { readonly type: 'scope'; readonly id: string }
  | { readonly type: 'column'; readonly id: string }
  | { readonly type: 'sort'; readonly id: LiteratureColumnID }
  | { readonly type: 'page'; readonly delta: -1 | 1 }
  | { readonly type: 'retry' }
  | { readonly type: 'locate'; readonly id: number }
  | { readonly type: 'filter-set'; readonly index?: number; readonly filter: LiteratureFilter }
  | { readonly type: 'filter-remove'; readonly index: number }
  | { readonly type: 'view-open'; readonly name: string | null }
  | { readonly type: 'view-save'; readonly name: string; readonly replace: boolean }
  | { readonly type: 'view-delete' };

const MISSING: LiteratureCell = { state: 'missing' };
const AMBIGUOUS: LiteratureCell = { state: 'ambiguous' };

function cell(item: LiteratureItem, column: LiteratureColumn): LiteratureCell {
  if (isLiteratureNativeFieldID(column.id)) {
    const native = item.native?.[column.id];
    if (native === undefined) return MISSING;
    if (typeof native === 'string')
      return native.trim() ? { state: 'value', value: native } : MISSING;
    if ('tags' in native)
      return native.tags.length ? { state: 'value', values: native.tags } : MISSING;
    return { state: native.key === null ? 'invalid-date' : 'value', value: native.text };
  }
  const definition = column.definition;
  if (!definition) {
    const value = column.id === 'title' ? item.title : item.year;
    return value.trim() ? { state: 'value', value } : MISSING;
  }
  const state = readAttributeValue(item.extra, definition.key);
  if (state.ambiguous) return AMBIGUOUS;
  if (state.value === null) return MISSING;
  const value = displayAttributeValue(definition, state.value);
  if (!value.text) return MISSING;
  return {
    state: value.valid
      ? 'value'
      : isChoiceAttribute(definition.type)
        ? 'invalid-choice'
        : 'invalid',
    value: value.text,
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
  const nativeID = isLiteratureNativeFieldID(column.id) ? column.id : null;
  const numeric = column.id === 'year' || definition?.type === 'number';
  const choice = definition && isChoiceAttribute(definition.type) ? definition : null;
  const rows = items.map((item) => {
    const native = nativeID ? item.native?.[nativeID] : undefined;
    if (nativeID) {
      if (native === undefined) return { item, key: null };
      if (typeof native === 'string') return { item, key: native.trim() || null };
      if ('tags' in native) {
        const { tags } = native;
        return {
          item,
          key: tags.length > 1 ? [...tags].sort(collator.compare) : tags.length ? tags : null,
        };
      }
      return { item, key: native.key };
    }
    const value = definition
      ? readAttributeValue(item.extra, definition.key).value
      : column.id === 'title'
        ? item.title.trim()
        : item.year.trim();
    if (choice && value !== null) {
      const display = displayAttributeValue(choice, value);
      return { item, key: display.valid && display.text ? display.text : null };
    }
    return { item, key: !value ? null : numeric ? exactDecimalSortKey(value) : value };
  });
  const sign = direction === 'ascending' ? 1 : -1;
  rows.sort((left, right) => {
    const a = left.key;
    const b = right.key;
    const tie = left.item.id - right.item.id;
    if (a === null) return b === null ? tie : 1;
    if (b === null) return -1;
    let order: number;
    if (typeof a === 'string' && typeof b === 'string') {
      order =
        numeric || column.kind === 'date' ? (a < b ? -1 : a > b ? 1 : 0) : collator.compare(a, b);
    } else if (typeof a !== 'string' && typeof b !== 'string') {
      order = 0;
      for (let i = 0; i < Math.min(a.length, b.length) && !order; ++i)
        order = collator.compare(a[i]!, b[i]!);
      order ||= a.length - b.length;
    } else {
      order = typeof a === 'string' ? -1 : 1;
    }
    return sign * order || tie;
  });
  return rows.map(({ item }) => item);
}

export const LITERATURE_TABLE_TEXT = {
  en: {
    heading: 'Literature Table',
    scope: 'Library or collection',
    columns: 'Columns',
    noColumns: 'No optional columns are available.',
    title: 'Title',
    year: 'Year',
    tags: 'Tags',
    creators: 'Creators',
    itemType: 'Item type',
    publicationDate: 'Publication date',
    dateAdded: 'Date added (UTC)',
    dateModified: 'Date modified (UTC)',
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
    invalidDate: 'Date cannot be compared',
    invalidChoice: 'Value uses an unavailable or invalid choice',
  },
  'zh-CN': {
    heading: '文献表格',
    scope: '文库或分类',
    columns: '列',
    noColumns: '没有可选列。',
    title: '标题',
    year: '年份',
    tags: '标签',
    creators: '创建者',
    itemType: '条目类型',
    publicationDate: '出版日期',
    dateAdded: '添加日期（UTC）',
    dateModified: '修改日期（UTC）',
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
    invalidDate: '此日期无法比较',
    invalidChoice: '值含不可用或无效选项',
  },
} as const;
