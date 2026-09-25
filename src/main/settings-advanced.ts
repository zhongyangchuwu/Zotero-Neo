import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  LANGUAGE_PREFERENCE_KEY,
  TAG_SEPARATOR_PREFERENCE_KEY,
  configuredNeoLanguage,
  tagSeparatorFromPreferences,
  type NeoLanguagePreference,
} from '../core/preferences';
import { settingsText, type SettingsLanguage } from './settings-i18n';
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
  readonly #uiLanguage: SettingsLanguage;
  readonly #cleanups: Array<() => void> = [];
  readonly #languageChoices: LanguageChoices;
  readonly #separator: SettingsTextInput;
  readonly #status: HTMLElement;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    language: SettingsLanguage = 'en',
  ) {
    this.#root = root;
    this.#preferences = preferences;
    this.#uiLanguage = language;
    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const title = doc.createElementNS(H, 'h2');
    title.textContent = settingsText(language, 'Advanced');
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const languageGroup = settingsGroup(
      doc,
      settingsText(language, 'Interface and command language'),
      settingsText(
        language,
        "Controls Neo Settings and localized command labels in Prefix Guide, Command Palette, and Keybindings. Follow Zotero uses the host locale.",
      ),
    );
    this.#languageChoices = settingsChoices<NeoLanguagePreference>(
      doc,
      [
        { value: '', label: settingsText(language, 'Follow Zotero') },
        { value: 'en', label: settingsText(language, 'English') },
        { value: 'zh-CN', label: settingsText(language, '中文') },
      ],
      configuredNeoLanguage(preferences),
      (value) => this.#save(LANGUAGE_PREFERENCE_KEY, value),
      this.#cleanups,
    );
    languageGroup.append(
      settingsControlRow(
        doc,
        settingsText(language, 'Language'),
        this.#languageChoices.element,
        settingsText(
          language,
          'Changes the Neo Settings interface and localized command labels immediately.',
        ),
      ),
    );

    const tagGroup = settingsGroup(
      doc,
      settingsText(language, 'Tag namespaces'),
      settingsText(
        language,
        'Neo can interpret ordinary Zotero tag strings as virtual paths inside tag pickers without changing stored tag data.',
      ),
    );
    this.#separator = settingsTextRow(
      doc,
      settingsText(language, 'Namespace separator'),
      tagSeparatorFromPreferences(preferences),
      (value) => {
        if (!this.#save(TAG_SEPARATOR_PREFERENCE_KEY, value)) return false;
        return tagSeparatorFromPreferences(preferences);
      },
      this.#cleanups,
      settingsText(
        language,
        "Default '/'. Leave empty for completely flat tag matching; existing Zotero tags are never rewritten.",
      ),
    );
    tagGroup.append(this.#separator.element);

    this.#status = settingsStatus(doc);
    root.append(title, languageGroup, tagGroup, this.#status);

    const separatorCleanup = preferences.observe?.(TAG_SEPARATOR_PREFERENCE_KEY, () =>
      this.#refresh(),
    );
    if (separatorCleanup) this.#cleanups.push(separatorCleanup);
  }

  #save(key: string, value: string): boolean {
    try {
      this.#preferences.set(key, value);
      this.#status.textContent = '';
      return true;
    } catch {
      this.#refresh(false);
      this.#status.textContent = settingsText(this.#uiLanguage, 'Could not update Advanced settings.');
      return false;
    }
  }

  #refresh(clearStatus = true): void {
    this.#languageChoices.select(configuredNeoLanguage(this.#preferences));
    this.#separator.set(tagSeparatorFromPreferences(this.#preferences));
    if (clearStatus) this.#status.textContent = '';
  }

  dispose(): void {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
