export interface ReaderFiguresReactModel {
  readonly text: Record<string, string>;
  readonly kind: string;
  readonly part: string;
  readonly rows: readonly string[];
  readonly selected: number;
  readonly status: string;
  readonly previewText: string;
  readonly image: { readonly src: string; readonly alt: string } | null;
  readonly zoom: number;
  readonly pending: boolean;
}

export type ReaderFiguresReactCommand =
  | { readonly type: 'close' | 'confirm' }
  | { readonly type: 'kind' | 'part'; readonly value: string }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'zoom'; readonly direction: -1 | 0 | 1 };
