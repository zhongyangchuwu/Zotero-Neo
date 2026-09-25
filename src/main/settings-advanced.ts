import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  LANGUAGE_PREFERENCE_KEY,
  TAG_SEPARATOR_PREFERENCE_KEY,
  configuredNeoLanguage,
  tagSeparatorFromPreferences,
  type NeoLanguagePreference,
} from '../core/preferences';
import {
  settingsChoices,
  settingsControlRow,
  settingsGroup,
  settingsStatus,
  settingsTextRow,
  type SettingsTextInput,
} from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

interface LanguageChoices {
  readonly element: HTMLElement;
  select(value: NeoLanguagePreference): void;
}

/** Final low-frequency settings that do not belong to a surface-specific page. */
export class SettingsAdvanced {
  readonly #root: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #cleanups: Array<() => void> = [];
  readonly #language: LanguageChoices;
  readonly #separator: SettingsTextInput;
  readonly #status: HTMLElement;

  constructor(window: MainWindow, root: HTMLElement, preferences: PreferenceStore) {
    this.#root = root;
    this.#preferences = preferences;
    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const title = doc.createElementNS(H, 'h2');
    title.textContent = 'Advanced';
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const languageGroup = settingsGroup(
      doc,
      'Command language',
      "Controls Neo's localized command labels in Prefix Guide, Command Palette, and Keybindings. Follow Zotero uses the host locale.",
    );
    this.#language = settingsChoices<NeoLanguagePreference>(
      doc,
      [
        { value: '', label: 'Follow Zotero' },
        { value: 'en', label: 'English' },
        { value: 'zh-CN', label: '中文' },
      ],
      configuredNeoLanguage(preferences),
      (value) => this.#save(LANGUAGE_PREFERENCE_KEY, value),
      this.#cleanups,
    );
    languageGroup.append(
      settingsControlRow(
        doc,
        'Language',
        this.#language.element,
        'Changes command labels only; the Settings workspace itself remains English.',
      ),
    );

    const tagGroup = settingsGroup(
      doc,
      'Tag namespaces',
      'Neo can interpret ordinary Zotero tag strings as virtual paths inside tag pickers without changing stored tag data.',
    );
    this.#separator = settingsTextRow(
      doc,
      'Namespace separator',
      tagSeparatorFromPreferences(preferences),
      (value) => {
        if (!this.#save(TAG_SEPARATOR_PREFERENCE_KEY, value)) return false;
        return tagSeparatorFromPreferences(preferences);
      },
      this.#cleanups,
      "Default '/'. Leave empty for completely flat tag matching; existing Zotero tags are never rewritten.",
    );
    tagGroup.append(this.#separator.element);

    this.#status = settingsStatus(doc);
    root.append(title, languageGroup, tagGroup, this.#status);

    for (const key of [LANGUAGE_PREFERENCE_KEY, TAG_SEPARATOR_PREFERENCE_KEY]) {
      const cleanup = preferences.observe?.(key, () => this.#refresh());
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  #save(key: string, value: string): boolean {
    try {
      this.#preferences.set(key, value);
      this.#status.textContent = '';
      return true;
    } catch {
      this.#refresh(false);
      this.#status.textContent = 'Could not update Advanced settings.';
      return false;
    }
  }

  #refresh(clearStatus = true): void {
    this.#language.select(configuredNeoLanguage(this.#preferences));
    this.#separator.set(tagSeparatorFromPreferences(this.#preferences));
    if (clearStatus) this.#status.textContent = '';
  }

  dispose(): void {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
