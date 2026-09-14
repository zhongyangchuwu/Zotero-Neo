import type { KeyGuideEntry } from '../input/key-guide';
import { formatGuideKey, formatGuidePrefix } from '../input/key-guide';
import { THEME_VARS, type ThemeRoot } from './theme';

export interface KeyGuideThemeHost {
  add(root: ThemeRoot): () => void;
}

/** A non-interactive continuation panel; input remains owned by the existing matcher. */
export class KeyGuide {
  #element: HTMLElement | null = null;
  #document: Document | null = null;
  #themeCleanup: (() => void) | null = null;

  get visible(): boolean {
    return this.#element !== null;
  }

  show(
    document: Document,
    theme: KeyGuideThemeHost,
    prefix: string,
    entries: readonly KeyGuideEntry[],
    fontSizePx: number,
  ): void {
    if (!entries.length) {
      this.hide();
      return;
    }
    if (this.#document !== document) this.hide();
    if (!this.#element) {
      const element = document.createElement('section');
      element.id = 'zotero-neo-key-guide';
      element.setAttribute('aria-live', 'polite');
      element.style.cssText = `position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99998;min-width:260px;max-width:min(640px,calc(100vw - 32px));padding:12px 14px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:6px;box-shadow:0 10px 32px ${THEME_VARS.shadow};font:${fontSizePx}px/1.5 monospace;pointer-events:none;user-select:none`;
      (document.body ?? document.documentElement).appendChild(element);
      this.#element = element;
      this.#document = document;
      this.#themeCleanup = theme.add(element as ThemeRoot);
    }

    const element = this.#element;
    element.style.fontSize = `${fontSizePx}px`;
    element.replaceChildren();
    const title = document.createElement('div');
    title.textContent = formatGuidePrefix(prefix);
    title.style.cssText = `margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-weight:bold`;
    element.appendChild(title);

    const entriesRoot = document.createElement('div');
    entriesRoot.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:3px 16px;';
    for (const entry of entries) {
      const row = document.createElement('div');
      const key = document.createElement('span');
      key.textContent = formatGuideKey(entry.key);
      key.style.cssText = `display:inline-block;min-width:28px;margin-right:8px;color:${THEME_VARS.accent};font-weight:bold`;
      const label = document.createElement('span');
      label.textContent = entry.isGroup ? `+ ${entry.label}` : entry.label;
      row.append(key, label);
      entriesRoot.appendChild(row);
    }
    element.appendChild(entriesRoot);
  }

  hide(): void {
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#element?.remove();
    this.#element = null;
    this.#document = null;
  }
}
