import type { BuiltinModuleRuntime } from '../core/module-runtime';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { LANGUAGE_PREFERENCE_KEY } from '../core/preferences';
import { CleanupFailure } from '../core/cleanup';
import { ZoteroLogger } from '../core/logging';
import { compositionOwnsKey } from '../input/composition';
import { asElement } from '../platform/dom';
import { mountNativeReactView } from '../platform/native-ui';
import type { ThemeManager } from '../ui/theme';
import { SETTINGS_BACKDROP_STYLE, SETTINGS_PANEL_STYLE } from '../ui/react/shells/main';
import type { NativeReactView } from '../ui/react/types';
import type { InteractionAppearanceManager } from './interaction-appearance';
import { SettingsAdvanced } from './settings-advanced';
import { SettingsAppearance, type SettingsAppearanceState } from './settings-appearance';
import { SettingsInteraction } from './settings-interaction';
import { settingsLanguage, settingsText, type SettingsLanguage } from './settings-i18n';
import { SettingsKeybindings, type SettingsKeybindingsState } from './settings-keybindings';
import { SettingsModules } from './settings-modules';
import { SettingsReader } from './settings-reader';
import type {
  SettingsPagePresentation,
  SettingsReactCommand,
  SettingsReactModel,
  SettingsSection,
} from './settings-react-model';

const H = 'http://www.w3.org/1999/xhtml';
const SECTIONS: readonly SettingsSection[] = [
  'Appearance',
  'Interaction',
  'Reader',
  'Keybindings',
  'Modules',
  'Advanced',
];
type ActivePage =
  | { readonly section: 'Appearance'; readonly controller: SettingsAppearance }
  | { readonly section: 'Interaction'; readonly controller: SettingsInteraction }
  | { readonly section: 'Reader'; readonly controller: SettingsReader }
  | { readonly section: 'Keybindings'; readonly controller: SettingsKeybindings }
  | { readonly section: 'Modules'; readonly controller: SettingsModules }
  | { readonly section: 'Advanced'; readonly controller: SettingsAdvanced };

/** One Main-window-owned React Settings workspace; page policies remain headless controllers. */
export class SettingsCenter {
  readonly #window: MainWindow;
  readonly #theme: ThemeManager;
  readonly #appearance: InteractionAppearanceManager;
  readonly #preferences: PreferenceStore;
  readonly #modules: BuiltinModuleRuntime;
  readonly #logger = new ZoteroLogger();
  #panel: HTMLElement | null = null;
  #backdrop: HTMLElement | null = null;
  #view: NativeReactView<SettingsReactModel> | null = null;
  #previousElement: Element | null = null;
  #themeCleanup: (() => void) | null = null;
  #activePage: ActivePage | null = null;
  #mountedLanguage: SettingsLanguage | null = null;
  #listeners: Array<() => void> = [];
  #section: SettingsSection = 'Appearance';
  #pageEpoch = 0;
  #viewEpoch = 0;
  #generation = 0;
  #composing = false;
  readonly #appearanceState: SettingsAppearanceState = {
    view: 'library',
    editingThemeId: null,
    paletteMode: 'light',
  };
  readonly #keybindingsState: SettingsKeybindingsState = { editor: null };

  constructor(
    window: MainWindow,
    theme: ThemeManager,
    appearance: InteractionAppearanceManager,
    preferences: PreferenceStore,
    modules: BuiltinModuleRuntime,
  ) {
    this.#window = window;
    this.#theme = theme;
    this.#appearance = appearance;
    this.#preferences = preferences;
    this.#modules = modules;
  }

  get open(): boolean {
    return this.#panel !== null;
  }
  get section(): SettingsSection {
    return this.#section;
  }
  contains(target: EventTarget | null): boolean {
    return !!target && !!this.#panel?.contains(target as Node);
  }
  #language(): SettingsLanguage {
    return settingsLanguage(
      this.#preferences,
      typeof Zotero === 'undefined' ? '' : (Zotero.locale ?? ''),
    );
  }

  openWorkspace(): void {
    if (this.#panel) {
      (this.#view?.getElement('heading') ?? this.#panel).focus();
      return;
    }
    const doc = this.#window.document;
    const backdrop = doc.createElementNS(H, 'div');
    backdrop.id = 'zotero-neo-settings-backdrop';
    backdrop.style.cssText = SETTINGS_BACKDROP_STYLE;
    const panel = doc.createElementNS(H, 'aside');
    panel.id = 'zotero-neo-settings-center';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.tabIndex = -1;
    panel.style.cssText = SETTINGS_PANEL_STYLE;
    this.#previousElement = doc.activeElement;
    this.#backdrop = backdrop;
    this.#panel = panel;
    const epoch = ++this.#viewEpoch;
    const listen = (
      target: EventTarget,
      type: string,
      listener: EventListener,
      capture = false,
    ): void => {
      target.addEventListener(type, listener, capture);
      this.#listeners.push(() => target.removeEventListener(type, listener, capture));
    };
    listen(backdrop, 'click', (event) => {
      if (event.target === backdrop) this.close();
    });
    listen(panel, 'compositionstart', () => {
      this.#composing = true;
    });
    listen(panel, 'compositionend', () => {
      this.#composing = false;
    });
    listen(panel, 'keydown', (event) => this.#keyDown(event as KeyboardEvent), true);
    // Let React/native defaults inside the owned root run, but not unrelated host commands.
    listen(panel, 'keydown', (event) => event.stopPropagation());
    const languageCleanup = this.#preferences.observe?.(LANGUAGE_PREFERENCE_KEY, () =>
      this.#render(true),
    );
    if (languageCleanup) this.#listeners.push(languageCleanup);
    (doc.body ?? doc.documentElement).append(backdrop, panel);
    const removeBackdropTheme = this.#theme.add(backdrop);
    const removePanelTheme = this.#theme.add(panel);
    this.#themeCleanup = () => {
      removeBackdropTheme();
      removePanelTheme();
    };
    this.#render();
    const language = this.#language();
    const current = (): boolean =>
      this.#panel === panel &&
      this.#viewEpoch === epoch &&
      panel.isConnected &&
      this.#window.document === doc;
    const view = mountNativeReactView<SettingsReactModel, SettingsReactCommand>({
      surface: 'settings',
      root: panel,
      model: this.#model(),
      dispatch: (command) => this.#dispatch(command),
      isCurrent: current,
      loadingText: language === 'zh-CN' ? '正在准备设置界面…' : 'Preparing Settings…',
      errorText:
        language === 'zh-CN'
          ? '无法打开设置界面。按 Escape 关闭。'
          : 'Could not load Settings. Press Escape to close.',
      onError: (error) => this.#logger.debug(`Settings renderer failed: ${String(error)}`),
    });
    this.#view = view;
    panel.focus();
    void view.ready.then(
      () => {
        if (current()) (view.getElement('heading') ?? panel).focus();
      },
      () => undefined,
    );
  }

  close(): void {
    const panel = this.#panel;
    if (!panel) return;
    const restore = this.contains(this.#window.document.activeElement);
    const previous = this.#previousElement;
    const page = this.#activePage;
    const view = this.#view;
    const backdrop = this.#backdrop;
    this.#panel = this.#backdrop = null;
    this.#view = null;
    this.#activePage = null;
    this.#previousElement = null;
    this.#mountedLanguage = null;
    this.#composing = false;
    this.#viewEpoch++;
    this.#pageEpoch++;
    const failure = new CleanupFailure();
    failure.run(() => page?.controller.dispose());
    failure.run(() => view?.dispose());
    for (const remove of this.#listeners.splice(0)) failure.run(remove);
    failure.run(() => this.#themeCleanup?.());
    this.#themeCleanup = null;
    failure.run(() => panel.remove());
    failure.run(() => backdrop?.remove());
    if (restore && previous?.isConnected) {
      try {
        (previous as HTMLElement).focus();
      } catch {
        /* A native focus target may retire with its document. */
      }
    }
    failure.rethrow();
  }

  #keyDown(event: KeyboardEvent): void {
    const panel = this.#panel;
    if (!panel || compositionOwnsKey(event, this.#composing)) return;
    const target = asElement(event.target);
    if (target?.closest('[data-neo-ui-key-scope="recorder"]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable: HTMLElement[] = [];
    for (const candidate of Array.from(
      panel.querySelectorAll(
        'button,input,select,textarea,summary,a[href],[tabindex],[contenteditable="true"]',
      ),
    )) {
      const element = asElement(candidate);
      if (!element) continue;
      const node = element as HTMLElement;
      if (
        node.tabIndex >= 0 &&
        !(node as HTMLButtonElement).disabled &&
        node.getClientRects().length > 0 &&
        this.#window.getComputedStyle(node)?.visibility !== 'hidden'
      )
        focusable.push(node);
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.#window.document.activeElement;
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    if (event.shiftKey && (active === first || !focusable.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !focusable.includes(active as HTMLElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  #render(force = false): void {
    if (!this.#panel) return;
    const language = this.#language();
    this.#panel.setAttribute('aria-label', settingsText(language, 'Zotero Neo Settings'));
    if (
      force ||
      !this.#activePage ||
      this.#activePage.section !== this.#section ||
      this.#mountedLanguage !== language
    ) {
      const epoch = ++this.#pageEpoch;
      const panel = this.#panel;
      const viewEpoch = this.#viewEpoch;
      const document = this.#window.document;
      this.#activePage?.controller.dispose();
      this.#activePage = null;
      this.#mountedLanguage = language;
      const changed = (): void => {
        if (this.#panel && this.#pageEpoch === epoch) this.#publish();
      };
      switch (this.#section) {
        case 'Appearance':
          this.#activePage = {
            section: 'Appearance',
            controller: new SettingsAppearance(
              this.#window,
              this.#preferences,
              this.#appearance,
              this.#appearanceState,
              language,
              changed,
            ),
          };
          break;
        case 'Interaction':
          this.#activePage = {
            section: 'Interaction',
            controller: new SettingsInteraction(this.#window, this.#preferences, language, changed),
          };
          break;
        case 'Reader':
          this.#activePage = {
            section: 'Reader',
            controller: new SettingsReader(
              this.#window,
              this.#preferences,
              language,
              changed,
              (provider) => {
                if (
                  this.#panel !== panel ||
                  this.#pageEpoch !== epoch ||
                  this.#viewEpoch !== viewEpoch ||
                  this.#window.document !== document
                )
                  return null;
                const input = this.#view?.getElement(`credential-${provider}`);
                return input?.localName === 'input' &&
                  (input as HTMLInputElement).type === 'password'
                  ? (input as HTMLInputElement)
                  : null;
              },
            ),
          };
          break;
        case 'Keybindings':
          this.#activePage = {
            section: 'Keybindings',
            controller: new SettingsKeybindings(
              this.#window,
              this.#preferences,
              this.#keybindingsState,
              language,
              changed,
            ),
          };
          break;
        case 'Modules':
          this.#activePage = {
            section: 'Modules',
            controller: new SettingsModules(
              this.#window,
              this.#preferences,
              this.#modules,
              language,
              changed,
            ),
          };
          break;
        case 'Advanced':
          this.#activePage = {
            section: 'Advanced',
            controller: new SettingsAdvanced(this.#window, this.#preferences, language, changed),
          };
          break;
      }
    }
    this.#publish();
  }

  #presentation(): SettingsPagePresentation {
    const page = this.#activePage;
    if (!page) throw new Error('Settings page is not active');
    switch (page.section) {
      case 'Appearance':
        return { kind: 'appearance', model: page.controller.model() };
      case 'Keybindings':
        return { kind: 'keybindings', model: page.controller.model() };
      case 'Reader':
        return { kind: 'reader', model: page.controller.model() };
      default:
        return { kind: 'form', model: page.controller.model() };
    }
  }

  #model(): SettingsReactModel {
    const language = this.#language();
    return {
      generation: ++this.#generation,
      language,
      title: settingsText(language, 'Zotero Neo Settings'),
      closeLabel: settingsText(language, 'Close Neo Settings'),
      navigationLabel: settingsText(language, 'Settings sections'),
      section: this.#section,
      sections: SECTIONS.map((id) => ({ id, label: settingsText(language, id) })),
      page: this.#presentation(),
    };
  }

  #publish(): void {
    if (this.#panel && this.#activePage && this.#view) this.#view.update(this.#model());
  }

  #dispatch(command: SettingsReactCommand): void {
    if (
      !this.#panel ||
      !command ||
      typeof command !== 'object' ||
      command.generation !== this.#generation
    )
      return;
    const page = this.#activePage;
    switch (command.type) {
      case 'close':
        this.close();
        return;
      case 'section':
        if (SECTIONS.includes(command.section)) {
          this.#section = command.section;
          this.#render();
        }
        return;
      case 'appearance':
        if (page?.section === 'Appearance') page.controller.dispatch(command.command);
        return;
      case 'keybindings':
        if (page?.section === 'Keybindings') page.controller.dispatch(command.command);
        return;
      case 'reader':
        if (page?.section === 'Reader') page.controller.dispatch(command.command);
        return;
      case 'form':
        if (
          page &&
          page.section !== 'Appearance' &&
          page.section !== 'Keybindings' &&
          page.section !== 'Reader'
        )
          page.controller.dispatch(command.command);
        return;
    }
  }
}
