import type { MainWindow } from '../core/contracts';
import {
  MAIN_STARTUP_FOCUS_PREFERENCE_KEY,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY,
  isMainStartupFocus,
  mainStartupFocus,
  type MainStartupFocus,
  pickerMouseEnabled,
} from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import type { SettingsFormCommand, SettingsFormModel } from './settings-form-model';

const PICKER_MOUSE_FIELD_ID = 'pickerMouseEnabled';
const MAIN_STARTUP_FOCUS_FIELD_ID = 'mainStartupFocus';

type InteractionValues = {
  [MAIN_STARTUP_FOCUS_PREFERENCE_KEY]: MainStartupFocus;
  [PICKER_MOUSE_ENABLED_PREFERENCE_KEY]: boolean;
};

/** Owns the Interaction preferences for one open Settings page. */
export class SettingsInteraction {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  #status: SettingsFormModel['status'];
  #disposed = false;

  constructor(
    _window: MainWindow,
    preferences: PreferenceStore,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;

    for (const key of [MAIN_STARTUP_FOCUS_PREFERENCE_KEY, PICKER_MOUSE_ENABLED_PREFERENCE_KEY]) {
      const cleanup = preferences.observe?.(key, () => {
        if (this.#disposed) return;
        this.#status = undefined;
        this.#changed();
      });
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  model(): SettingsFormModel {
    const language = this.#language;
    return {
      title: settingsText(language, 'Interaction'),
      description: settingsText(language, 'Changes are saved immediately.'),
      groups: [
        {
          id: 'main-window',
          title: settingsText(language, 'Main window'),
          fields: [
            {
              id: MAIN_STARTUP_FOCUS_FIELD_ID,
              label: settingsText(language, 'Startup focus'),
              description: settingsText(
                language,
                'Applies the next time Zotero starts in the library.',
              ),
              kind: 'choice',
              value: mainStartupFocus(this.#preferences),
              options: [
                { value: 'items', label: settingsText(language, 'Item list') },
                { value: 'quickSearch', label: settingsText(language, 'Zotero Quick Search') },
              ],
            },
          ],
        },
        {
          id: 'picker',
          title: settingsText(language, 'Picker'),
          description:
            language === 'zh-CN'
              ? '适用于条目、分类、标签、标签页和笔记等选择器。'
              : 'Applies to pickers for items, collections, tags, tabs, and notes.',
          fields: [
            {
              id: PICKER_MOUSE_FIELD_ID,
              label:
                language === 'zh-CN' ? '使用鼠标选择和确认' : 'Select and confirm with the mouse',
              description:
                language === 'zh-CN'
                  ? '点击选择一行，双击确认。'
                  : 'Click to select a row and double-click to confirm.',
              kind: 'boolean',
              value: pickerMouseEnabled(this.#preferences),
            },
          ],
        },
      ],
      ...(this.#status ? { status: this.#status } : {}),
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    if (command.type !== 'value') return;
    switch (command.id) {
      case MAIN_STARTUP_FOCUS_FIELD_ID:
        if (isMainStartupFocus(command.value))
          this.#save(MAIN_STARTUP_FOCUS_PREFERENCE_KEY, command.value);
        return;
      case PICKER_MOUSE_FIELD_ID:
        if (typeof command.value === 'boolean')
          this.#save(PICKER_MOUSE_ENABLED_PREFERENCE_KEY, command.value);
        return;
    }
  }

  #save<K extends keyof InteractionValues>(key: K, value: InteractionValues[K]): void {
    try {
      this.#preferences.set(key, value);
      this.#status = undefined;
    } catch {
      this.#status = {
        text: settingsText(this.#language, 'Could not update Interaction settings.'),
        error: true,
      };
    }
    this.#changed();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
