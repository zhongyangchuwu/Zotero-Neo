import { CleanupScope } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { modulePreferenceKey, type BuiltinModuleRuntime } from '../core/module-runtime';
import { OPTIONAL_MODULES, type OptionalModuleId } from '../modules';
import type {
  SettingsFormCommand,
  SettingsFormGroup,
  SettingsFormModel,
} from './settings-form-model';
import { settingsText, type SettingsLanguage } from './settings-i18n';

const MODULE_DESCRIPTIONS: Record<OptionalModuleId, { en: string; 'zh-CN': string }> = {
  'reader-hints': {
    en: 'Use keyboard hints to open links and copy content in the reader.',
    'zh-CN': '在阅读器中使用键盘提示打开链接和复制内容。',
  },
  extensions: {
    en: 'Manage Zotero plugins from Neo.',
    'zh-CN': '在 Neo 中管理 Zotero 插件。',
  },
  references: {
    en: 'Browse references from the reader.',
    'zh-CN': '在阅读器中浏览参考文献。',
  },
};

/** Saves feature requests immediately while retaining startup-applied state. */
export class SettingsModules {
  readonly #owner: object;
  readonly #preferences: PreferenceStore;
  readonly #modules: BuiltinModuleRuntime;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups = new CleanupScope();
  #status = '';
  #disposed = false;

  constructor(
    window: MainWindow,
    preferences: PreferenceStore,
    modules: BuiltinModuleRuntime,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#owner = window;
    this.#preferences = preferences;
    this.#modules = modules;
    this.#language = language;
    this.#changed = changed;
    try {
      for (const { id } of OPTIONAL_MODULES) {
        const cleanup = preferences.observe?.(modulePreferenceKey(id), () => this.#notify());
        if (cleanup) this.#cleanups.add(cleanup);
      }
      this.#cleanups.add(modules.subscribe(() => this.#notify()));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  model(): SettingsFormModel {
    const language = this.#language;
    const requested = this.#modules.requested();
    const states = new Map(
      this.#modules.inspect(this.#owner).map((state) => [state.id, state] as const),
    );
    const groups: SettingsFormGroup[] = [
      {
        id: 'module-actions',
        title: language === 'zh-CN' ? '启用与停用' : 'Turn features on or off',
        fields: [
          {
            kind: 'action',
            id: 'modules.restore',
            label: language === 'zh-CN' ? '恢复功能默认值' : 'Restore feature defaults',
            description:
              language === 'zh-CN'
                ? '只重置本页的功能开关，立即保存。'
                : 'Resets only the feature switches on this page and saves immediately.',
          },
        ],
      },
    ];
    for (const descriptor of OPTIONAL_MODULES) {
      const state = states.get(descriptor.id);
      groups.push({
        id: `module.${descriptor.id}`,
        title: descriptor.names[language],
        description: MODULE_DESCRIPTIONS[descriptor.id][language],
        fields: [
          {
            kind: 'boolean',
            id: `modules.request.${descriptor.id}`,
            label:
              language === 'zh-CN'
                ? `启用${descriptor.names[language]}`
                : `Enable ${descriptor.names[language]}`,
            value: requested[descriptor.id],
            ...(state?.status === 'failed' || state?.status === 'blocked'
              ? { note: settingsText(language, 'This feature could not start in this window.') }
              : {}),
          },
        ],
      });
    }
    return {
      title: settingsText(language, 'Optional enhancements'),
      ...(OPTIONAL_MODULES.some(({ id }) => requested[id] !== this.#modules.applied[id])
        ? { notice: settingsText(language, 'Restart Zotero to apply these changes') }
        : {}),
      groups,
      ...(this.#status ? { status: { text: this.#status, error: true } } : {}),
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed) return;
    if (command.type === 'value') {
      const descriptor = OPTIONAL_MODULES.find(({ id }) => command.id === `modules.request.${id}`);
      if (descriptor) {
        if (typeof command.value !== 'boolean') return;
        try {
          this.#preferences.set(modulePreferenceKey(descriptor.id), command.value);
          this.#status = '';
        } catch {
          this.#status = settingsText(
            this.#language,
            'Could not save this setting. Values will be read back.',
          );
        }
        this.#notify();
        return;
      }
    } else if (command.id === 'modules.restore') {
      this.#restoreDefaults();
      return;
    }
  }

  #restoreDefaults(): void {
    let failed = false;
    for (const { id } of OPTIONAL_MODULES) {
      try {
        this.#preferences.clear(modulePreferenceKey(id));
      } catch {
        failed = true;
      }
    }
    this.#status = failed
      ? settingsText(
          this.#language,
          'Could not restore module requests. Some requests may already be restored.',
        )
      : '';
    this.#notify();
  }

  #notify(): void {
    if (!this.#disposed) this.#changed();
  }

  dispose(): void {
    this.#disposed = true;
    this.#cleanups.dispose();
  }
}
