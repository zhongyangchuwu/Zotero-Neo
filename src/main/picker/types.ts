import type { PickerItem } from './model';

export type PickerPane = 'search' | 'list' | 'preview';

export interface PickerPreview {
  readonly title: string;
  readonly body: string;
}
/** Shell-owned operations exposed to scope-specific command handling. */
export interface PickerProviderCommands {
  render(): void;
  filter(query?: string, focusID?: string): void;
  focusPane(pane: PickerPane): boolean;
  select(openInWindow: boolean, closeWhenDone?: boolean): Promise<boolean>;
  close(): void;
  enqueue(label: string, operation: () => Promise<unknown> | void): void;
  armCommand(command: string): void;
  isCurrent(generation: number): boolean;
}

/** Direct scope provider contract; shell owns mounting, rendering, and containment. */
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
  activate(item: PickerItem, openInWindow: boolean): Promise<void> | void;
  initialize?(commands: PickerProviderCommands): void;
  filter?(query: string, commands: PickerProviderCommands, focusID?: string): void;
  onClose?(): void;
  onEscape?(commands: PickerProviderCommands): boolean;
  onKeyDown?(event: KeyboardEvent, commands: PickerProviderCommands): boolean;
  onRowRender?(row: HTMLElement, item: PickerItem): void;
  emptyText?(query: string): string;
  countText?(filtered: number, items: number): string;
}
