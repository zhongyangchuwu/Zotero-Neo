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
import { mountShortcutBrowser, type MountedShortcutBrowser } from './settings-keybindings-view';
import {
  settingsText,
  settingsToggleLabels,
  type SettingsLanguage,
  type SettingsMessage,
} from './settings-i18n';
import {
  settingsGroup,
  settingsNumberRow,
  settingsStatus,
  settingsToggleRow,
  type SettingsNumberInput,
  type SettingsToggle,
} from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

export interface SettingsKeybindingsState {
  editor: BindingEditorState | null;
}

/** Owns Prefix Guide configuration and one explicit-Apply keybinding draft. */
export class SettingsKeybindings {
  readonly #root: HTMLElement;
  readonly #browserRoot: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #state: SettingsKeybindingsState;
  readonly #cleanups: Array<() => void> = [];
  readonly #guideToggle: SettingsToggle;
  readonly #guideNumbers: Record<KeyGuideNumberSetting, SettingsNumberInput>;
  readonly #guideStatus: HTMLElement;
  #browserView: MountedShortcutBrowser | null = null;
  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    state: SettingsKeybindingsState = { editor: null },
    language: SettingsLanguage = 'en',
  ) {
    this.#root = root;
    this.#preferences = preferences;
    this.#state = state;
    this.#language = language;
    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const title = doc.createElementNS(H, 'h2');
    title.textContent = settingsText(language, 'Keybindings');
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const browser = settingsGroup(doc, settingsText(language, 'Shortcut browser'));
    this.#browserRoot = doc.createElementNS(H, 'div');
    browser.append(this.#browserRoot);

    const guide = doc.createElementNS(H, 'details');
    guide.style.cssText = 'margin:0 0 1.5em';
    const guideSummary = doc.createElementNS(H, 'summary');
    guideSummary.textContent = settingsText(language, 'Prefix Guide');
    guideSummary.style.cssText = 'cursor:pointer;font-weight:600';
    const guideDescription = doc.createElementNS(H, 'p');
    guideDescription.textContent = settingsText(
      language,
      'Show valid continuations while a multi-key command prefix is pending.',
    );
    guideDescription.style.cssText = `margin:0.5em 0;color:${THEME_VARS.muted}`;

    const config = keyGuideConfig(preferences);
    this.#guideToggle = settingsToggleRow(
      doc,
      settingsText(language, 'Show Prefix Guide'),
      config.enabled,
      (enabled) => this.#saveGuide(KEY_GUIDE_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
      undefined,
      settingsToggleLabels(language),
    );
    this.#guideNumbers = {
      delayMs: settingsNumberRow(
        doc,
        settingsText(language, 'Display delay (ms)'),
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
        settingsText(language, 'Font size (px)'),
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
      guideSummary,
      guideDescription,
      this.#guideToggle.element,
      this.#guideNumbers.delayMs.element,
      this.#guideNumbers.fontSizePx.element,
      this.#guideStatus,
    );

    root.append(title, browser, guide);
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
    this.#browserView?.dispose();
    const state = this.#state.editor;
    if (!state) return;
    this.#browserView = mountShortcutBrowser({
      document: this.#root.ownerDocument,
      root: this.#browserRoot,
      state,
      localize: (key, editorLanguage) => settingsText(editorLanguage, key as SettingsMessage),
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
      this.#guideStatus.textContent = settingsText(
        this.#language,
        'Could not update Prefix Guide settings.',
      );
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
    this.#browserView?.dispose();
    this.#browserView = null;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
