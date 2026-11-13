export interface SearchDialogReactModel {
  readonly title: string;
  readonly placeholder: string;
  readonly help: string;
  readonly close: string;
  readonly empty: string;
  readonly status: string;
  readonly loaded: boolean;
  readonly scopes: readonly { readonly id: string; readonly title: string }[];
  readonly scope: string;
  readonly rows: readonly string[];
  readonly selected: number;
  readonly pending: boolean;
  readonly actions: readonly { readonly label: string; readonly disabled: boolean }[];
  readonly hasPreview: boolean;
  readonly previewText: string;
  readonly previewImages: readonly { readonly dataURL: string; readonly alt: string }[];
}

export type SearchDialogReactCommand =
  | { readonly type: 'close' }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'action'; readonly index: number }
  | { readonly type: 'scope'; readonly value: string };
