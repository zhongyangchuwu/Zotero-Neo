export type PickerScope = 'all' | 'collection' | 'tabs' | 'notes' | 'tags' | 'plugins' | 'commands';

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
  tagName?: string;
  tagCandidate?: 'tag' | 'create' | 'namespace';
}
