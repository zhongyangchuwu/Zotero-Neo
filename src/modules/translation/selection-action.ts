import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import type { PreferenceStore } from '../../core/preference-store';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { translateForZoteroApi } from '../../platform/translate-for-zotero';

export const TRANSLATION_EXTRA_PREFERENCE = 'extras.translation.enabled';
export const SELECTION_TRANSLATION_ACTION_ID = 'pdf-translate.translate';

/** App-lifetime contribution; each menu captures the preference generation and provider. */
export class SelectionTranslation {
  readonly #preferences: PreferenceStore;
  readonly #pluginID: string;
  readonly #unobserve: (() => void) | undefined;
  #revision = 0;
  #disposed = false;

  constructor(preferences: PreferenceStore, pluginID: string) {
    this.#preferences = preferences;
    this.#pluginID = pluginID;
    this.#unobserve = preferences.observe?.(TRANSLATION_EXTRA_PREFERENCE, () => {
      this.#revision += 1;
    });
  }

  #enabled(): boolean {
    return !this.#disposed && this.#preferences.get(TRANSLATION_EXTRA_PREFERENCE, false) === true;
  }

  action(language: KeyGuideLanguage): ReaderSelectionActionDefinition | null {
    if (!this.#enabled()) return null;
    const api = translateForZoteroApi();
    if (!api) return null;
    const translate = api.translate;
    const revision = this.#revision;
    const isCurrent = () =>
      revision === this.#revision &&
      this.#enabled() &&
      translateForZoteroApi() === api &&
      api.translate === translate;
    const chinese = language === 'zh-CN';
    return {
      id: SELECTION_TRANSLATION_ACTION_ID,
      label: chinese ? '翻译' : 'Translate',
      run: async ({ text, itemID }) => {
        if (!isCurrent()) return { retired: true };
        try {
          const task = await translate.call(api, text, {
            pluginID: this.#pluginID,
            ...(itemID === null ? {} : { itemID }),
          });
          if (!isCurrent()) return { retired: true };
          if (task.status && task.status !== 'success') {
            throw new Error(task.result || 'translation failed');
          }
          const body = task.result?.trim();
          if (!body) throw new Error('empty translation result');
          return { title: chinese ? '翻译结果' : 'Translation Result', body };
        } catch (error) {
          if (!isCurrent()) return { retired: true };
          throw error;
        }
      },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unobserve?.();
  }
}
