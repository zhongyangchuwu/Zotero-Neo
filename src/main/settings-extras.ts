import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { t } from '../i18n';
import {
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_INSTALL_URL,
  TRANSLATE_SUPPORTED_VERSION,
} from '../modules/translation/dependency';
import {
  prepareTranslationDependency,
  readTranslationDependency,
  type TranslationDependencySnapshot,
} from '../modules/translation/setup';
import { TRANSLATION_EXTRA_PREFERENCE } from '../modules/translation/selection-action';
import {
  openMainPluginPreferences,
  setMainPluginEnabled,
  updateMainPlugin,
  type MainPluginInstallOptions,
} from '../toolkit/main';
import type { SettingsFormCommand, SettingsFormModel } from './settings-form-model';
import { settingsText, type SettingsLanguage } from './settings-i18n';

/** The Extra owns selection integration; Zotero owns the provider's lifecycle. */
export class SettingsExtras {
  readonly #window: MainWindow;
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #unobserve: (() => void) | undefined;
  #snapshot: TranslationDependencySnapshot | null = null;
  #status: SettingsFormModel['status'];
  #cancel: (() => void) | null = null;
  #busy = false;
  #disposed = false;

  constructor(
    window: MainWindow,
    preferences: PreferenceStore,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#window = window;
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;
    this.#unobserve = preferences.observe?.(TRANSLATION_EXTRA_PREFERENCE, changed);
    void this.#run(() => this.#refresh());
  }

  #text(key: string): string {
    return t(`translation.setup.${key}`, this.#language);
  }

  model(): SettingsFormModel {
    const snapshot = this.#snapshot;
    const enabled = this.#preferences.get(TRANSLATION_EXTRA_PREFERENCE, false);
    const canPrepare =
      !!snapshot &&
      !snapshot.pendingRestart &&
      (!snapshot.installed || (!snapshot.enabled && snapshot.canEnable));
    const state = !snapshot
      ? this.#busy
        ? 'checking'
        : 'unknown'
      : snapshot.pendingRestart
        ? 'pendingRestart'
        : !snapshot.installed
          ? 'missing'
          : !snapshot.enabled
            ? snapshot.canEnable
              ? 'disabled'
              : 'blocked'
            : snapshot.selectionReady
              ? 'ready'
              : 'starting';
    return {
      title: settingsText(this.#language, 'Extras'),
      groups: [
        {
          id: 'extra.translation',
          title: this.#text('extra'),
          description: this.#text('extraDescription'),
          fields: [
            {
              kind: 'boolean',
              id: 'translation.extra.enabled',
              label: this.#text('extraEnable'),
              value: enabled,
              disabled: this.#busy || (!enabled && !snapshot?.enabled && !canPrepare),
              note: enabled && !snapshot?.selectionReady ? this.#text('waiting') : undefined,
            },
          ],
        },
        {
          id: 'translation.setup',
          title: 'Translate for Zotero',
          description: [
            snapshot?.version,
            this.#text(state),
            snapshot?.installed && !snapshot.saveSupported ? this.#text('unsupported') : '',
          ]
            .filter(Boolean)
            .join(' · '),
          fields: [
            ...(canPrepare
              ? [
                  {
                    kind: 'action' as const,
                    id: 'translation.prepare',
                    label: this.#text(snapshot.installed ? 'enable' : 'install'),
                    disabled: this.#busy,
                  },
                ]
              : []),
            {
              kind: 'action',
              id: 'translation.check',
              label: this.#text('check'),
              disabled: this.#busy,
            },
            ...(snapshot?.installed
              ? [
                  {
                    kind: 'action' as const,
                    id: 'translation.update',
                    label: this.#text('update'),
                    disabled: this.#busy || snapshot.pendingRestart,
                  },
                  {
                    kind: 'action' as const,
                    id: 'translation.preferences',
                    label: this.#text('preferences'),
                    disabled: this.#busy || !snapshot.hasSettings,
                  },
                  {
                    kind: 'action' as const,
                    id: 'translation.disableProvider',
                    label: this.#text('disableProvider'),
                    disabled: this.#busy || !snapshot.canDisable || snapshot.pendingRestart,
                  },
                ]
              : []),
            ...(this.#cancel
              ? [{ kind: 'action' as const, id: 'translation.cancel', label: this.#text('cancel') }]
              : []),
          ],
        },
      ],
      status: this.#status,
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed) return;
    if (command.type === 'action' && command.id === 'translation.cancel') {
      this.#cancel?.();
      return;
    }
    if (this.#busy) return;
    if (command.type === 'value') {
      if (command.id !== 'translation.extra.enabled' || typeof command.value !== 'boolean') return;
      const enabled = this.#preferences.get(TRANSLATION_EXTRA_PREFERENCE, false);
      if (command.value === enabled) return;
      if (command.value) void this.#run(() => this.#prepare(true));
      else
        void this.#run(() => {
          this.#preferences.set(TRANSLATION_EXTRA_PREFERENCE, false);
        });
      return;
    }
    switch (command.id) {
      case 'translation.prepare':
        void this.#run(() => this.#prepare(false));
        break;
      case 'translation.check':
        void this.#run(() => this.#refresh());
        break;
      case 'translation.update':
        if (this.#snapshot?.installed && !this.#snapshot.pendingRestart)
          void this.#run(() => this.#update());
        break;
      case 'translation.preferences':
        if (this.#snapshot?.installed)
          void this.#run(() => {
            if (!openMainPluginPreferences(TRANSLATE_PLUGIN_ID))
              this.#status = { text: this.#text('preferencesUnavailable'), error: true };
          });
        break;
      case 'translation.disableProvider':
        if (this.#snapshot?.canDisable && !this.#snapshot.pendingRestart)
          void this.#run(async () => {
            if (!this.#confirm(this.#text('disablePrompt'))) return;
            await setMainPluginEnabled(TRANSLATE_PLUGIN_ID, false);
            await this.#refresh();
          });
        break;
    }
  }

  async #run(operation: () => void | Promise<void>): Promise<void> {
    this.#busy = true;
    this.#status = undefined;
    this.#changed();
    try {
      if (!this.#disposed) await operation();
    } catch (error) {
      if (!this.#disposed)
        this.#status = { text: `${this.#text('failed')}: ${String(error)}`, error: true };
    } finally {
      this.#busy = false;
      this.#cancel = null;
      if (!this.#disposed) this.#changed();
    }
  }

  async #refresh(): Promise<void> {
    if (this.#disposed) return;
    const snapshot = await readTranslationDependency();
    if (!this.#disposed) this.#snapshot = snapshot;
  }

  #confirm(message: string): boolean {
    return !this.#disposed && this.#window.confirm(message) && !this.#disposed;
  }

  #transport(): Pick<MainPluginInstallOptions, 'progress' | 'registerCancel'> {
    return {
      progress: (current, total) => {
        if (this.#disposed) return;
        this.#status = {
          text: `${this.#text('preparing')} ${current}${total > 0 ? ` / ${total}` : ''}`,
        };
        this.#changed();
      },
      registerCancel: (cancel) => {
        if (this.#disposed) cancel?.();
        else {
          this.#cancel = cancel;
          this.#changed();
        }
      },
    };
  }

  async #prepare(enableExtra: boolean): Promise<void> {
    this.#status = { text: this.#text('preparing') };
    this.#changed();
    const snapshot = await prepareTranslationDependency({
      ...this.#transport(),
      isCurrent: () => !this.#disposed,
      confirmDownload: () =>
        this.#confirm(
          `${this.#text('installPrompt')}\n\nTranslate for Zotero ${TRANSLATE_SUPPORTED_VERSION}\nID: ${TRANSLATE_PLUGIN_ID}\n${TRANSLATE_PLUGIN_INSTALL_URL}\n\n${this.#text('permissionWarning')}`,
        ),
      confirmEnable: (name, version) =>
        this.#confirm(`${this.#text('enablePrompt')}\n\n${name} ${version}`),
    });
    if (this.#disposed) return;
    if (!snapshot) {
      this.#status = { text: this.#text('cancelled') };
      return;
    }
    this.#snapshot = snapshot;
    this.#status = undefined;
    if (enableExtra && (snapshot.enabled || snapshot.pendingRestart))
      this.#preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
  }

  async #update(): Promise<void> {
    this.#status = { text: this.#text('updating') };
    this.#changed();
    if (this.#disposed) return;
    const result = await updateMainPlugin({
      ...this.#transport(),
      id: TRANSLATE_PLUGIN_ID,
      confirm: ({ name, version, source }) => {
        if (!source.startsWith('https://')) throw new Error('Plugin update source must use HTTPS');
        return this.#confirm(
          `${this.#text('updatePrompt')}\n\n${name} ${version}\nID: ${TRANSLATE_PLUGIN_ID}\n${source}\n\n${this.#text('permissionWarning')}`,
        );
      },
    });
    if (this.#disposed) return;
    await this.#refresh();
    if (this.#disposed) return;
    if (result && result !== 'no-update' && result.pendingRestart && this.#snapshot)
      this.#snapshot = { ...this.#snapshot, pendingRestart: true, selectionReady: false };
    this.#status = {
      text: this.#text(result === 'no-update' ? 'noUpdate' : result ? 'updated' : 'cancelled'),
    };
  }

  dispose(): void {
    this.#disposed = true;
    try {
      this.#unobserve?.();
    } finally {
      this.#cancel?.();
      this.#cancel = null;
    }
  }
}
