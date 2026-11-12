import type { PickerPane } from './types';

/** Serializable presentation data; providers and native items stay in the controller. */
export interface PickerReactModel {
  title: string;
  placeholder: string;
  sourceLabel: string | null;
  sourceDisabled: boolean;
  count: string;
  rows: Array<{ text: string; boundary: boolean }>;
  selected: number;
  empty: string;
  loading: boolean;
  previewTitle: string;
  previewBody: string;
  queryHelp: string;
  listHelp: string | null;
  status: string;
  focusPane: PickerPane;
  mouseEnabled: boolean;
  single: boolean;
}

// Input, pointer, and keyboard events remain owned by the native controller.
export type PickerReactCommand = never;
