import type { PickerColumn } from './model';
import type { PickerPane, PickerPreviewSection } from './types';

export interface PickerRowCells {
  title: string;
  author?: string;
  year?: string;
  citekey?: string;
  icon?: string;
  detail?: string;
  matches?: readonly number[];
}

export interface PickerReactRow {
  text: string;
  boundary: boolean;
  cells?: PickerRowCells;
  columns?: readonly PickerColumn[];
  icon?: 'folder' | 'plus';
  kind?: 'item' | 'action';
  selectable?: boolean;
}

/** Serializable presentation data; providers and native items stay in the controller. */
export interface PickerReactModel {
  title: string;
  placeholder: string;
  sourceLabel: string | null;
  sourceDisabled: boolean;
  count: string;
  rows: readonly PickerReactRow[];
  selected: number;
  panes: 1 | 2;
  multiSelect: boolean;
  /** Indices in the current rows; selected is the independent active row. */
  marked: readonly number[];
  empty: string;
  loading: boolean;
  previewTitle: string;
  previewBody: string;
  previewMeta?: string;
  previewCitekey?: string;
  previewSections?: readonly PickerPreviewSection[];
  shortcutHelp: string;
  status: string;
  focusPane: PickerPane;
  mouseEnabled: boolean;
}

// Input, pointer, and keyboard events remain owned by the native controller.
export type PickerReactCommand = never;
