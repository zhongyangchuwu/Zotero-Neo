import type { CommandPaletteContext } from '../../core/contracts';
import type { PickerItem } from './model';

export type PickerPane = 'search' | 'list' | 'preview';

export interface PickerPreview {
  readonly title: string;
  readonly body: string;
}

export type PickerConfirm = (item: PickerItem, openInWindow: boolean) => Promise<void> | void;

/**
 * One invocation of the shared candidate surface.
 *
 * The caller owns semantic confirmation. A custom source is used when one domain action needs a
 * constrained candidate set without teaching the shell that domain's operations.
 */
export interface PickerOpenOptions {
  readonly confirm?: PickerConfirm;
  readonly closeBeforeConfirm?: boolean;
  readonly commandContext?: CommandPaletteContext;
  readonly source?: PickerProvider;
}

/** Candidate data/presentation contract for the shared search/list/preview surface. */
export interface PickerProvider {
  readonly title: string;
  readonly placeholder: string;
  readonly initialFocusPane?: PickerPane;
  readonly loadingText?: string;
  readonly help?: { readonly query: string; readonly list: string };
  load(): Promise<PickerItem[]>;
  rowText(item: PickerItem, index: number): string;
  preview(item: PickerItem): PickerPreview;
  /** Optional pure candidate projection/ranking for domain-shaped queries. */
  filterItems?(items: readonly PickerItem[], query: string): PickerItem[];
  /**
   * Optional query refinement for non-terminal candidates such as virtual tag namespaces.
   * Returning a string keeps the chooser open and replaces the query instead of confirming.
   */
  refineQuery?(item: PickerItem): string | null;
  emptyText?(query: string): string;
  countText?(filtered: number, items: number): string;
}
