export type ItemTargetSource = 'main' | 'reader' | 'note';

export type MainItemTargetOrigin = 'selection' | 'visual' | 'native-selection' | 'cursor';

export interface MainItemTargetPresentation {
  readonly origin: MainItemTargetOrigin;
  readonly outsideCurrentList: number;
}

type ItemTargetFields<Source extends ItemTargetSource> = {
  readonly source: Source;
  readonly items: readonly Zotero.Item[];
  readonly total: number;
  readonly missing: number;
};

export type ItemTargetSet<Source extends ItemTargetSource = ItemTargetSource> =
  Source extends 'main'
    ? ItemTargetFields<'main'> & { readonly presentation: MainItemTargetPresentation }
    : ItemTargetFields<Source> & { readonly presentation?: never };
