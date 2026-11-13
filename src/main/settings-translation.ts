import type { MainWindow } from '../core/contracts';
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
import { openMainPluginPreferences } from '../toolkit/main';
import type { SettingsFormCommand, SettingsFormGroup } from './settings-form-model';
import type { SettingsLanguage } from './settings-i18n';

/** Headless dependency controls used by the React settings surface. */
export class SettingsTranslation {
  readonly #window: MainWindow;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  #snapshot: TranslationDependencySnapshot | null = null;
  #status = '';
  #cancel: (() => void) | null = null;
  #busy = false;
  #disposed = false;
  #revision = 0;

  constructor(window: MainWindow, language: SettingsLanguage, changed: () => void) {
    this.#window = window;
    this.#language = language;
    this.#changed = changed;
    void this.refresh();
  }

  get busy(): boolean {
    return this.#busy;
  }
  #text(key: string): string {
    return t(`translation.setup.${key}`, this.#language);
  }
  #notify(): void {
    if (!this.#disposed) this.#changed();
  }

  group(): SettingsFormGroup {
    const snapshot = this.#snapshot;
    const state = !snapshot
      ? 'checking'
      : snapshot.pendingRestart
        ? 'pendingRestart'
        : !snapshot.installed
          ? 'missing'
          : !snapshot.enabled
            ? 'disabled'
            : !snapshot.saveSupported
              ? 'unsupported'
              : !snapshot.runtimeReady
                ? 'starting'
                : 'ready';
    const details = `${snapshot?.version ? `Translate for Zotero ${snapshot.version}: ` : ''}${this.#text(state)}`;
    return {
      id: 'translation.setup',
      title: 'Translate for Zotero',
      description: `${details} · ${this.#text('notice')}${this.#status ? ` · ${this.#status}` : ''}`,
      fields: [
        {
          kind: 'action',
          id: 'translation.prepare',
          label: this.#text('prepare'),
          disabled: this.#busy,
        },
        {
          kind: 'action',
          id: 'translation.check',
          label: this.#text('check'),
          disabled: this.#busy,
        },
        {
          kind: 'action',
          id: 'translation.preferences',
          label: this.#text('preferences'),
          disabled: this.#busy || !snapshot?.installed,
        },
        ...(this.#cancel
          ? [{ kind: 'action' as const, id: 'translation.cancel', label: this.#text('cancel') }]
          : []),
      ],
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed || command.type !== 'action') return;
    if (command.id === 'translation.prepare') void this.prepare();
    else if (command.id === 'translation.check') void this.refresh();
    else if (command.id === 'translation.cancel') this.#cancel?.();
    else if (
      command.id === 'translation.preferences' &&
      !this.#busy &&
      this.#snapshot?.installed &&
      !openMainPluginPreferences(TRANSLATE_PLUGIN_ID)
    ) {
      this.#status = this.#text('preferencesUnavailable');
      this.#notify();
    }
  }

  async refresh(): Promise<void> {
    if (this.#disposed || this.#busy) return;
    const revision = ++this.#revision;
    try {
      const snapshot = await readTranslationDependency();
      if (this.#disposed || revision !== this.#revision) return;
      this.#snapshot = snapshot;
      this.#status = '';
    } catch (error) {
      if (this.#disposed || revision !== this.#revision) return;
      this.#status = `${this.#text('failed')}: ${String(error)}`;
    }
    this.#notify();
  }

  async prepare(): Promise<boolean> {
    if (this.#busy || this.#disposed) return false;
    this.#busy = true;
    ++this.#revision;
    this.#status = this.#text('preparing');
    this.#notify();
    try {
      const snapshot = await prepareTranslationDependency({
        language: this.#language,
        isCurrent: () => !this.#disposed,
        confirmDownload: () =>
          !this.#disposed &&
          this.#window.confirm(
            `${this.#text('installPrompt')}\n\nTranslate for Zotero ${TRANSLATE_SUPPORTED_VERSION}\nSource: ${TRANSLATE_PLUGIN_INSTALL_URL}\n\n${this.#text('permissionWarning')}`,
          ) &&
          !this.#disposed,
        confirmInstall: (details) =>
          !this.#disposed &&
          this.#window.confirm(
            `${this.#text('installPrompt')}\n\n${details.name} ${details.version}\nPlugin ID: ${TRANSLATE_PLUGIN_ID}\nSource: ${details.source}\n\n${this.#text('permissionWarning')}`,
          ) &&
          !this.#disposed,
        confirmEnable: (name, version) =>
          !this.#disposed &&
          this.#window.confirm(`${this.#text('enablePrompt')}\n\n${name} ${version}`) &&
          !this.#disposed,
        progress: (current, total) => {
          if (!this.#disposed) {
            this.#status = `${this.#text('preparing')} ${current}${total > 0 ? ` / ${total}` : ''}`;
            this.#notify();
          }
        },
        registerCancel: (cancel) => {
          if (this.#disposed) cancel?.();
          else {
            this.#cancel = cancel;
            this.#notify();
          }
        },
      });
      if (this.#disposed) return false;
      if (!snapshot) {
        this.#status = this.#text('cancelled');
        return false;
      }
      this.#snapshot = snapshot;
      this.#status = this.#text(
        snapshot.pendingRestart
          ? 'pendingRestart'
          : snapshot.saveSupported
            ? 'prepared'
            : 'unsupported',
      );
      return true;
    } catch (error) {
      if (!this.#disposed) this.#status = `${this.#text('failed')}: ${String(error)}`;
      return false;
    } finally {
      this.#cancel = null;
      this.#busy = false;
      this.#notify();
    }
  }

  dispose(): void {
    this.#disposed = true;
    ++this.#revision;
    this.#cancel?.();
    this.#cancel = null;
  }
}
