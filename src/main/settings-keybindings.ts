import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  BINDINGS_PREFERENCE_KEY,
  KEY_GUIDE_DELAY_PREFERENCE_KEY,
  KEY_GUIDE_ENABLED_PREFERENCE_KEY,
  KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
  KEY_GUIDE_NUMBER_SPECS,
  LANGUAGE_PREFERENCE_KEY,
  bindingsFromPreferences,
  keyGuideConfig,
  neoCommandLanguage,
  normalizeKeyGuideNumber,
} from '../core/preferences';
import {
  addActionBinding,
  createBindingEditor,
  deriveBindingEditor,
  resetAction,
  transition,
  unbindAction,
  type BindingEditorLanguage,
  type BindingEditorState,
} from '../input/binding-editor';
import { BINDING_CONTEXTS, encodeBindingOverrides } from '../input/bindings';
import {
  ACTION_GROUPS,
  contextLabel,
  groupLabel,
  nativeShortcutCatalog,
} from '../input/shortcut-catalog';
import { keyString } from '../input/keys';
import { serializeBindingTokens } from '../input/key-sequence';
import { settingsText, type SettingsLanguage, type SettingsMessage } from './settings-i18n';
import type { KeybindingsPageCommand, KeybindingsPageModel } from './settings-keybindings-model';

export interface SettingsKeybindingsState {
  editor: BindingEditorState | null;
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
  'Apply bindings',
  'Fix invalid rows before applying.',
  'Prefix conflicts detected; Apply is allowed.',
  'Unsaved changes',
  'Saved.',
  'Could not save bindings.',
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
  'Recording keys — press keys in order, then choose Done',
  'Shortcut recorded; choose Done to keep it.',
  'Shortcut recording cancelled.',
  'Done',
  'Cancel',
  'Native shortcuts',
  'Read-only; Zotero or the operating system owns these keys.',
  'Enter a key sequence and action.',
  'Invalid mode, key sequence, or action.',
  'Action is not supported in this mode.',
  'Duplicate mode and key sequence.',
  'Strict prefix of another sequence.',
  'Native key is reserved by Zotero or text editing.',
  'Prefix Guide',
  'Show valid continuations while a multi-key command prefix is pending.',
  'Show Prefix Guide',
  'Display delay (ms)',
  'Font size (px)',
  'Could not update Prefix Guide settings.',
] as const;

/** Owns Prefix Guide configuration and one explicit-Apply keybinding draft. */
export class SettingsKeybindings {
  readonly #preferences: PreferenceStore;
  readonly #state: SettingsKeybindingsState;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  #recording: KeybindingsPageModel['recording'] = null;
  #status = '';
  #guideError = '';
  #disposed = false;

  constructor(
    _window: MainWindow,
    preferences: PreferenceStore,
    state: SettingsKeybindingsState,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#preferences = preferences;
    this.#state = state;
    this.#language = language;
    this.#changed = changed;
    this.#prepareDraft();
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
      const draft = this.#state.editor;
      if (draft && deriveBindingEditor(draft).dirty) return;
      this.#state.editor = createBindingEditor(
        bindingsFromPreferences(preferences),
        this.#editorLanguage(),
      );
      this.#publish();
    });
    if (bindingsCleanup) this.#cleanups.push(bindingsCleanup);
    const languageCleanup = preferences.observe?.(LANGUAGE_PREFERENCE_KEY, () => {
      const editor = this.#state.editor;
      if (!editor) return;
      const language = this.#editorLanguage();
      if (editor.language !== language) {
        this.#state.editor = transition(editor, { type: 'set-language', language });
        this.#publish();
      }
    });
    if (languageCleanup) this.#cleanups.push(languageCleanup);
  }

  #editorLanguage(): BindingEditorLanguage {
    return neoCommandLanguage(
      this.#preferences,
      typeof Zotero === 'undefined' ? '' : (Zotero.locale ?? ''),
    );
  }
  #prepareDraft(): void {
    const language = this.#editorLanguage();
    const editor = this.#state.editor;
    this.#state.editor =
      !editor || !deriveBindingEditor(editor).dirty
        ? createBindingEditor(bindingsFromPreferences(this.#preferences), language)
        : editor.language === language
          ? editor
          : transition(editor, { type: 'set-language', language });
  }
  #publish(): void {
    if (!this.#disposed) this.#changed();
  }
  model(): KeybindingsPageModel {
    const editor = this.#state.editor!;
    const derived = deriveBindingEditor(editor);
    const labels: Record<string, string> = {};
    for (const message of MESSAGES)
      labels[message] = settingsText(editor.language, message as SettingsMessage);
    const guide = keyGuideConfig(this.#preferences);
    return {
      labels,
      contexts: BINDING_CONTEXTS.map((value) => ({
        value,
        label: contextLabel(value, editor.language),
      })),
      groups: ACTION_GROUPS.map((value) => ({ value, label: groupLabel(value, editor.language) })),
      catalog: derived.catalog,
      native: nativeShortcutCatalog(undefined, editor.language),
      rows: editor.rows,
      errors: derived.validation.errors,
      warnings: derived.validation.warnings,
      dirty: derived.dirty,
      canApply: derived.dirty && derived.validation.valid && !!derived.effectiveMap,
      saveOutcome: editor.saveOutcome,
      recording: this.#recording,
      status: this.#status,
      guide: { ...guide, error: this.#guideError },
    };
  }
  dispatch(command: KeybindingsPageCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    let editor = this.#state.editor;
    if (!editor) return;
    const derived = deriveBindingEditor(editor);
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
    if (command.type === 'record') {
      if (
        !derived.catalog.some(
          (entry) => entry.context === command.context && entry.action === command.action,
        )
      )
        return;
      if (
        command.rowId !== null &&
        !editor.rows.some(
          (row) =>
            row.id === command.rowId &&
            row.mode === command.context &&
            row.action === command.action,
        )
      )
        return;
      this.#recording = {
        context: command.context,
        action: command.action,
        rowId: command.rowId,
        tokens: [],
        sequence: '',
      };
      this.#status = '';
    } else if (command.type === 'record-key') {
      if (!this.#recording || !command.event || typeof command.event.key !== 'string') return;
      const key = keyString(command.event);
      if (!key) return;
      const tokens = [...this.#recording.tokens, key];
      const sequence = serializeBindingTokens(tokens);
      if (!sequence) return;
      this.#recording = { ...this.#recording, tokens, sequence };
    } else if (command.type === 'cancel-recording') {
      if (!this.#recording) return;
      this.#recording = null;
      this.#status = settingsText(editor.language, 'Shortcut recording cancelled.');
    } else if (command.type === 'finish-recording') {
      const recording = this.#recording;
      if (!recording?.sequence) return;
      if (
        !derived.catalog.some(
          (entry) => entry.context === recording.context && entry.action === recording.action,
        )
      )
        return;
      if (
        recording.rowId !== null &&
        !editor.rows.some(
          (row) =>
            row.id === recording.rowId &&
            row.mode === recording.context &&
            row.action === recording.action,
        )
      )
        return;
      editor =
        recording.rowId === null
          ? addActionBinding(editor, recording.context, recording.action, recording.sequence)
          : transition(editor, {
              type: 'update-row',
              rowId: recording.rowId,
              patch: { key: recording.sequence },
            });
      this.#recording = null;
      this.#status = '';
    } else if (command.type === 'apply') {
      if (!derived.dirty || !derived.validation.valid || !derived.effectiveMap) return;
      try {
        this.#preferences.set(
          BINDINGS_PREFERENCE_KEY,
          encodeBindingOverrides(derived.effectiveMap),
        );
        editor = transition(editor, { type: 'save-success', bindings: derived.effectiveMap });
      } catch {
        editor = transition(editor, { type: 'save-failure' });
      }
      this.#recording = null;
      this.#status = '';
    } else if (command.type === 'delete-row') {
      if (!editor.rows.some((row) => row.id === command.rowId)) return;
      editor = transition(editor, { type: 'delete-row', rowId: command.rowId });
      this.#recording = null;
      this.#status = '';
    } else if (command.type === 'unbind' || command.type === 'reset-action') {
      if (
        !derived.catalog.some(
          (entry) => entry.context === command.context && entry.action === command.action,
        )
      )
        return;
      editor =
        command.type === 'unbind'
          ? unbindAction(editor, command.context, command.action)
          : resetAction(editor, command.context, command.action);
      this.#recording = null;
      this.#status = '';
    } else return;
    this.#state.editor = editor;
    this.#publish();
  }
  dispose(): void {
    this.#disposed = true;
    this.#recording = null;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
