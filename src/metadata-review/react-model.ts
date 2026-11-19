import type { MetadataField } from './model';
export interface MetadataReviewModel {
  readonly chinese: boolean;
  readonly sources: readonly { readonly id: string; readonly label: string }[];
  readonly source: string;
  readonly items: readonly { readonly title: string; readonly status: string }[];
  readonly itemIndex: number;
  readonly busy: boolean;
  readonly querying: boolean;
  readonly fillCount: number;
  readonly batchStatus: string;
  readonly status: string;
  readonly error: boolean;
  readonly candidates: readonly string[];
  readonly candidateIndex: number;
  readonly provenance: string;
  readonly fields: readonly {
    readonly field: MetadataField;
    readonly before: string;
    readonly after: string;
    readonly selected: boolean;
  }[];
  readonly history: readonly { readonly id: string; readonly title: string }[];
  readonly historyStatus: string;
  readonly historyError: boolean;
  readonly canApply: boolean;
  readonly canSave: boolean;
  readonly canEdit: boolean;
  readonly bibtex: string;
}
export type MetadataReviewCommand =
  | {
      readonly type:
        | 'close'
        | 'inspect'
        | 'inspect-all'
        | 'refresh'
        | 'stop'
        | 'apply'
        | 'fill'
        | 'save';
    }
  | { readonly type: 'source'; readonly value: string }
  | { readonly type: 'item' | 'candidate'; readonly index: number }
  | { readonly type: 'field'; readonly field: MetadataField; readonly checked: boolean }
  | { readonly type: 'bibtex'; readonly value: string }
  | { readonly type: 'load-history'; readonly index: number }
  | { readonly type: 'history'; readonly id: string };
