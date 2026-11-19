import type { BindingEditTarget } from '../input/binding-editor';
import type { BindingContext } from '../input/bindings';
import type { ActionId } from '../input/actions';
import type {
  ActionGroup,
  NativeShortcutEntry,
  ShortcutCatalogEntry,
} from '../input/shortcut-catalog';
import type { KeyEventLike } from '../input/keys';

export interface KeybindingsPageModel {
  readonly labels: Readonly<Record<string, string>>;
  readonly contexts: readonly { value: BindingContext; label: string }[];
  readonly groups: readonly { value: ActionGroup; label: string }[];
  readonly catalog: readonly ShortcutCatalogEntry[];
  readonly native: readonly NativeShortcutEntry[];
  readonly unavailable: readonly (BindingEditTarget & { readonly previous: string })[];
  readonly edit:
    | (BindingEditTarget & {
        readonly mode: 'recording' | 'expression';
        readonly sequence: string;
        readonly error: string;
        readonly warning: string;
        readonly exact: ActionId | undefined;
        readonly canSave: boolean;
      })
    | null;
  readonly notice: {
    readonly context: BindingContext;
    readonly action: ActionId;
    readonly text: string;
  } | null;
  readonly guide: {
    readonly enabled: boolean;
    readonly delayMs: number;
    readonly fontSizePx: number;
    readonly error: string;
  };
}

export type KeybindingsPageCommand =
  | ({ readonly type: 'record' } & BindingEditTarget)
  | { readonly type: 'record-key'; readonly event: KeyEventLike }
  | { readonly type: 'pop-key' | 'toggle-expression' | 'cancel-edit' }
  | { readonly type: 'expression'; readonly value: string }
  | { readonly type: 'save-edit'; readonly overwrite?: ActionId }
  | {
      readonly type: 'unbind' | 'reset-action';
      readonly context: BindingContext;
      readonly action: ActionId;
    }
  | ({ readonly type: 'delete-row'; readonly previous: string } & BindingEditTarget)
  | { readonly type: 'guide-enabled'; readonly value: boolean }
  | {
      readonly type: 'guide-number';
      readonly setting: 'delayMs' | 'fontSizePx';
      readonly value: number;
    };
