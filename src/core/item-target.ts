export type ItemTargetSource = 'main' | 'reader' | 'note';

export interface ItemTargetSet<Source extends ItemTargetSource = ItemTargetSource> {
  readonly source: Source;
  readonly items: readonly Zotero.Item[];
  readonly total: number;
  readonly missing: number;
}
