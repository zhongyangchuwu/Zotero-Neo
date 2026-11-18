import { CleanupFailure, CleanupScope } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import { neoCommandLanguage } from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import { mountLiteratureTable } from '../literature-table/controller';
import { isDeadObject } from '../platform/cross-compartment';
import { LITERATURE_WINDOW_URI, openLiteratureWindow } from '../platform/literature-window';
import { createLiteratureTableHost } from '../toolkit/main';
import { ThemeManager } from '../ui/theme';

export class LiteratureTableWindows {
  readonly #windows = new Map<MainWindow, { window: Window; scope: CleanupScope }>();
  readonly #preferences: PreferenceStore;
  readonly #attributesEnabled: boolean;
  readonly #report: (error: unknown) => void;

  constructor(
    preferences: PreferenceStore,
    attributesEnabled: boolean,
    report: (error: unknown) => void,
  ) {
    this.#preferences = preferences;
    this.#attributesEnabled = attributesEnabled;
    this.#report = report;
  }

  open(owner: MainWindow): void {
    const existing = this.#windows.get(owner);
    if (existing && !isDeadObject(existing.window) && !existing.window.closed) {
      existing.window.focus();
      return;
    }
    this.closeOwner(owner);
    const scope = new CleanupScope();
    try {
      const { window, unobserve } = openLiteratureWindow(owner, () => {
        if (this.#windows.get(owner)?.scope === scope) this.#retire(owner);
      });
      const entry = { window, scope };
      this.#windows.set(owner, entry);
      scope.add(unobserve);
      const isCurrent = (): boolean => this.#windows.get(owner) === entry && !scope.disposed;
      const mount = (): boolean => {
        if (!isCurrent() || window.document.documentURI !== LITERATURE_WINDOW_URI) return false;
        const document = window.document;
        if (document.readyState === 'loading') return false;
        const root = document.getElementById('zotero-neo-literature-table-root');
        if (!root) throw new Error('Literature table window root is unavailable');
        const language = neoCommandLanguage(this.#preferences, Zotero.locale ?? '');
        document.documentElement.lang = language;
        document.title = language === 'zh-CN' ? 'Neo 文献表格' : 'Neo Literature Table';
        const theme = new ThemeManager(window, this.#preferences);
        scope.add(() => theme.dispose());
        scope.add(theme.add(root));
        try {
          scope.add(
            mountLiteratureTable(
              root,
              createLiteratureTableHost(
                owner,
                this.#preferences,
                this.#attributesEnabled,
                isCurrent,
              ),
              language,
              this.#report,
            ),
          );
        } catch (error) {
          this.#report(error);
          root.textContent =
            language === 'zh-CN'
              ? '无法打开文献表格。请关闭窗口后重试。'
              : 'Could not open the literature table. Close the window and try again.';
        }
        return true;
      };
      if (!mount()) {
        const loaded = (): void => {
          try {
            if (mount()) window.removeEventListener('DOMContentLoaded', loaded);
          } catch (error) {
            this.#report(error);
            this.closeOwner(owner);
          }
        };
        scope.addEventListener(window, 'DOMContentLoaded', loaded);
      }
    } catch (error) {
      scope.dispose();
      this.closeOwner(owner);
      this.#report(error);
    }
  }

  #retire(owner: MainWindow): Window | undefined {
    const entry = this.#windows.get(owner);
    if (!entry) return undefined;
    this.#windows.delete(owner);
    entry.scope.dispose();
    return entry.window;
  }

  closeOwner(owner: MainWindow): void {
    const window = this.#retire(owner);
    if (window && !isDeadObject(window) && !window.closed) window.close();
  }

  dispose(): void {
    const failure = new CleanupFailure();
    for (const owner of this.#windows.keys()) failure.run(() => this.closeOwner(owner));
    failure.rethrow();
  }
}
