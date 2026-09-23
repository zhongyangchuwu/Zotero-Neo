import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { THEME_VARS, type ThemeManager } from '../ui/theme';
import type { InteractionAppearanceManager } from './interaction-appearance';
import { SettingsAppearance } from './settings-appearance';

const H = 'http://www.w3.org/1999/xhtml';
const SECTIONS = ['Appearance', 'Interaction', 'Reader', 'Keybindings', 'Advanced'] as const;
type SettingsSection = (typeof SECTIONS)[number];

/** One Main-window-owned, modeless shell; only Appearance has content in this slice. */
export class SettingsCenter {
  readonly #window: MainWindow;
  readonly #theme: ThemeManager;
  readonly #appearance: InteractionAppearanceManager;
  readonly #preferences: PreferenceStore;
  #drawer: HTMLElement | null = null;
  #heading: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #navigation: HTMLElement | null = null;
  #previousElement: Element | null = null;
  #themeCleanup: (() => void) | null = null;
  #appearanceChild: SettingsAppearance | null = null;
  #listeners: Array<() => void> = [];
  #section: SettingsSection = 'Appearance';

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
    return this.#drawer !== null;
  }

  get section(): SettingsSection {
    return this.#section;
  }

  contains(target: EventTarget | null): boolean {
    return !!target && !!this.#drawer?.contains(target as Node);
  }

  openDrawer(): void {
    if (this.#drawer) {
      this.#heading?.focus();
      return;
    }
    const doc = this.#window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const drawer = create('aside');
    drawer.id = 'zotero-neo-settings-center';
    drawer.setAttribute('role', 'complementary');
    drawer.setAttribute('aria-label', 'Zotero Neo Settings');
    drawer.style.cssText = `position:fixed;top:48px;right:12px;bottom:48px;width:min(500px,50vw,calc(100vw - 24px));box-sizing:border-box;z-index:99997;display:flex;flex-direction:column;overflow:hidden;color:${THEME_VARS.text};background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 12px 40px ${THEME_VARS.shadow};font:13px/1.5 sans-serif`;

    const header = create('header');
    header.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border}`;
    const heading = create('h2');
    heading.textContent = 'Zotero Neo Settings';
    heading.tabIndex = -1;
    heading.style.cssText = 'margin:0;font-size:15px;outline:none';
    const close = create('button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close Neo Settings');
    close.style.cssText = `padding:4px 8px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:4px;cursor:pointer`;
    const onClose = (): void => this.close();
    close.addEventListener('click', onClose);
    this.#listeners.push(() => close.removeEventListener('click', onClose));
    header.append(heading, close);

    const navigation = create('nav');
    navigation.setAttribute('aria-label', 'Settings sections');
    navigation.style.cssText = `display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:8px;border-bottom:1px solid ${THEME_VARS.border}`;
    for (const section of SECTIONS) {
      const button = create('button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = section;
      button.dataset.section = section;
      button.style.cssText = `min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 3px;font-size:11px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:4px;cursor:pointer`;
      const onSelect = (): void => {
        this.#section = section;
        this.render();
      };
      button.addEventListener('click', onSelect);
      this.#listeners.push(() => button.removeEventListener('click', onSelect));
      navigation.append(button);
    }

    const content = create('section');
    content.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:12px 14px';
    drawer.append(header, navigation, content);
    this.#previousElement = doc.activeElement;
    this.#drawer = drawer;
    this.#heading = heading;
    this.#navigation = navigation;
    this.#content = content;
    (doc.body ?? doc.documentElement).append(drawer);
    this.#themeCleanup = this.#theme.add(drawer);
    this.render();
    heading.focus();
  }

  close(): void {
    const drawer = this.#drawer;
    if (!drawer) return;
    const restoreFocus = this.contains(this.#window.document.activeElement);
    this.#appearanceChild?.dispose();
    this.#appearanceChild = null;
    for (const remove of this.#listeners.splice(0)) remove();
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    drawer.remove();
    this.#drawer = null;
    this.#heading = null;
    this.#navigation = null;
    this.#content = null;
    if (restoreFocus && this.#previousElement?.isConnected) {
      try {
        (this.#previousElement as HTMLElement).focus();
      } catch {}
    }
    this.#previousElement = null;
  }

  private render(): void {
    const content = this.#content;
    if (!content) return;
    for (const button of Array.from(this.#navigation?.children ?? [])) {
      const selected = (button as HTMLElement).dataset.section === this.#section;
      button.setAttribute('aria-current', selected ? 'page' : 'false');
      const control = button as HTMLElement;
      control.style.background = selected ? THEME_VARS.selected : THEME_VARS.input;
      control.style.color = selected ? THEME_VARS.selectedText : THEME_VARS.text;
      control.style.borderColor = selected ? THEME_VARS.accent : THEME_VARS.border;
    }
    if (this.#section !== 'Appearance') {
      this.#appearanceChild?.dispose();
      this.#appearanceChild = null;
      content.style.display = 'block';
      content.style.overflow = 'auto';
      content.style.padding = '12px 14px';
      content.textContent = `${this.#section} settings have not migrated yet. Use Zotero Preferences for now.`;
      return;
    }
    if (this.#appearanceChild) return;
    content.replaceChildren();
    content.style.whiteSpace = '';
    this.#appearanceChild = new SettingsAppearance(
      this.#window,
      content,
      this.#preferences,
      this.#appearance,
    );
  }
}
