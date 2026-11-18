import type { LiteratureScope } from './controller';
import type { LiteratureColumnID, LiteratureSortDirection } from './model';

export type LiteratureFilterFieldID = LiteratureColumnID | 'pdf';
export type LiteratureFilterKind = 'text' | 'number' | 'pdf';
export type LiteratureFilterOperator =
  | 'contains'
  | 'equals'
  | 'at-least'
  | 'at-most'
  | 'has'
  | 'missing';

export interface LiteratureFilterField {
  readonly id: LiteratureFilterFieldID;
  readonly kind: LiteratureFilterKind;
  readonly label: string;
}

export interface LiteratureFilter {
  readonly field: LiteratureFilterFieldID;
  readonly kind: LiteratureFilterKind;
  readonly operator: LiteratureFilterOperator;
  readonly value: string;
}

export interface SavedLiteratureView {
  readonly name: string;
  readonly scope: LiteratureScope;
  readonly columns: readonly string[];
  readonly sort: LiteratureColumnID;
  readonly direction: LiteratureSortDirection;
  readonly filters: readonly LiteratureFilter[];
}

export type LiteratureViewMessage =
  | 'saved'
  | 'deleted'
  | 'duplicate'
  | 'conflict'
  | 'storage-error';

export const LITERATURE_VIEWS_PREFERENCE = 'literatureTable.views.v1';
export const MAX_LITERATURE_VIEW_NAME = 80;
export const MAX_LITERATURE_FILTERS = 24;
export const MAX_LITERATURE_FILTER_VALUE = 500;
