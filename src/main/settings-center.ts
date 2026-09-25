import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { LANGUAGE_PREFERENCE_KEY } from '../core/preferences';
import { THEME_VARS, type ThemeManager } from '../ui/theme';
import type { InteractionAppearanceManager } from './interaction-appearance';
import { SettingsAdvanced } from './settings-advanced';
import { SettingsAppearance, type SettingsAppearanceState } from './settings-appearance';
import { SettingsInteraction } from './settings-interaction';
import { settingsLanguage, settingsText, type SettingsLanguage } from './settings-i18n';
import { SettingsKeybindings, type SettingsKeybindingsState } from './settings-keybindings';
import { SettingsReader } from './settings-reader';
import { settingsButton, setSettingsPressed } from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';
const SECTIONS = ['Appearance', 'Interaction', 'Reader', 'Keybindings', 'Advanced'] as const;
type SettingsSection = (typeof SECTIONS)[number];

interface SettingsPage {
  dispose(): void;
}

/** One Main-window-owned, centered Settings workspace. */
export class SettingsCenter {
  readonly #window: MainWindow;
  readonly #theme: ThemeManager;
  readonly #appearance: InteractionAppearanceManager;
  readonly #preferences: PreferenceStore;
  #panel: HTMLElement | null = null;
  #backdrop: HTMLElement | null = null;
  #heading: HTMLElement | null = null;
  #closeButton: HTMLButtonElement | null = null;
  #content: HTMLElement | null = null;
  #navigation: HTMLElement | null = null;
  #previousElement: Element | null = null;
  #themeCleanup: (() => void) | null = null;
  #activePage: SettingsPage | null = null;
  #mountedSection: SettingsSection | null = null;
  #mountedLanguage: SettingsLanguage | null = null;
  #listeners: Array<() => void> = [];
  #section: SettingsSection = 'Appearance';
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
  ) {
    this.#window = window;
    this.#theme = theme;
    this.#appearance = appearance;
    this.#preferences = preferences;
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
      this.#heading?.focus();
      return;
    }
    const doc = this.#window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const backdrop = create('div');
    backdrop.id = 'zotero-neo-settings-backdrop';
    backdrop.style.cssText = `position:fixed;inset:0;z-index:99996;background:${THEME_VARS.backdrop}`;
    const onBackdrop = (event: MouseEvent): void => {
      if (event.target === backdrop) this.close();
    };
    backdrop.addEventListener('click', onBackdrop);
    this.#listeners.push(() => backdrop.removeEventListener('click', onBackdrop));
    const panel = create('aside');
    panel.id = 'zotero-neo-settings-center';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Zotero Neo Settings');
    panel.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(820px,calc(100vw - 48px));height:min(760px,calc(100vh - 64px));box-sizing:border-box;z-index:99997;display:flex;flex-direction:column;overflow:hidden;color:${THEME_VARS.text};background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:10px;box-shadow:0 12px 40px ${THEME_VARS.shadow};font:inherit;line-height:1.5`;
    const header = create('header');
    header.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border}`;
    const heading = create('h2');
    heading.textContent = 'Zotero Neo Settings';
    heading.tabIndex = -1;
    heading.style.cssText = 'margin:0;font-size:1.15em;outline:none';
    const close = settingsButton(doc, 'Close', () => this.close(), this.#listeners);
    close.setAttribute('aria-label', 'Close Neo Settings');
    header.append(heading, close);

    const navigation = create('nav');
    navigation.setAttribute('aria-label', 'Settings sections');
    navigation.style.cssText = `display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:8px;border-bottom:1px solid ${THEME_VARS.border}`;
    for (const section of SECTIONS) {
      const button = settingsButton(
        doc,
        section,
        () => {
          this.#section = section;
          this.render();
        },
        this.#listeners,
      );
      button.dataset.section = section;
      button.style.cssText +=
        ';width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;padding:0.35em';
      navigation.append(button);
    }

    const languageCleanup = this.#preferences.observe?.(LANGUAGE_PREFERENCE_KEY, () =>
      this.render(true),
    );
    if (languageCleanup) this.#listeners.push(languageCleanup);

    const content = create('section');
    content.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:12px 14px';
    panel.append(header, navigation, content);
    this.#previousElement = doc.activeElement;
    this.#backdrop = backdrop;
    this.#panel = panel;
    this.#heading = heading;
    this.#closeButton = close;
    this.#navigation = navigation;
    this.#content = content;
    (doc.body ?? doc.documentElement).append(backdrop, panel);
    const removeBackdropTheme = this.#theme.add(backdrop);
    this.#themeCleanup = removeBackdropTheme;
    const removePanelTheme = this.#theme.add(panel);
    this.#themeCleanup = () => {
      removeBackdropTheme();
      removePanelTheme();
    };
    this.render();
    heading.focus();
  }

  close(): void {
    const panel = this.#panel;
    if (!panel) return;
    const restoreFocus = this.contains(this.#window.document.activeElement);
    this.#activePage?.dispose();
    this.#activePage = null;
    this.#mountedSection = null;
    this.#mountedLanguage = null;
    for (const remove of this.#listeners.splice(0)) remove();
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    panel.remove();
    this.#backdrop?.remove();
    this.#backdrop = null;
    this.#panel = null;
    this.#heading = null;
    this.#closeButton = null;
    this.#navigation = null;
    this.#content = null;
    if (restoreFocus && this.#previousElement?.isConnected) {
      try {
        (this.#previousElement as HTMLElement).focus();
      } catch {}
    }
    this.#previousElement = null;
  }

  private render(force = false): void {
    const content = this.#content;
    if (!content) return;
    const language = this.#language();
    this.#panel?.setAttribute('aria-label', settingsText(language, 'Zotero Neo Settings'));
    if (this.#heading) this.#heading.textContent = settingsText(language, 'Zotero Neo Settings');
    if (this.#closeButton) {
      this.#closeButton.textContent = settingsText(language, 'Close');
      this.#closeButton.setAttribute('aria-label', settingsText(language, 'Close Neo Settings'));
    }
    this.#navigation?.setAttribute('aria-label', settingsText(language, 'Settings sections'));
    for (const button of Array.from(this.#navigation?.children ?? [])) {
      const section = (button as HTMLElement).dataset.section as SettingsSection | undefined;
      if (!section) continue;
      const selected = section === this.#section;
      button.textContent = settingsText(language, section);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
      setSettingsPressed(button as HTMLButtonElement, selected);
    }
    if (!force && this.#mountedSection === this.#section && this.#mountedLanguage === language)
      return;
    this.#activePage?.dispose();
    this.#activePage = null;
    this.#mountedSection = this.#section;
    this.#mountedLanguage = language;
    content.replaceChildren();
    content.style.whiteSpace = '';
    if (this.#section === 'Appearance') {
      this.#activePage = new SettingsAppearance(
        this.#window,
        content,
        this.#preferences,
        this.#appearance,
        this.#appearanceState,
        language,
      );
      return;
    }
    if (this.#section === 'Interaction') {
      this.#activePage = new SettingsInteraction(
        this.#window,
        content,
        this.#preferences,
        language,
      );
      return;
    }
    if (this.#section === 'Reader') {
      this.#activePage = new SettingsReader(this.#window, content, this.#preferences, language);
      return;
    }
    if (this.#section === 'Keybindings') {
      this.#activePage = new SettingsKeybindings(
        this.#window,
        content,
        this.#preferences,
        this.#keybindingsState,
        language,
      );
      return;
    }
    this.#activePage = new SettingsAdvanced(this.#window, content, this.#preferences, language);
  }
}
