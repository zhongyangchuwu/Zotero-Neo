import type { BindingEditorIssue, BindingEditorRow, BindingSaveOutcome } from '../input/binding-editor';
import type { BindingContext } from '../input/bindings';
import type { ActionId } from '../input/actions';
import type { ActionGroup, NativeShortcutEntry, ShortcutCatalogEntry } from '../input/shortcut-catalog';
import type { KeyEventLike } from '../input/keys';

export interface KeybindingsPageModel {
  readonly labels: Readonly<Record<string, string>>;
  readonly contexts: readonly { value: BindingContext; label: string }[];
  readonly groups: readonly { value: ActionGroup; label: string }[];
  readonly catalog: readonly ShortcutCatalogEntry[];
  readonly native: readonly NativeShortcutEntry[];
  readonly rows: readonly BindingEditorRow[];
  readonly errors: readonly BindingEditorIssue[];
  readonly warnings: readonly BindingEditorIssue[];
  readonly dirty: boolean;
  readonly canApply: boolean;
  readonly saveOutcome: BindingSaveOutcome;
  readonly recording: { readonly context: BindingContext; readonly action: ActionId; readonly rowId: number | null; readonly tokens: readonly string[]; readonly sequence: string } | null;
  readonly status: string;
  readonly guide: { readonly enabled: boolean; readonly delayMs: number; readonly fontSizePx: number; readonly error: string };
}

export type KeybindingsPageCommand =
  | { readonly type: 'record'; readonly context: BindingContext; readonly action: ActionId; readonly rowId: number | null }
  | { readonly type: 'record-key'; readonly event: KeyEventLike }
  | { readonly type: 'finish-recording' | 'cancel-recording' | 'apply' }
  | { readonly type: 'unbind' | 'reset-action'; readonly context: BindingContext; readonly action: ActionId }
  | { readonly type: 'delete-row'; readonly rowId: number }
  | { readonly type: 'guide-enabled'; readonly value: boolean }
  | { readonly type: 'guide-number'; readonly setting: 'delayMs' | 'fontSizePx'; readonly value: number };
