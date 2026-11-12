export interface KeyGuideReactModel {
  readonly prefix: string;
  readonly entries: readonly { readonly key: string; readonly label: string }[];
  readonly fontSizePx: number;
}
