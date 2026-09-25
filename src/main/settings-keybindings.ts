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
  type KeyGuideNumberSetting,
} from '../core/preferences';
import {
  createBindingEditor,
  deriveBindingEditor,
  transition,
  type BindingEditorLanguage,
  type BindingEditorState,
} from '../input/binding-editor';
import { encodeBindingOverrides } from '../input/bindings';
import { THEME_VARS } from '../ui/theme';
import { mountBindingEditor, type MountedBindingEditor } from './settings-keybindings-view';
import {
  settingsButtonElement,
  settingsGroup,
  settingsNumberRow,
  settingsStatus,
  settingsToggleRow,
  type SettingsNumberInput,
  type SettingsToggle,
} from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';
const EDITOR_TEXT: Readonly<Record<string, string>> = {
  'zv.bindings.mode': 'Mode',
  'zv.bindings.key': 'Key sequence',
  'zv.bindings.action': 'Action',
  'zv.bindings.status.dirty': 'Unsaved changes',
  'zv.bindings.status.invalid': 'Fix invalid rows before applying.',
  'zv.bindings.status.warning': 'Prefix conflicts detected; Apply is allowed.',
  'zv.bindings.error.empty': 'Enter a key sequence and action.',
  'zv.bindings.error.malformed': 'Invalid mode, key sequence, or action.',
  'zv.bindings.error.incompatible': 'Action is not supported in this mode.',
  'zv.bindings.error.duplicate': 'Duplicate mode and key sequence.',
  'zv.bindings.warning.prefix': 'Strict prefix of another sequence.',
  'zv.status.saved': 'Saved.',
  'zv.status.saveFailed': 'Could not save bindings.',
};

export interface SettingsKeybindingsState {
  editor: BindingEditorState | null;
}

/** Owns Prefix Guide configuration and one explicit-Apply keybinding draft. */
export class SettingsKeybindings {
  readonly #root: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #state: SettingsKeybindingsState;
  readonly #cleanups: Array<() => void> = [];
  readonly #guideToggle: SettingsToggle;
  readonly #guideNumbers: Record<KeyGuideNumberSetting, SettingsNumberInput>;
  readonly #guideStatus: HTMLElement;
  #bindingView: MountedBindingEditor | null = null;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    state: SettingsKeybindingsState = { editor: null },
  ) {
    this.#root = root;
    this.#preferences = preferences;
    this.#state = state;
    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const style = doc.createElementNS(H, 'style');
    style.textContent = `
      #zv-settings-keybindings-table { width:100%; border-collapse:collapse; font-size:0.9em; color:${THEME_VARS.text}; }
      #zv-settings-keybindings-table th { position:sticky; top:0; z-index:2; padding:7px 9px; text-align:left; background:${THEME_VARS.elevated}; border-bottom:1px solid ${THEME_VARS.border}; }
      #zv-settings-keybindings-table td { padding:5px 7px; vertical-align:top; border-bottom:1px solid ${THEME_VARS.border}; }
      #zv-settings-keybindings-table .zv-binding-mode-cell { width:11em; }
      #zv-settings-keybindings-table .zv-binding-key-cell { width:10em; }
      #zv-settings-keybindings-table .zv-binding-delete-cell { width:3em; text-align:center; }
      #zv-settings-keybindings-table .zv-binding-action { position:relative; display:flex; min-width:0; flex-direction:column; }
      #zv-settings-keybindings-table .zv-binding-action-results[hidden] { display:none; }
      #zv-settings-keybindings-table .zv-binding-action-results { position:relative; z-index:3; width:100%; max-height:180px; margin-top:2px; box-shadow:0 6px 18px ${THEME_VARS.shadow}; }
      #zv-settings-keybindings-table tr.zv-binding-row-error { box-shadow:inset 4px 0 ${THEME_VARS.error}; }
      #zv-settings-keybindings-table tr.zv-binding-row-warning { box-shadow:inset 4px 0 ${THEME_VARS.warning}; }
      #zv-settings-keybindings-table .zv-binding-delete { min-height:2.1em; padding:0.2em 0.55em; }
      #zv-bindings-validation-status.zv-binding-status-invalid,
      #zv-save-status.zv-binding-save-save-failed { color:${THEME_VARS.error}; }
      #zv-bindings-validation-status.zv-binding-status-warning,
      #zv-bindings-validation-status.zv-binding-status-dirty { color:${THEME_VARS.warning}; }
      #zv-save-status.zv-binding-save-saved { color:${THEME_VARS.success}; }
    `;

    const title = doc.createElementNS(H, 'h2');
    title.textContent = 'Keybindings';
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const guide = settingsGroup(
      doc,
      'Prefix Guide',
      'Show valid continuations while a multi-key command prefix is pending.',
    );
    const config = keyGuideConfig(preferences);
    this.#guideToggle = settingsToggleRow(
      doc,
      'Show Prefix Guide',
      config.enabled,
      (enabled) => this.#saveGuide(KEY_GUIDE_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
    );
    this.#guideNumbers = {
      delayMs: settingsNumberRow(
        doc,
        'Display delay (ms)',
        config.delayMs,
        {
          minimum: KEY_GUIDE_NUMBER_SPECS.delayMs.minimum,
          maximum: KEY_GUIDE_NUMBER_SPECS.delayMs.maximum,
          step: 25,
        },
        (value) => this.#saveGuideNumber('delayMs', value),
        this.#cleanups,
      ),
      fontSizePx: settingsNumberRow(
        doc,
        'Font size (px)',
        config.fontSizePx,
        {
          minimum: KEY_GUIDE_NUMBER_SPECS.fontSizePx.minimum,
          maximum: KEY_GUIDE_NUMBER_SPECS.fontSizePx.maximum,
          step: 1,
        },
        (value) => this.#saveGuideNumber('fontSizePx', value),
        this.#cleanups,
      ),
    };
    this.#guideStatus = settingsStatus(doc);
    guide.append(
      this.#guideToggle.element,
      this.#guideNumbers.delayMs.element,
      this.#guideNumbers.fontSizePx.element,
      this.#guideStatus,
    );

    const bindings = settingsGroup(
      doc,
      'Bindings',
      'Edit mode + key sequence + action rows, then Apply. Named keys use <Enter>, <Esc>, <F1>, <Space>; chords use forms such as <C-d>.',
    );
    const toolbar = doc.createElementNS(H, 'div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:0.55em;margin:0 0 0.65em';
    const add = settingsButtonElement(doc, '+ Add binding');
    add.id = 'zv-add-binding';
    const reset = settingsButtonElement(doc, 'Reset to defaults');
    reset.id = 'zv-reset-bindings';
    toolbar.append(add, reset);

    const tableWrap = doc.createElementNS(H, 'div');
    tableWrap.id = 'zv-bindings-table-wrap';
    tableWrap.style.cssText = `max-height:420px;overflow:auto;border:1px solid ${THEME_VARS.border};border-radius:5px`;
    const table = doc.createElementNS(H, 'table');
    table.id = 'zv-settings-keybindings-table';
    const head = doc.createElementNS(H, 'thead');
    const headRow = doc.createElementNS(H, 'tr');
    for (const [text, width] of [
      ['Mode', '11em'],
      ['Key sequence', '10em'],
      ['Action', 'auto'],
      ['', '3em'],
    ] as const) {
      const cell = doc.createElementNS(H, 'th');
      cell.textContent = text;
      cell.style.width = width;
      headRow.append(cell);
    }
    head.append(headRow);
    const body = doc.createElementNS(H, 'tbody');
    body.id = 'zv-bindings-body';
    table.append(head, body);
    tableWrap.append(table);

    const footer = doc.createElementNS(H, 'div');
    footer.style.cssText =
      'display:flex;align-items:center;justify-content:flex-end;gap:0.75em;margin-top:0.65em';
    const validation = doc.createElementNS(H, 'span');
    validation.id = 'zv-bindings-validation-status';
    validation.setAttribute('role', 'status');
    const save = settingsButtonElement(doc, 'Apply bindings');
    save.id = 'zv-save';
    const saveStatus = doc.createElementNS(H, 'span');
    saveStatus.id = 'zv-save-status';
    saveStatus.setAttribute('role', 'status');
    saveStatus.setAttribute('aria-live', 'polite');
    footer.append(validation, save, saveStatus);
    bindings.append(toolbar, tableWrap, footer);

    root.append(style, title, guide, bindings);
    this.#prepareDraft();
    this.#mountEditor();

    for (const key of [
      KEY_GUIDE_ENABLED_PREFERENCE_KEY,
      KEY_GUIDE_DELAY_PREFERENCE_KEY,
      KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
    ]) {
      const cleanup = preferences.observe?.(key, () => this.#refreshGuide(true));
      if (cleanup) this.#cleanups.push(cleanup);
    }
    const bindingsCleanup = preferences.observe?.(BINDINGS_PREFERENCE_KEY, () => {
      const draft = this.#state.editor;
      if (draft && deriveBindingEditor(draft).dirty) return;
      this.#state.editor = createBindingEditor(
        bindingsFromPreferences(preferences),
        this.#editorLanguage(),
      );
      this.#mountEditor();
    });
    if (bindingsCleanup) this.#cleanups.push(bindingsCleanup);
    const languageCleanup = preferences.observe?.(LANGUAGE_PREFERENCE_KEY, () =>
      this.#refreshLanguage(),
    );
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
    const existing = this.#state.editor;
    if (!existing || !deriveBindingEditor(existing).dirty) {
      this.#state.editor = createBindingEditor(
        bindingsFromPreferences(this.#preferences),
        language,
      );
      return;
    }
    if (existing.language !== language) {
      this.#state.editor = transition(existing, {
        type: 'set-language',
        language,
      });
    }
  }

  #refreshLanguage(): void {
    const state = this.#state.editor;
    if (!state) return;
    const language = this.#editorLanguage();
    if (state.language === language) return;
    this.#state.editor = transition(state, { type: 'set-language', language });
    this.#mountEditor();
  }

  #mountEditor(): void {
    this.#bindingView?.dispose();
    const state = this.#state.editor;
    if (!state) return;
    this.#bindingView = mountBindingEditor({
      document: this.#root.ownerDocument,
      root: this.#root,
      state,
      language: this.#editorLanguage(),
      localize: (key) => EDITOR_TEXT[key] ?? key,
      onSave: (bindings) => {
        this.#preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(bindings));
      },
      onStateChange: (next) => {
        this.#state.editor = next;
      },
    });
  }

  #saveGuide(key: string, value: boolean | number | string): boolean {
    try {
      this.#preferences.set(key, value);
      this.#refreshGuide(true);
      return true;
    } catch {
      this.#refreshGuide();
      this.#guideStatus.textContent = 'Could not update Prefix Guide settings.';
      return false;
    }
  }

  #saveGuideNumber(setting: KeyGuideNumberSetting, raw: number): number | false {
    const next = normalizeKeyGuideNumber(setting, raw);
    if (!this.#saveGuide(KEY_GUIDE_NUMBER_SPECS[setting].key, next)) return false;
    return keyGuideConfig(this.#preferences)[setting];
  }

  #refreshGuide(clearStatus = false): void {
    const config = keyGuideConfig(this.#preferences);
    this.#guideToggle.set(config.enabled);
    this.#guideNumbers.delayMs.set(config.delayMs);
    this.#guideNumbers.fontSizePx.set(config.fontSizePx);
    if (clearStatus) this.#guideStatus.textContent = '';
  }

  dispose(): void {
    this.#bindingView?.dispose();
    this.#bindingView = null;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
