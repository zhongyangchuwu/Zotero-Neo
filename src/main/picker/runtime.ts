import type { LocalBindingRuntime } from '../../input/local-binding-runtime';
import type { CompositionState } from '../../input/composition';
import type { PickerItem, PickerScope } from './model';
import type { PickerCloseReason, PickerConfirm, PickerConfirmMany, PickerProvider } from './types';
import type { NativeReactView } from '../../ui/react/types';
import type { PickerReactModel } from './react-model';

/** Mutable runtime state owned by one active Main-window picker instance. */
export class PickerRuntime {
  open = false;
  generation = 0;
  scope: PickerScope = 'all';
  view: NativeReactView<PickerReactModel> | null = null;
  status = '';
  loadingText = '';
  loadError = '';
  overlay: HTMLElement | null = null;
  input: HTMLInputElement | null = null;
  composition: CompositionState = { active: false };
  committedQuery = '';
  sourceRevision = 0;
  queryRevision = 0;
  confirming = false;
  sourceButton: HTMLButtonElement | null = null;
  results: HTMLElement | null = null;
  preview: HTMLElement | null = null;
  items: PickerItem[] = [];
  filtered: PickerItem[] = [];
  selected = 0;
  panes: 1 | 2 = 2;
  /** IDs survive filtering; the snapshots support providers whose queries return only visible rows. */
  marked: Map<PickerItem['id'], PickerItem> | null = null;
  /** Selected identity retained until the current source/query produces authoritative results. */
  pendingSelectionID: PickerItem['id'] | undefined;
  focusPane: 'search' | 'list' | 'preview' = 'search';
  provider: PickerProvider | null = null;
  confirm: PickerConfirm | null = null;
  confirmMany: PickerConfirmMany | null = null;
  closeBeforeConfirm = false;
  onClose: ((reason: PickerCloseReason) => void) | null = null;
  queue: Promise<void> = Promise.resolve();
  inputCleanup: (() => void) | null = null;
  localBindings: LocalBindingRuntime | null = null;
  previousElement: Element | null = null;
  previousWindow: Window | null = null;
  themeCleanup: (() => void) | null = null;
}
