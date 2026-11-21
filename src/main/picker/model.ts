import type { PickerPreviewSection } from './types';

export type PickerScope =
  | 'all'
  | 'collection'
  | 'collections'
  | 'tabs'
  | 'notes'
  | 'tags'
  | 'commands';

/** Structured cell presentation; text still comes from the candidate provider. */
export interface PickerColumn {
  readonly text: string;
  readonly role?: 'primary' | 'muted' | 'mono' | 'badge';
  readonly align?: 'start' | 'end';
  readonly weight?: number;
  readonly matches?: readonly number[];
}

export interface PickerItem {
  id: string | number;
  title: string;
  search: string;
  citekey?: string;
  author?: string;
  year?: string;
  bibliography?: { icon?: string; sections?: readonly PickerPreviewSection[] };
  kind?: string;
  selectable?: boolean;
  columns?: readonly PickerColumn[];
  icon?: 'folder' | 'plus';
  selected?: boolean;
  preview?: string;
  meta?: string;
  /** Stable owner identity for decorative boundaries; never a selectable row. */
  group?: string;
  tagName?: string;
  tagCandidate?: 'tag' | 'create' | 'namespace';
  collectionCandidate?: 'collection' | 'root' | 'create';
}
