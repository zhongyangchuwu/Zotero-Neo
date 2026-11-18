import { CleanupScope } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  modulePreferenceKey,
  type BuiltinModuleRuntime,
  type ModuleSettingsState,
  type ModuleStatus,
} from '../core/module-runtime';
import {
  BUILTIN_MODULES,
  OPTIONAL_MODULE_DEFAULTS,
  OPTIONAL_MODULES,
  type BuiltinModuleId,
  type OptionalModuleId,
} from '../modules';
import type {
  SettingsFormCommand,
  SettingsFormGroup,
  SettingsFormModel,
} from './settings-form-model';
import { settingsScopeText, settingsText, type SettingsLanguage } from './settings-i18n';
import { SettingsTabs } from './settings-tabs';
import { SettingsTranslation } from './settings-translation';

type ModuleFlags = Record<OptionalModuleId, boolean>;
const MODULE_DESCRIPTIONS: Record<OptionalModuleId, { en: string; 'zh-CN': string }> = {
  'reader-hints': {
    en: 'Use keyboard hints to open links and copy content in the reader.',
    'zh-CN': '在阅读器中使用键盘提示打开链接和复制内容。',
  },
  extensions: {
    en: 'Manage Zotero plugins from Neo.',
    'zh-CN': '在 Neo 中管理 Zotero 插件。',
  },
  translation: {
    en: 'Translate selected text in the reader with Translate for Zotero.',
    'zh-CN': '使用 Translate for Zotero 翻译阅读器中选中的文字。',
  },
  'ai-qa': {
    en: 'Ask questions about a document and inspect the supporting evidence.',
    'zh-CN': '就文档提问并查看回答依据。',
  },
  references: {
    en: 'Browse references from the reader.',
    'zh-CN': '在阅读器中浏览参考文献。',
  },
  'tab-enhancements': {
    en: 'Use a tab sidebar and save groups of reading tabs.',
    'zh-CN': '使用标签页侧栏，并保存阅读标签页分组。',
  },
  'item-attributes': {
    en: 'Define and edit custom attributes for items.',
    'zh-CN': '为条目定义和编辑自定义属性。',
  },
};

/** Shows startup-applied module state separately from editable persisted requests. */
export class SettingsModules {
  readonly #owner: object;
  readonly #preferences: PreferenceStore;
  readonly #modules: BuiltinModuleRuntime;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #saved: ModuleFlags;
  readonly #draft: ModuleFlags;
  readonly #cleanups = new CleanupScope();
  readonly #tabs: SettingsTabs;
  readonly #translation: SettingsTranslation;
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
    const requested = modules.requested();
    this.#saved = { ...requested };
    this.#draft = { ...requested };
    this.#tabs = new SettingsTabs(preferences, language, () => this.#notify());
    this.#cleanups.add(() => this.#tabs.dispose());
    this.#translation = new SettingsTranslation(window, language, () => this.#notify());
    this.#cleanups.add(() => this.#translation.dispose());
    try {
      for (const { id } of OPTIONAL_MODULES) {
        const cleanup = preferences.observe?.(modulePreferenceKey(id), () =>
          this.#syncRequestedPreferences(),
        );
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
    const states = new Map(
      this.#modules.inspect(this.#owner).map((state) => [state.id, state] as const),
    );
    const groups: SettingsFormGroup[] = [
      {
        id: 'module-actions',
        title: language === 'zh-CN' ? '启用与停用' : 'Turn features on or off',
        description:
          language === 'zh-CN'
            ? '保存后，重启 Zotero 生效。切到其他设置页会丢弃未保存的更改。'
            : 'Save changes, then restart Zotero. Leaving this section discards unsaved changes.',
        fields: [
          {
            kind: 'action',
            id: 'modules.save',
            label: language === 'zh-CN' ? '保存更改' : 'Save changes',
            primary: true,
            disabled:
              this.#translation.busy ||
              OPTIONAL_MODULES.every(({ id }) => this.#draft[id] === this.#saved[id]),
          },
          {
            kind: 'action',
            id: 'modules.restore',
            label: language === 'zh-CN' ? '恢复模块默认值' : 'Restore module defaults',
            description:
              language === 'zh-CN'
                ? '只重置本页的功能开关，立即保存。'
                : 'Resets only the feature switches on this page and saves immediately.',
            disabled: this.#translation.busy,
          },
        ],
      },
    ];
    for (const descriptor of OPTIONAL_MODULES) {
      const state = states.get(descriptor.id);
      const summary = [
        ...(this.#draft[descriptor.id] !== this.#saved[descriptor.id]
          ? [language === 'zh-CN' ? '有未保存的更改' : 'Unsaved changes']
          : []),
        ...(state?.pendingRestart ? [settingsText(language, 'Pending restart')] : []),
        ...(state ? [this.#runtimeDetails(state)] : []),
      ]
        .filter(Boolean)
        .join(' · ');
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
            value: this.#draft[descriptor.id],
            disabled: this.#translation.busy,
            note: summary,
          },
        ],
      });
      if (descriptor.id === 'tab-enhancements') groups.push(this.#tabs.group());
      if (descriptor.id === 'translation') groups.push(this.#translation.group());
    }
    const status = this.#status || this.#tabs.status;
    return {
      title: settingsText(language, 'Optional enhancements'),
      groups,
      ...(status ? { status: { text: status, error: true } } : {}),
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed) return;
    if (command.type === 'value') {
      const descriptor = OPTIONAL_MODULES.find(({ id }) => command.id === `modules.request.${id}`);
      if (descriptor) {
        if (this.#translation.busy || typeof command.value !== 'boolean') return;
        this.#draft[descriptor.id] = command.value;
        this.#status = '';
        this.#notify();
        return;
      }
    } else if (command.id === 'modules.save') {
      this.#save();
      return;
    } else if (command.id === 'modules.restore') {
      this.#restoreDefaults();
      return;
    }
    this.#translation.dispatch(command);
    this.#tabs.dispatch(command);
  }

  #save(): void {
    if (this.#disposed || this.#translation.busy) return;
    if (this.#draft.translation && !this.#saved.translation) {
      void this.#translation.prepare().then((prepared) => {
        if (prepared && !this.#disposed) this.#commitRequests();
      });
      return;
    }
    this.#commitRequests();
  }

  #commitRequests(): void {
    try {
      for (const { id } of OPTIONAL_MODULES) {
        if (this.#draft[id] !== this.#saved[id])
          this.#preferences.set(modulePreferenceKey(id), this.#draft[id]);
      }
      this.#syncRequestedPreferences();
      this.#status = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status = settingsText(
        this.#language,
        'Could not save module requests. Some changes may already be saved.',
      );
    }
    this.#notify();
  }

  #restoreDefaults(): void {
    if (this.#translation.busy) return;
    for (const { id } of OPTIONAL_MODULES) this.#draft[id] = OPTIONAL_MODULE_DEFAULTS[id];
    try {
      for (const { id } of OPTIONAL_MODULES) {
        if (id === 'translation')
          this.#preferences.set(modulePreferenceKey(id), OPTIONAL_MODULE_DEFAULTS[id]);
        else this.#preferences.clear(modulePreferenceKey(id));
      }
      this.#syncRequestedPreferences();
      this.#status = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status = settingsText(
        this.#language,
        'Could not restore module requests. Some requests may already be restored.',
      );
    }
    this.#notify();
  }

  #syncRequestedPreferences(): void {
    const requested = this.#modules.requested();
    for (const { id } of OPTIONAL_MODULES) {
      if (this.#draft[id] === this.#saved[id]) this.#draft[id] = requested[id];
      this.#saved[id] = requested[id];
    }
    this.#notify();
  }

  #notify(): void {
    if (!this.#disposed) this.#changed();
  }

  #runtimeDetails(state: ModuleSettingsState): string {
    const details = state.instances
      .filter((instance) => instance.status === 'failed' || instance.status === 'blocked')
      .map((instance) => {
        const host = settingsScopeText(
          this.#language,
          instance.host === 'main' ? 'Main window' : 'Reader session',
        );
        const parts = [`${host}: ${this.#statusText(instance.status)}`];
        if (instance.dependencyIds.length)
          parts.push(
            `${settingsText(this.#language, 'Requires:')} ${instance.dependencyIds.map((id) => this.#moduleName(id)).join(', ')}`,
          );
        if (instance.failure)
          parts.push(`${settingsText(this.#language, 'Failure:')} ${instance.failure}`);
        return parts.join(' · ');
      });
    if (!details.length && (state.status === 'blocked' || state.status === 'failed')) {
      details.push(this.#statusText(state.status));
      if (state.dependencyIds.length)
        details.push(
          `${settingsText(this.#language, 'Requires:')} ${state.dependencyIds.map((id) => this.#moduleName(id)).join(', ')}`,
        );
    }
    return details.join(' · ');
  }

  #statusText(status: ModuleStatus): string {
    switch (status) {
      case 'enabled':
        return settingsText(this.#language, 'Enabled');
      case 'disabled':
        return settingsText(this.#language, 'Disabled');
      case 'blocked':
        return settingsText(this.#language, 'Blocked');
      case 'failed':
        return settingsText(this.#language, 'Failed');
      case 'pending':
        return settingsText(this.#language, 'Pending host');
    }
  }

  #moduleName(id: BuiltinModuleId): string {
    return BUILTIN_MODULES.find((descriptor) => descriptor.id === id)?.names[this.#language] ?? id;
  }

  dispose(): void {
    this.#disposed = true;
    this.#cleanups.dispose();
  }
}
