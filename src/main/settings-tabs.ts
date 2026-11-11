import { CleanupScope } from '../core/cleanup';
import type { PreferenceStore } from '../core/preference-store';
import { t } from '../i18n';
import { normalizeTabRailWidth, TAB_RAIL_WIDTH } from '../toolkit/main/tab-enhancements-types';
import {
  TAB_ENHANCEMENT_PREFERENCES,
  tabRailOptions,
  tabTitleFormat,
} from '../modules/tab-enhancements/config';
import { validateTabTitleFormat } from '../modules/tab-enhancements/title-format';
import type { SettingsFormCommand, SettingsFormGroup } from './settings-form-model';
import { settingsText, type SettingsLanguage } from './settings-i18n';

/** Display preferences apply live; resetting them deliberately leaves saved reading groups alone. */
export class SettingsTabs {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups = new CleanupScope();
  #status = '';
  #formatDraft: string | null = null;

  constructor(preferences: PreferenceStore, language: SettingsLanguage, changed: () => void) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;
    try {
      for (const key of Object.values(TAB_ENHANCEMENT_PREFERENCES)) {
        const cleanup = preferences.observe?.(key, () => {
          if (key === TAB_ENHANCEMENT_PREFERENCES.titleFormat) this.#formatDraft = null;
          this.#changed();
        });
        if (cleanup) this.#cleanups.add(cleanup);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get status(): string {
    return this.#status;
  }

  group(): SettingsFormGroup {
    const language = this.#language;
    const options = tabRailOptions(this.#preferences);
    return {
      id: 'tab-display',
      title: settingsText(language, 'Tab display'),
      description: settingsText(
        language,
        'Display changes apply immediately when Tab Enhancements is active. The module request requires restarting Zotero.',
      ),
      fields: [
        {
          kind: 'choice',
          id: 'tabs.side',
          label: settingsText(language, 'Sidebar position'),
          value: options.side,
          options: [
            { value: 'left', label: settingsText(language, 'Far left') },
            { value: 'right', label: settingsText(language, 'Far right') },
          ],
        },
        {
          kind: 'boolean',
          id: 'tabs.collapsed',
          label: t('tabs.collapse', language),
          value: options.collapsed,
        },
        {
          kind: 'text',
          id: 'tabs.titleFormat',
          label: settingsText(language, 'Title format'),
          value: this.#formatDraft ?? tabTitleFormat(this.#preferences),
          commit: 'change',
          invalid: this.#formatDraft !== null,
          description: settingsText(
            language,
            'Use {title}, {citekey}, {author}, {year} or {filename}. Escape braces as {{ and }}. Missing citation keys fall back to the native title.',
          ),
        },
        {
          kind: 'number',
          id: 'tabs.width',
          label: settingsText(language, 'Sidebar width (px)'),
          value: options.width,
          minimum: TAB_RAIL_WIDTH.min,
          maximum: TAB_RAIL_WIDTH.max,
          step: 8,
          disabled: options.collapsed,
        },
        {
          kind: 'action',
          id: 'tabs.restore',
          label: settingsText(language, 'Restore tab display defaults'),
          description: settingsText(
            language,
            'Saved groups are kept when resetting display settings.',
          ),
        },
      ],
    };
  }

  dispatch(command: SettingsFormCommand): boolean {
    if (command.type === 'action') {
      if (command.id !== 'tabs.restore') return false;
      try {
        for (const key of Object.values(TAB_ENHANCEMENT_PREFERENCES)) {
          if (this.#preferences.has(key)) this.#preferences.clear(key);
        }
        this.#formatDraft = null;
        this.#status = '';
      } catch {
        this.#status = settingsText(this.#language, 'Could not update tab display settings.');
      }
      this.#changed();
      return true;
    }
    let key: string;
    let value: string | number | boolean;
    switch (command.id) {
      case 'tabs.side':
        if (command.value !== 'left' && command.value !== 'right') return true;
        key = TAB_ENHANCEMENT_PREFERENCES.side;
        value = command.value;
        break;
      case 'tabs.collapsed':
        if (typeof command.value !== 'boolean') return true;
        key = TAB_ENHANCEMENT_PREFERENCES.collapsed;
        value = command.value;
        break;
      case 'tabs.width':
        if (
          typeof command.value !== 'number' ||
          !Number.isFinite(command.value) ||
          tabRailOptions(this.#preferences).collapsed
        )
          return true;
        key = TAB_ENHANCEMENT_PREFERENCES.width;
        value = normalizeTabRailWidth(command.value);
        break;
      case 'tabs.titleFormat':
        if (typeof command.value !== 'string') return true;
        if (validateTabTitleFormat(command.value)) {
          this.#formatDraft = command.value;
          this.#status = settingsText(this.#language, 'Unknown or unbalanced title placeholders.');
          this.#changed();
          return true;
        }
        key = TAB_ENHANCEMENT_PREFERENCES.titleFormat;
        value = command.value;
        break;
      default:
        return false;
    }
    try {
      this.#preferences.set(key, value);
      if (command.id === 'tabs.titleFormat') this.#formatDraft = null;
      this.#status = '';
    } catch {
      if (command.id === 'tabs.titleFormat') this.#formatDraft = null;
      this.#status = settingsText(this.#language, 'Could not update tab display settings.');
    }
    this.#changed();
    return true;
  }

  dispose(): void {
    this.#cleanups.dispose();
  }
}
