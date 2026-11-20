import type { PreferenceStore } from '../core/preference-store';
import {
  BINDINGS_PREFERENCE_KEY,
  KEY_GUIDE_DELAY_PREFERENCE_KEY,
  KEY_GUIDE_ENABLED_PREFERENCE_KEY,
  KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
  KEY_GUIDE_NUMBER_SPECS,
  bindingsFromPreferences,
  keyGuideConfig,
  normalizeKeyGuideNumber,
} from '../core/preferences';
import { ACTION_LABELS, type ActionId } from '../input/actions';
import { actionsForBindingMode } from '../input/binding-capabilities';
import { inspectShortcut, type BindingEditTarget } from '../input/binding-editor';
import {
  BINDING_CONTEXTS,
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  parseBindingKey,
  type BindingMap,
} from '../input/bindings';
import {
  ACTION_GROUPS,
  contextLabel,
  groupLabel,
  nativeShortcutCatalog,
  shortcutCatalog,
  shortcutsForAction,
} from '../input/shortcut-catalog';
import { keyString } from '../input/keys';
import { bindingSequenceTokens, serializeBindingTokens } from '../input/key-sequence';
import { settingsText, type SettingsLanguage, type SettingsMessage } from './settings-i18n';
import type { KeybindingsPageCommand, KeybindingsPageModel } from './settings-keybindings-model';

type ShortcutEdit = BindingEditTarget &
  (
    | { readonly mode: 'recording'; readonly tokens: readonly string[] }
    | { readonly mode: 'expression'; readonly value: string }
  );

function expression(edit: ShortcutEdit): string {
  return edit.mode === 'recording' ? serializeBindingTokens(edit.tokens) : edit.value;
}

function currentTarget(bindings: BindingMap, target: BindingEditTarget): boolean {
  return (
    target.previous === null || bindings[`${target.context}:${target.previous}`] === target.action
  );
}

const MESSAGES = [
  'Keybindings',
  'Shortcut browser',
  'Search shortcuts',
  'Search actions, IDs, keys, and contexts',
  'All contexts',
  'All groups',
  'Show bound and unbound',
  'Bound actions',
  'Unbound actions',
  'Search results',
  'No matching actions.',
  'Could not save bindings.',
  'Unavailable shortcuts',
  'Could not restore shortcuts used by: {actions}.',
  'Current shortcuts',
  'Default shortcuts',
  'No shortcut is assigned in this context.',
  'Unbound',
  'Origin',
  'Default',
  'Custom',
  'Record keys',
  'Add shortcut',
  'Unbind this action',
  'Reset this action',
  'Delete binding',
  'Type the shortcut. Backspace removes a key; Enter saves; Esc cancels.',
  'Edit expression',
  'Type a key sequence such as <Space>ff. Enter saves; Esc cancels.',
  'Save shortcut',
  'Overwrite existing shortcut',
  'Cancel',
  'Native shortcuts',
  'Read-only; Zotero or the operating system owns these keys.',
  'Enter a key sequence.',
  'Invalid key sequence.',
  'Conflicts with “{action}”.',
  'Shares a shortcut prefix with: {shortcuts}.',
  'Native key is reserved by Zotero or text editing.',
  'Prefix Guide',
  'Show valid continuations while a multi-key command prefix is pending.',
  'Show Prefix Guide',
  'Display delay (ms)',
  'Font size (px)',
  'Could not update Prefix Guide settings.',
] as const satisfies readonly SettingsMessage[];

/** Keeps just the open row's input; all other values come from saved preferences. */
export class SettingsKeybindings {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  readonly #labels: Readonly<Record<(typeof MESSAGES)[number], string>>;
  #edit: ShortcutEdit | null = null;
  #editError = '';
  #notice: KeybindingsPageModel['notice'] = null;
  #guideError = '';
  #disposed = false;

  constructor(preferences: PreferenceStore, language: SettingsLanguage, changed: () => void) {
    this.#preferences = preferences;
    this.#labels = Object.fromEntries(
      MESSAGES.map((message) => [message, settingsText(language, message)]),
    ) as Record<(typeof MESSAGES)[number], string>;
    this.#language = language;
    this.#changed = changed;
    for (const key of [
      KEY_GUIDE_ENABLED_PREFERENCE_KEY,
      KEY_GUIDE_DELAY_PREFERENCE_KEY,
      KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
    ]) {
      const cleanup = preferences.observe?.(key, () => {
        this.#guideError = '';
        this.#publish();
      });
      if (cleanup) this.#cleanups.push(cleanup);
    }
    const bindingsCleanup = preferences.observe?.(BINDINGS_PREFERENCE_KEY, () => {
      if (this.#edit && !currentTarget(bindingsFromPreferences(preferences), this.#edit))
        this.#edit = null;
      this.#notice = null;
      this.#publish();
    });
    if (bindingsCleanup) this.#cleanups.push(bindingsCleanup);
  }

  #publish(): void {
    if (!this.#disposed) this.#changed();
  }
  model(): KeybindingsPageModel {
    const language = this.#language;
    const bindings = bindingsFromPreferences(this.#preferences);
    const guide = keyGuideConfig(this.#preferences);
    return {
      labels: this.#labels,
      contexts: BINDING_CONTEXTS.map((value) => ({ value, label: contextLabel(value, language) })),
      groups: ACTION_GROUPS.map((value) => ({ value, label: groupLabel(value, language) })),
      catalog: shortcutCatalog(bindings, language),
      native: nativeShortcutCatalog(undefined, language),
      unavailable: Object.entries(bindings).flatMap(([key, action]) => {
        const parsed = parseBindingKey(key);
        return parsed && !actionsForBindingMode(parsed.mode).includes(action)
          ? [{ context: parsed.mode, previous: parsed.sequence, action }]
          : [];
      }),
      edit: this.#editModel(bindings),
      notice: this.#notice,
      guide: { ...guide, error: this.#guideError },
    };
  }

  #editModel(bindings: BindingMap): KeybindingsPageModel['edit'] {
    const edit = this.#edit;
    if (!edit) return null;
    const sequence = expression(edit);
    const check = inspectShortcut(bindings, edit, sequence);
    let error = this.#editError;
    let warning = '';
    let exact: ActionId | undefined;
    if ('problem' in check) {
      if (check.problem === 'native')
        error = this.#labels['Native key is reserved by Zotero or text editing.'];
      if (check.problem === 'malformed') error = this.#labels['Invalid key sequence.'];
    } else {
      const owner = check.exact;
      exact = owner;
      if (owner) {
        const conflict = this.#labels['Conflicts with “{action}”.'].replace(
          '{action}',
          () => ACTION_LABELS[owner][this.#language],
        );
        error = error ? `${conflict} ${error}` : conflict;
      }
      if (check.prefixes.length)
        warning = this.#labels['Shares a shortcut prefix with: {shortcuts}.'].replace(
          '{shortcuts}',
          () =>
            check.prefixes
              .map(
                ({ action, sequence }) => `${ACTION_LABELS[action][this.#language]} (${sequence})`,
              )
              .join(', '),
        );
    }
    return {
      context: edit.context,
      action: edit.action,
      previous: edit.previous,
      mode: edit.mode,
      sequence,
      error,
      warning,
      exact,
      canSave: !('problem' in check) && !exact,
    };
  }
  dispatch(command: KeybindingsPageCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    if (command.type === 'guide-enabled' || command.type === 'guide-number') {
      let key: string;
      let value: boolean | number;
      if (command.type === 'guide-enabled') {
        if (typeof command.value !== 'boolean') return;
        key = KEY_GUIDE_ENABLED_PREFERENCE_KEY;
        value = command.value;
      } else {
        if (
          (command.setting !== 'delayMs' && command.setting !== 'fontSizePx') ||
          typeof command.value !== 'number' ||
          !Number.isFinite(command.value)
        )
          return;
        key = KEY_GUIDE_NUMBER_SPECS[command.setting].key;
        value = normalizeKeyGuideNumber(command.setting, command.value);
      }
      try {
        this.#preferences.set(key, value);
        this.#guideError = '';
      } catch {
        this.#guideError = settingsText(this.#language, 'Could not update Prefix Guide settings.');
      }
      this.#publish();
      return;
    }
    const bindings = bindingsFromPreferences(this.#preferences);
    const edit = this.#edit;
    switch (command.type) {
      case 'record': {
        if (
          !actionsForBindingMode(command.context).includes(command.action) ||
          !currentTarget(bindings, command)
        )
          return;
        const { context, action, previous } = command;
        this.#edit = { context, action, previous, mode: 'recording', tokens: [] };
        this.#notice = null;
        break;
      }
      case 'record-key': {
        if (edit?.mode !== 'recording') return;
        const key = keyString(command.event);
        if (!key || !serializeBindingTokens([key])) return;
        this.#edit = { ...edit, tokens: [...edit.tokens, key] };
        break;
      }
      case 'pop-key':
        if (edit?.mode !== 'recording' || !edit.tokens.length) return;
        this.#edit = { ...edit, tokens: edit.tokens.slice(0, -1) };
        break;
      case 'toggle-expression': {
        if (!edit) return;
        const { context, action, previous } = edit;
        this.#edit =
          edit.mode === 'recording'
            ? {
                context,
                action,
                previous,
                mode: 'expression',
                value: expression(edit) || previous || '',
              }
            : {
                context,
                action,
                previous,
                mode: 'recording',
                tokens: bindingSequenceTokens(edit.value) ?? [],
              };
        break;
      }
      case 'expression':
        if (edit?.mode !== 'expression') return;
        this.#edit = { ...edit, value: command.value };
        break;
      case 'cancel-edit':
        if (!edit) return;
        this.#edit = null;
        break;
      case 'save-edit':
        if (!edit || !currentTarget(bindings, edit)) return;
        this.#saveEdit(bindings, edit, command.overwrite);
        this.#publish();
        return;
      case 'delete-row': {
        if (!currentTarget(bindings, command)) return;
        const next = { ...bindings };
        delete next[`${command.context}:${command.previous}`];
        this.#saveAction(next, command);
        return;
      }
      case 'unbind':
      case 'reset-action':
        if (!actionsForBindingMode(command.context).includes(command.action)) return;
        this.#updateAction(bindings, command);
        return;
    }
    this.#editError = '';
    this.#publish();
  }

  #saveEdit(bindings: BindingMap, edit: ShortcutEdit, overwrite: ActionId | undefined): void {
    const check = inspectShortcut(bindings, edit, expression(edit));
    if ('problem' in check) {
      if (check.problem === 'empty') this.#editError = this.#labels['Enter a key sequence.'];
      return;
    }
    if (check.exact !== overwrite) return;
    this.#edit = null;
    this.#editError = '';
    if (check.sequence === edit.previous) return;
    const next = { ...bindings };
    if (edit.previous !== null) delete next[`${edit.context}:${edit.previous}`];
    next[`${edit.context}:${check.sequence}`] = edit.action;
    try {
      this.#preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(next));
    } catch {
      this.#edit = edit;
      this.#editError = this.#labels['Could not save bindings.'];
    }
  }

  #updateAction(
    bindings: BindingMap,
    command: Extract<KeybindingsPageCommand, { type: 'reset-action' | 'unbind' }>,
  ): void {
    const { context, action } = command;
    const next = { ...bindings };
    const defaults =
      command.type === 'reset-action' ? shortcutsForAction(DEFAULT_BINDINGS, context, action) : [];
    const occupied = new Set<string>();
    const available = defaults.filter((key) => {
      const owner = bindings[`${context}:${key}`];
      if (!owner || owner === action) return true;
      occupied.add(ACTION_LABELS[owner][this.#language]);
      return false;
    });
    if (!defaults.length || available.length) {
      for (const key of shortcutsForAction(bindings, context, action))
        delete next[`${context}:${key}`];
      for (const key of available) next[`${context}:${key}`] = action;
    }
    this.#saveAction(
      next,
      command,
      occupied.size
        ? this.#labels['Could not restore shortcuts used by: {actions}.'].replace('{actions}', () =>
            [...occupied].join(', '),
          )
        : '',
    );
  }

  #saveAction(
    next: BindingMap,
    { context, action }: Pick<BindingEditTarget, 'context' | 'action'>,
    text = '',
  ): void {
    try {
      this.#preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(next));
    } catch {
      text = this.#labels['Could not save bindings.'];
    }
    this.#notice = text ? { context, action, text } : null;
    this.#publish();
  }
  dispose(): void {
    this.#disposed = true;
    this.#edit = null;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
