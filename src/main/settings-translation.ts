import type { MainWindow } from '../core/contracts';
import { t } from '../i18n';
import { TRANSLATE_PLUGIN_ID } from '../modules/translation/dependency';
import {
  prepareTranslationDependency,
  readTranslationDependency,
  type TranslationDependencySnapshot,
} from '../modules/translation/setup';
import { openMainPluginPreferences } from '../toolkit/main';
import { THEME_VARS } from '../ui/theme';
import type { SettingsLanguage } from './settings-i18n';
import { settingsButton } from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

/** Dependency preparation remains available before the optional Reader module is active. */
export class SettingsTranslation {
  readonly #window: MainWindow;
  readonly #language: SettingsLanguage;
  readonly #busyChanged: (busy: boolean) => void;
  readonly #details: HTMLElement;
  readonly #status: HTMLElement;
  readonly #buttons: HTMLButtonElement[] = [];
  readonly #preferencesButton: HTMLButtonElement;
  readonly #cancelButton: HTMLButtonElement;
  readonly #cleanups: Array<() => void> = [];
  #snapshot: TranslationDependencySnapshot | null = null;
  #cancel: (() => void) | null = null;
  #busy = false;
  #disposed = false;
  #revision = 0;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    language: SettingsLanguage,
    busyChanged: (busy: boolean) => void,
  ) {
    this.#window = window;
    this.#language = language;
    this.#busyChanged = busyChanged;
    const doc = window.document;
    this.#details = doc.createElementNS(H, 'p');
    this.#details.setAttribute('data-translation-dependency', '');
    const notice = doc.createElementNS(H, 'p');
    notice.textContent = this.#text('notice');
    notice.style.cssText = 'margin:0.4em 0;opacity:.85';
    const actions = doc.createElementNS(H, 'div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:0.5em 0';
    const button = (key: string, action: () => void): HTMLButtonElement => {
      const control = settingsButton(doc, this.#text(key), action, this.#cleanups);
      control.setAttribute(`data-translation-${key}`, '');
      this.#buttons.push(control);
      actions.append(control);
      return control;
    };
    button('prepare', () => {
      void this.prepare();
    });
    button('check', () => {
      void this.#refresh();
    });
    this.#preferencesButton = button('preferences', () => {
      if (!openMainPluginPreferences(TRANSLATE_PLUGIN_ID))
        this.#setStatus(this.#text('preferencesUnavailable'), true);
    });
    this.#cancelButton = settingsButton(
      doc,
      this.#text('cancel'),
      () => this.#cancel?.(),
      this.#cleanups,
    );
    this.#cancelButton.setAttribute('data-translation-cancel', '');
    this.#cancelButton.hidden = true;
    actions.append(this.#cancelButton);
    this.#status = doc.createElementNS(H, 'p');
    this.#status.setAttribute('role', 'status');
    this.#status.setAttribute('aria-live', 'polite');
    this.#status.style.margin = '0';
    this.#status.setAttribute('data-translation-setup-status', '');
    root.append(this.#details, notice, actions, this.#status);
    this.#render();
    void this.#refresh();
  }

  #text(key: string): string {
    return t(`translation.setup.${key}`, this.#language);
  }

  #setStatus(message: string, failed = false): void {
    this.#status.textContent = message;
    this.#status.style.color = failed ? THEME_VARS.error : 'inherit';
  }

  #render(): void {
    if (this.#disposed) return;
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
    this.#details.textContent = `${snapshot?.version ? `Translate for Zotero ${snapshot.version}: ` : ''}${this.#text(state)}`;
    for (const button of this.#buttons) button.disabled = this.#busy;
    this.#preferencesButton.disabled = this.#busy || !snapshot?.installed;
    this.#cancelButton.hidden = !this.#cancel;
    this.#cancelButton.style.display = this.#cancel ? 'inline-flex' : 'none';
  }

  async #refresh(): Promise<void> {
    if (this.#disposed || this.#busy) return;
    const revision = ++this.#revision;
    try {
      const snapshot = await readTranslationDependency();
      if (this.#disposed || revision !== this.#revision) return;
      this.#snapshot = snapshot;
      this.#setStatus('');
      this.#render();
    } catch (error) {
      if (this.#disposed || revision !== this.#revision) return;
      this.#setStatus(`${this.#text('failed')}: ${String(error)}`, true);
    }
  }

  /** Return whether the current caller may persist its enable request, not whether Save is ready. */
  async prepare(): Promise<boolean> {
    if (this.#busy || this.#disposed) return false;
    this.#busy = true;
    ++this.#revision;
    this.#busyChanged(true);
    this.#setStatus(this.#text('preparing'));
    this.#render();
    try {
      const snapshot = await prepareTranslationDependency({
        language: this.#language,
        isCurrent: () => !this.#disposed,
        confirmInstall: (details) => {
          if (this.#disposed) return false;
          const accepted = this.#window.confirm(
            `${this.#text('installPrompt')}\n\n${details.name} ${details.version}\nPlugin ID: ${TRANSLATE_PLUGIN_ID}\nSource: ${details.source}\n\n${this.#text('permissionWarning')}`,
          );
          return accepted && !this.#disposed;
        },
        confirmEnable: (name, version) => {
          if (this.#disposed) return false;
          const accepted = this.#window.confirm(
            `${this.#text('enablePrompt')}\n\n${name} ${version}`,
          );
          return accepted && !this.#disposed;
        },
        progress: (current, total) => {
          if (!this.#disposed)
            this.#setStatus(
              `${this.#text('preparing')} ${current}${total > 0 ? ` / ${total}` : ''}`,
            );
        },
        registerCancel: (cancel) => {
          if (this.#disposed) {
            cancel?.();
            return;
          }
          this.#cancel = cancel;
          this.#render();
        },
      });
      if (this.#disposed) return false;
      if (!snapshot) {
        this.#setStatus(this.#text('cancelled'));
        return false;
      }
      this.#snapshot = snapshot;
      this.#setStatus(
        this.#text(
          snapshot.pendingRestart
            ? 'pendingRestart'
            : snapshot.saveSupported
              ? 'prepared'
              : 'unsupported',
        ),
      );
      return true;
    } catch (error) {
      if (!this.#disposed) this.#setStatus(`${this.#text('failed')}: ${String(error)}`, true);
      return false;
    } finally {
      this.#cancel = null;
      this.#busy = false;
      if (!this.#disposed) {
        this.#busyChanged(false);
        this.#render();
      }
    }
  }

  dispose(): void {
    this.#disposed = true;
    ++this.#revision;
    this.#cancel?.();
    this.#cancel = null;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
