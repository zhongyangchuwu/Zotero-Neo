export type PickerScope =
  | 'all'
  | 'collection'
  | 'tabs'
  | 'notes'
  | 'tags'
  | 'tag-edit'
  | 'commands';

export interface PickerItem {
  id: string | number;
  title: string;
  search: string;
  citekey?: string;
  author?: string;
  year?: string;
  kind?: string;
  selected?: boolean;
  preview?: string;
  meta?: string;
  section?: 'current' | 'all';
  tagType?: 'manual' | 'automatic';
  tagState?: 'all' | 'mixed' | 'none';
}
