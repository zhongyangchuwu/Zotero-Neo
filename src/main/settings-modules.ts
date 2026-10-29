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
  OPTIONAL_MODULES,
  type BuiltinModuleId,
  type OptionalModuleDescriptor,
  type OptionalModuleId,
} from '../modules';
import { settingsScopeText, settingsText, type SettingsLanguage } from './settings-i18n';
import { settingsButton, settingsStatus } from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

type ModuleFlags = Record<OptionalModuleId, boolean>;

interface ModuleRow {
  readonly checkbox: HTMLInputElement;
  readonly summary: HTMLElement;
  readonly details: HTMLElement;
}

/** Shows startup-applied module state separately from editable persisted requests. */
export class SettingsModules {
  readonly #root: HTMLElement;
  readonly #owner: object;
  readonly #preferences: PreferenceStore;
  readonly #modules: BuiltinModuleRuntime;
  readonly #language: SettingsLanguage;
  readonly #saved: ModuleFlags;
  readonly #draft: ModuleFlags;
  readonly #rows = new Map<OptionalModuleId, ModuleRow>();
  readonly #cleanups: Array<() => void> = [];
  readonly #status: HTMLElement;
  readonly #saveButton: HTMLButtonElement;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    modules: BuiltinModuleRuntime,
    language: SettingsLanguage,
  ) {
    this.#root = root;
    this.#owner = window;
    this.#preferences = preferences;
    this.#modules = modules;
    this.#language = language;
    const requested = modules.requested();
    this.#saved = { ...requested };
    this.#draft = { ...requested };

    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const title = doc.createElementNS(H, 'h2');
    title.textContent = settingsText(language, 'Optional enhancements');
    title.style.cssText = 'margin:0 0 0.35em;font-size:1.55em';

    const description = doc.createElementNS(H, 'p');
    description.textContent = settingsText(
      language,
      'Choose which optional enhancements to request after restarting Zotero. Core library, worksets, tags, collections, reader navigation, selection, annotations, notes, and workspace remain available and are not affected.',
    );
    description.style.cssText = 'margin:0 0 0.8em';

    const actions = doc.createElementNS(H, 'div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 0.8em';
    this.#saveButton = settingsButton(
      doc,
      settingsText(language, 'Save module requests'),
      () => this.#save(),
      this.#cleanups,
    );
    this.#saveButton.setAttribute('aria-label', settingsText(language, 'Save module requests'));
    const restoreButton = settingsButton(
      doc,
      settingsText(language, 'Restore default module requests'),
      () => this.#restoreDefaults(),
      this.#cleanups,
    );
    restoreButton.setAttribute(
      'aria-label',
      settingsText(language, 'Restore default module requests'),
    );
    actions.append(this.#saveButton, restoreButton);

    this.#status = settingsStatus(doc);

    const rows = doc.createElementNS(H, 'div');
    rows.style.cssText = 'display:grid;gap:8px';
    for (const descriptor of OPTIONAL_MODULES) rows.append(this.#createRow(doc, descriptor));

    root.append(title, description, actions, this.#status, rows);

    try {
      for (const { id } of OPTIONAL_MODULES) {
        const cleanup = preferences.observe?.(modulePreferenceKey(id), () =>
          this.#syncRequestedPreferences(),
        );
        if (cleanup) this.#cleanups.push(cleanup);
      }
      this.#cleanups.push(modules.subscribe(() => this.#refresh()));
      this.#refresh();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  #createRow(doc: Document, descriptor: OptionalModuleDescriptor): HTMLElement {
    const row = doc.createElementNS(H, 'article');
    row.setAttribute('data-module-id', descriptor.id);
    row.style.cssText = 'padding:0.7em;border:1px solid var(--zotero-neo-border);border-radius:5px';

    const name = doc.createElementNS(H, 'h3');
    name.textContent = descriptor.names[this.#language];
    name.style.cssText = 'margin:0 0 0.25em;font-size:1.1em';

    const scope = doc.createElementNS(H, 'p');
    scope.textContent = `${settingsText(this.#language, 'Scope:')} ${descriptor.scopes
      .map((item) => settingsScopeText(this.#language, item))
      .join(', ')}`;
    scope.style.cssText = 'margin:0 0 0.45em';

    const request = doc.createElementNS(H, 'label');
    request.style.cssText = 'display:inline-flex;align-items:center;gap:0.45em';
    const checkbox = doc.createElementNS(H, 'input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.checked = this.#draft[descriptor.id];
    checkbox.setAttribute(
      'aria-label',
      `${settingsText(this.#language, 'Draft request')}: ${descriptor.names[this.#language]}`,
    );
    checkbox.setAttribute('data-module-request', descriptor.id);
    const requestLabel = doc.createElementNS(H, 'span');
    requestLabel.textContent = settingsText(this.#language, 'Request module');
    request.append(checkbox, requestLabel);

    const summary = doc.createElementNS(H, 'p');
    summary.style.cssText = 'margin:0.4em 0 0';
    const details = doc.createElementNS(H, 'p');
    details.style.cssText = 'margin:0.25em 0 0';

    const onChange = (): void => {
      this.#draft[descriptor.id] = checkbox.checked;
      this.#status.textContent = '';
      this.#refresh();
    };
    checkbox.addEventListener('change', onChange);
    this.#cleanups.push(() => checkbox.removeEventListener('change', onChange));

    row.append(name, scope, request, summary, details);
    this.#rows.set(descriptor.id, { checkbox, summary, details });
    return row;
  }

  #save(): void {
    try {
      for (const { id } of OPTIONAL_MODULES) {
        if (this.#draft[id] !== this.#saved[id])
          this.#preferences.set(modulePreferenceKey(id), this.#draft[id]);
      }
      this.#syncRequestedPreferences();
      this.#status.textContent = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status.textContent = settingsText(
        this.#language,
        'Could not save module requests. Some changes may already be saved.',
      );
    }
  }

  #restoreDefaults(): void {
    for (const { id } of OPTIONAL_MODULES) this.#draft[id] = true;
    this.#refresh();
    try {
      for (const { id } of OPTIONAL_MODULES) this.#preferences.clear(modulePreferenceKey(id));
      this.#syncRequestedPreferences();
      this.#status.textContent = '';
    } catch {
      this.#syncRequestedPreferences();
      this.#status.textContent = settingsText(
        this.#language,
        'Could not restore module requests. Some requests may already be restored.',
      );
    }
  }

  #syncRequestedPreferences(): void {
    const requested = this.#modules.requested();
    for (const { id } of OPTIONAL_MODULES) {
      if (this.#draft[id] === this.#saved[id]) this.#draft[id] = requested[id];
      this.#saved[id] = requested[id];
    }
    this.#refresh();
  }

  #refresh(): void {
    const states = new Map(
      this.#modules.inspect(this.#owner).map((state) => [state.id, state] as const),
    );
    for (const descriptor of OPTIONAL_MODULES) {
      const state = states.get(descriptor.id);
      const row = this.#rows.get(descriptor.id);
      if (!state || !row) continue;
      row.checkbox.checked = this.#draft[descriptor.id];
      const summary = [
        `${settingsText(this.#language, 'Applied')}: ${settingsText(
          this.#language,
          state.applied ? 'On' : 'Off',
        )}`,
        `${settingsText(this.#language, 'Requested')}: ${settingsText(
          this.#language,
          state.requested ? 'On' : 'Off',
        )}`,
        `${settingsText(this.#language, 'Draft request')}: ${settingsText(
          this.#language,
          this.#draft[descriptor.id] ? 'On' : 'Off',
        )}`,
        `${settingsText(this.#language, 'Runtime status')}: ${this.#statusText(state.status)}`,
      ];
      if (state.pendingRestart) summary.push(settingsText(this.#language, 'Pending restart'));
      row.summary.textContent = summary.join(' · ');
      row.details.textContent = this.#runtimeDetails(descriptor, state);
    }
    this.#saveButton.disabled = OPTIONAL_MODULES.every(
      ({ id }) => this.#draft[id] === this.#saved[id],
    );
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

  #runtimeDetails(descriptor: OptionalModuleDescriptor, state: ModuleSettingsState): string {
    const details = state.instances.map((instance) => {
      const host = settingsScopeText(
        this.#language,
        instance.host === 'main' ? 'Main window' : 'Reader session',
      );
      const parts = [`${host}: ${this.#statusText(instance.status)}`];
      if (instance.dependencyIds.length) {
        parts.push(
          `${settingsText(this.#language, 'Requires:')} ${instance.dependencyIds
            .map((id) => this.#moduleName(id))
            .join(', ')}`,
        );
      }
      if (instance.failure)
        parts.push(`${settingsText(this.#language, 'Failure:')} ${instance.failure}`);
      return parts.join(' — ');
    });
    if (!state.instances.length && state.status === 'pending') {
      const hosts = descriptor.hosts.map((host) =>
        settingsScopeText(this.#language, host === 'main' ? 'Main window' : 'Reader session'),
      );
      details.push(
        `${settingsText(this.#language, 'Waiting for supported hosts:')} ${hosts.join(', ')}`,
      );
    }
    if (state.status === 'blocked' && state.dependencyIds.length && !details.length) {
      details.push(
        `${settingsText(this.#language, 'Requires:')} ${state.dependencyIds
          .map((id) => this.#moduleName(id))
          .join(', ')}`,
      );
    }
    return details.join(' · ');
  }

  #moduleName(id: BuiltinModuleId): string {
    return BUILTIN_MODULES.find((descriptor) => descriptor.id === id)?.names[this.#language] ?? id;
  }

  dispose(): void {
    const cleanups = new CleanupScope();
    cleanups.add(() => this.#root.replaceChildren());
    for (const cleanup of this.#cleanups.splice(0)) cleanups.add(cleanup);
    cleanups.dispose();
  }
}
