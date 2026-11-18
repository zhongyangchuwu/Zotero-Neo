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
import type { SettingsFormCommand, SettingsFormModel } from './settings-form-model';

const LANGUAGE_FIELD_ID = 'language';
const TAG_SEPARATOR_FIELD_ID = 'tagSeparator';

function isNeoLanguagePreference(value: unknown): value is NeoLanguagePreference {
  return value === '' || value === 'en' || value === 'zh-CN';
}

/** Final low-frequency settings that do not belong to a surface-specific page. */
export class SettingsAdvanced {
  readonly #preferences: PreferenceStore;
  readonly #uiLanguage: SettingsLanguage;
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
    this.#uiLanguage = language;
    this.#changed = changed;

    const separatorCleanup = preferences.observe?.(TAG_SEPARATOR_PREFERENCE_KEY, () => {
      if (this.#disposed) return;
      this.#status = undefined;
      this.#changed();
    });
    if (separatorCleanup) this.#cleanups.push(separatorCleanup);
  }

  model(): SettingsFormModel {
    const language = this.#uiLanguage;
    return {
      title: settingsText(language, 'Advanced'),
      groups: [
        {
          id: 'language',
          title: language === 'zh-CN' ? '界面语言' : 'Interface language',
          description:
            language === 'zh-CN'
              ? '更改 Neo 设置、前缀指南、命令面板和快捷键中的命令名称。选择“跟随 Zotero”使用 Zotero 的语言。'
              : 'Changes Neo Settings and command labels in the Prefix Guide, Command Palette, and Keybindings. Follow Zotero uses Zotero’s language.',
          fields: [
            {
              id: LANGUAGE_FIELD_ID,
              label: settingsText(language, 'Language'),
              description:
                language === 'zh-CN' ? '更改立即生效。' : 'Changes take effect immediately.',
              kind: 'choice',
              value: configuredNeoLanguage(this.#preferences),
              options: [
                { value: '', label: settingsText(language, 'Follow Zotero') },
                { value: 'en', label: settingsText(language, 'English') },
                { value: 'zh-CN', label: settingsText(language, '中文') },
              ],
            },
          ],
        },
        {
          id: 'tag-namespaces',
          title: language === 'zh-CN' ? '标签层级' : 'Tag hierarchy',
          description:
            language === 'zh-CN'
              ? '在标签选择器中按分隔符显示标签层级，不会修改 Zotero 中保存的标签。'
              : 'Show tags as a hierarchy in tag pickers without changing the tags saved in Zotero.',
          fields: [
            {
              id: TAG_SEPARATOR_FIELD_ID,
              label: language === 'zh-CN' ? '层级分隔符' : 'Hierarchy separator',
              description:
                language === 'zh-CN'
                  ? '默认为 /。留空可按完整标签名称匹配。修改后生效。'
                  : 'The default is /. Leave empty to match full tag names without a hierarchy. Applies when changed.',
              kind: 'text',
              value: tagSeparatorFromPreferences(this.#preferences),
              commit: 'change',
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
      case LANGUAGE_FIELD_ID:
        if (isNeoLanguagePreference(command.value))
          this.#save(LANGUAGE_PREFERENCE_KEY, command.value);
        return;
      case TAG_SEPARATOR_FIELD_ID:
        if (typeof command.value === 'string')
          this.#save(TAG_SEPARATOR_PREFERENCE_KEY, command.value);
        return;
    }
  }

  #save(
    key: typeof LANGUAGE_PREFERENCE_KEY | typeof TAG_SEPARATOR_PREFERENCE_KEY,
    value: string,
  ): void {
    try {
      this.#preferences.set(key, value);
      this.#status = undefined;
    } catch {
      this.#status = {
        text: settingsText(this.#uiLanguage, 'Could not update Advanced settings.'),
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
