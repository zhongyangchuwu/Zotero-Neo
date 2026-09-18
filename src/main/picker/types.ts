import type { CommandPaletteContext } from '../../core/contracts';
import type { PickerItem } from './model';

export type PickerPane = 'search' | 'list' | 'preview';

export interface PickerPreview {
  readonly title: string;
  readonly body: string;
}

export type PickerConfirm = (item: PickerItem, openInWindow: boolean) => Promise<void> | void;

export interface PickerOpenOptions {
  readonly confirm?: PickerConfirm;
  readonly closeBeforeConfirm?: boolean;
  readonly commandContext?: CommandPaletteContext;
}

/** Shell-owned operations exposed only to the remaining specialized Tag Filter surface. */
export interface PickerProviderCommands {
  render(): void;
  filter(query?: string, focusID?: string): void;
  focusPane(pane: PickerPane): boolean;
  close(): void;
  enqueue(label: string, operation: () => Promise<unknown> | void): void;
  isCurrent(generation: number): boolean;
}

/**
 * Candidate source for the shared search/list/preview surface.
 *
 * Ordinary sources own data and presentation only. Confirmation belongs to the invoking semantic
 * action via PickerOpenOptions.confirm. The optional interaction hooks are transitional ownership
 * for the Tag Filter surface and should not be copied into new sources.
 */
export interface PickerProvider {
  readonly title: string;
  readonly placeholder: string;
  readonly initialFocusPane?: PickerPane;
  readonly loadingText?: string;
  readonly help?: { readonly query: string; readonly list: string };
  readonly searchFocusUpdates?: boolean;
  readonly inputClick?: (commands: PickerProviderCommands) => void;
  load(): Promise<PickerItem[]>;
  rowText(item: PickerItem, index: number): string;
  preview(item: PickerItem): PickerPreview;
  initialize?(commands: PickerProviderCommands): void;
  filter?(query: string, commands: PickerProviderCommands, focusID?: string): void;
  onClose?(): void;
  onEscape?(commands: PickerProviderCommands): boolean;
  onKeyDown?(event: KeyboardEvent, commands: PickerProviderCommands): boolean;
  onRowRender?(row: HTMLElement, item: PickerItem): void;
  emptyText?(query: string): string;
  countText?(filtered: number, items: number): string;
}
