import type { PreferenceStore } from '../core/preference-store';
import { normalizeTabRailWidth, TAB_RAIL_WIDTH } from '../toolkit/main/tab-enhancements-types';
import {
  TAB_ENHANCEMENT_PREFERENCES,
  TAB_SIDEBAR_DEFAULT_FORMAT,
  tabRailOptions,
  tabTitleFormat,
} from '../modules/tab-enhancements/config';
import { validateTabTitleFormat } from '../modules/tab-enhancements/title-format';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import {
  settingsButton,
  settingsChoices,
  settingsControlRow,
  settingsGroup,
  settingsNumberRow,
  settingsStatus,
  settingsTextRow,
  type SettingsNumberInput,
  type SettingsTextInput,
} from './settings-ui';

/** Display preferences apply live; resetting them deliberately leaves saved reading groups alone. */
export class SettingsTabs {
  readonly #root: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #cleanups: Array<() => void> = [];
  readonly #side: {
    element: HTMLElement;
    select(value: 'left' | 'right'): void;
  };
  readonly #format: SettingsTextInput;
  readonly #width: SettingsNumberInput;
  readonly #status: HTMLElement;

  constructor(
    doc: Document,
    root: HTMLElement,
    preferences: PreferenceStore,
    language: SettingsLanguage,
  ) {
    this.#root = root;
    this.#preferences = preferences;
    this.#language = language;
    this.#status = settingsStatus(doc);
    const options = tabRailOptions(preferences);
    const group = settingsGroup(
      doc,
      settingsText(language, 'Tab display'),
      settingsText(
        language,
        'Display changes apply immediately when Tab Enhancements is active. The module request requires restarting Zotero.',
      ),
    );
    this.#side = settingsChoices<'left' | 'right'>(
      doc,
      [
        { value: 'left', label: settingsText(language, 'Far left') },
        { value: 'right', label: settingsText(language, 'Far right') },
      ],
      options.side,
      (value) => this.#save(TAB_ENHANCEMENT_PREFERENCES.side, value),
      this.#cleanups,
    );
    group.append(
      settingsControlRow(doc, settingsText(language, 'Sidebar position'), this.#side.element),
    );
    this.#format = settingsTextRow(
      doc,
      settingsText(language, 'Title format'),
      tabTitleFormat(preferences),
      (value) => {
        if (validateTabTitleFormat(value)) {
          this.#status.textContent = settingsText(
            language,
            'Unknown or unbalanced title placeholders.',
          );
          return false;
        }
        return this.#save(TAB_ENHANCEMENT_PREFERENCES.titleFormat, value) ? value : false;
      },
      this.#cleanups,
      settingsText(
        language,
        'Use {title}, {citekey}, {author}, {year} or {filename}. Escape braces as {{ and }}. Missing citation keys fall back to the native title.',
      ),
    );
    group.append(this.#format.element);
    this.#width = settingsNumberRow(
      doc,
      settingsText(language, 'Sidebar width (px)'),
      options.width,
      { minimum: TAB_RAIL_WIDTH.min, maximum: TAB_RAIL_WIDTH.max, step: 8 },
      (value) => {
        if (!Number.isFinite(value)) return false;
        const next = normalizeTabRailWidth(value);
        return this.#save(TAB_ENHANCEMENT_PREFERENCES.width, next) ? next : false;
      },
      this.#cleanups,
    );
    group.append(this.#width.element);
    group.append(
      settingsButton(
        doc,
        settingsText(language, 'Restore tab display defaults'),
        () => {
          try {
            for (const key of Object.values(TAB_ENHANCEMENT_PREFERENCES)) {
              if (preferences.has(key)) preferences.clear(key);
            }
            this.#refresh();
          } catch {
            this.#failed();
          }
        },
        this.#cleanups,
      ),
    );
    const help = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
    help.textContent = settingsText(
      language,
      'Saved groups are kept when resetting display settings.',
    );
    group.append(help, this.#status);
    root.append(group);
    for (const key of Object.values(TAB_ENHANCEMENT_PREFERENCES)) {
      const cleanup = preferences.observe?.(key, () => this.#refresh());
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  #save(key: string, value: string | number): boolean {
    try {
      this.#preferences.set(key, value);
      this.#status.textContent = '';
      return true;
    } catch {
      this.#failed();
      return false;
    }
  }

  #failed(): void {
    this.#status.textContent = settingsText(
      this.#language,
      'Could not update tab display settings.',
    );
  }

  #refresh(): void {
    const options = tabRailOptions(this.#preferences);
    this.#side.select(options.side);
    this.#width.set(options.width);
    this.#format.set(tabTitleFormat(this.#preferences) || TAB_SIDEBAR_DEFAULT_FORMAT);
    this.#status.textContent = '';
  }

  dispose(): void {
    for (let i = this.#cleanups.length - 1; i >= 0; i -= 1) {
      try {
        this.#cleanups[i]?.();
      } catch {
        /* The Settings owner still releases remaining fields. */
      }
    }
    this.#cleanups.length = 0;
    this.#root.replaceChildren();
  }
}
