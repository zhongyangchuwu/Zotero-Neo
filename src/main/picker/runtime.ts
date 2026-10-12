import type { LocalBindingRuntime } from '../../input/local-binding-runtime';
import type { CompositionState } from '../../input/composition';
import type { PickerItem, PickerScope } from './model';
import type { PickerCloseReason, PickerConfirm, PickerProvider } from './types';

/** Mutable runtime state owned by one active Main-window picker instance. */
export class PickerRuntime {
  open = false;
  generation = 0;
  scope: PickerScope = 'all';
  overlay: HTMLElement | null = null;
  input: HTMLInputElement | null = null;
  composition: CompositionState = { active: false };
  committedQuery = '';
  sourceRevision = 0;
  confirming = false;
  sourceTitle: HTMLElement | null = null;
  sourceButton: HTMLButtonElement | null = null;
  operationStatus: HTMLElement | null = null;
  results: HTMLElement | null = null;
  preview: HTMLElement | null = null;
  count: HTMLElement | null = null;
  previewTitle: HTMLElement | null = null;
  help: HTMLElement | null = null;
  queryHelp: HTMLElement | null = null;
  listHelp: HTMLElement | null = null;
  items: PickerItem[] = [];
  filtered: PickerItem[] = [];
  selected = 0;
  focusPane: 'search' | 'list' | 'preview' = 'search';
  provider: PickerProvider | null = null;
  confirm: PickerConfirm | null = null;
  closeBeforeConfirm = false;
  onClose: ((reason: PickerCloseReason) => void) | null = null;
  queue: Promise<void> = Promise.resolve();
  inputCleanup: (() => void) | null = null;
  localBindings: LocalBindingRuntime | null = null;
  layout: 'dual' | 'single' = 'dual';
  previousElement: Element | null = null;
  previousWindow: Window | null = null;
  themeCleanup: (() => void) | null = null;
}
