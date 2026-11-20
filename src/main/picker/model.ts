import type { PickerPreviewSection } from './types';

export type PickerScope =
  | 'all'
  | 'collection'
  | 'collections'
  | 'tabs'
  | 'notes'
  | 'tags'
  | 'commands';

export interface PickerItem {
  id: string | number;
  title: string;
  search: string;
  citekey?: string;
  author?: string;
  year?: string;
  bibliography?: { icon?: string; sections?: readonly PickerPreviewSection[] };
  kind?: string;
  selected?: boolean;
  preview?: string;
  meta?: string;
  /** Stable owner identity for decorative boundaries; never a selectable row. */
  group?: string;
  tagName?: string;
  tagCandidate?: 'tag' | 'create' | 'namespace';
  collectionCandidate?: 'collection' | 'root' | 'create';
}
