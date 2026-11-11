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
  type OptionalModuleDescriptor,
  type OptionalModuleId,
} from '../modules';
import type { SettingsFormCommand, SettingsFormGroup, SettingsFormModel } from './settings-form-model';
import { settingsScopeText, settingsText, type SettingsLanguage } from './settings-i18n';
import { SettingsTabs } from './settings-tabs';

type ModuleFlags = Record<OptionalModuleId, boolean>;

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
  #status = '';
  #disposed = false;

  constructor(window: MainWindow, preferences: PreferenceStore, modules: BuiltinModuleRuntime, language: SettingsLanguage, changed: () => void) {
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
    try {
      for (const { id } of OPTIONAL_MODULES) {
        const cleanup = preferences.observe?.(modulePreferenceKey(id), () => this.#syncRequestedPreferences());
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
    const states = new Map(this.#modules.inspect(this.#owner).map((state) => [state.id, state] as const));
    const groups: SettingsFormGroup[] = [{
      id: 'module-actions', title: settingsText(language, 'Optional enhancements'), fields: [
        { kind: 'action', id: 'modules.save', label: settingsText(language, 'Save module requests'), primary: true, disabled: OPTIONAL_MODULES.every(({ id }) => this.#draft[id] === this.#saved[id]) },
        { kind: 'action', id: 'modules.restore', label: settingsText(language, 'Restore default module requests') },
      ],
    }];
    for (const descriptor of OPTIONAL_MODULES) {
      const state = states.get(descriptor.id);
      const summary = state ? [
        `${settingsText(language, 'Applied')}: ${settingsText(language, state.applied ? 'On' : 'Off')}`,
        `${settingsText(language, 'Requested')}: ${settingsText(language, state.requested ? 'On' : 'Off')}`,
        `${settingsText(language, 'Draft request')}: ${settingsText(language, this.#draft[descriptor.id] ? 'On' : 'Off')}`,
        `${settingsText(language, 'Runtime status')}: ${this.#statusText(state.status)}`,
        ...(state.pendingRestart ? [settingsText(language, 'Pending restart')] : []),
        this.#runtimeDetails(descriptor, state),
      ].filter(Boolean).join(' · ') : '';
      groups.push({
        id: `module.${descriptor.id}`, title: descriptor.names[language],
        description: `${settingsText(language, 'Scope:')} ${descriptor.scopes.map((item) => settingsScopeText(language, item)).join(', ')}`,
        fields: [{ kind: 'boolean', id: `modules.request.${descriptor.id}`, label: `${settingsText(language, 'Draft request')}: ${descriptor.names[language]}`, value: this.#draft[descriptor.id], note: summary }],
      });
      if (descriptor.id === 'tab-enhancements') groups.push(this.#tabs.group());
    }
    const status = this.#status || this.#tabs.status;
    return {
      title: settingsText(language, 'Optional enhancements'),
      description: settingsText(language, 'Choose which optional enhancements to request after restarting Zotero. Core library, worksets, tags, collections, reader navigation, selection, annotations, notes, and workspace remain available and are not affected.'),
      groups,
      ...(status ? { status: { text: status, error: true } } : {}),
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed) return;
    if (command.type === 'value') {
      const descriptor = OPTIONAL_MODULES.find(({ id }) => command.id === `modules.request.${id}`);
      if (descriptor) {
        if (typeof command.value !== 'boolean') return;
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
    this.#tabs.dispatch(command);
  }

  #save(): void {
    try {
      for (const { id } of OPTIONAL_MODULES) {
        if (this.#draft[id] !== this.#saved[id]) this.#preferences.set(modulePreferenceKey(id), this.#draft[id]);
      }
      this.#syncRequestedPreferences();
      this.#status = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status = settingsText(this.#language, 'Could not save module requests. Some changes may already be saved.');
    }
    this.#notify();
  }

  #restoreDefaults(): void {
    for (const { id } of OPTIONAL_MODULES) this.#draft[id] = OPTIONAL_MODULE_DEFAULTS[id];
    try {
      for (const { id } of OPTIONAL_MODULES) this.#preferences.clear(modulePreferenceKey(id));
      this.#syncRequestedPreferences();
      this.#status = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status = settingsText(this.#language, 'Could not restore module requests. Some requests may already be restored.');
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

  #notify(): void { if (!this.#disposed) this.#changed(); }

  #statusText(status: ModuleStatus): string {
    switch (status) {
      case 'enabled': return settingsText(this.#language, 'Enabled');
      case 'disabled': return settingsText(this.#language, 'Disabled');
      case 'blocked': return settingsText(this.#language, 'Blocked');
      case 'failed': return settingsText(this.#language, 'Failed');
      case 'pending': return settingsText(this.#language, 'Pending host');
    }
  }

  #runtimeDetails(descriptor: OptionalModuleDescriptor, state: ModuleSettingsState): string {
    const details = state.instances.map((instance) => {
      const host = settingsScopeText(this.#language, instance.host === 'main' ? 'Main window' : 'Reader session');
      const parts = [`${host}: ${this.#statusText(instance.status)}`];
      if (instance.dependencyIds.length) parts.push(`${settingsText(this.#language, 'Requires:')} ${instance.dependencyIds.map((id) => this.#moduleName(id)).join(', ')}`);
      if (instance.failure) parts.push(`${settingsText(this.#language, 'Failure:')} ${instance.failure}`);
      return parts.join(' — ');
    });
    if (!state.instances.length && state.status === 'pending') {
      const hosts = descriptor.hosts.map((host) => settingsScopeText(this.#language, host === 'main' ? 'Main window' : 'Reader session'));
      details.push(`${settingsText(this.#language, 'Waiting for supported hosts:')} ${hosts.join(', ')}`);
    }
    if (state.status === 'blocked' && state.dependencyIds.length && !details.length) {
      details.push(`${settingsText(this.#language, 'Requires:')} ${state.dependencyIds.map((id) => this.#moduleName(id)).join(', ')}`);
    }
    return details.join(' · ');
  }

  #moduleName(id: BuiltinModuleId): string {
    return BUILTIN_MODULES.find((descriptor) => descriptor.id === id)?.names[this.#language] ?? id;
  }

  dispose(): void {
    this.#disposed = true;
    this.#cleanups.dispose();
  }
}
