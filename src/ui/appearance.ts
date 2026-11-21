import { CleanupScope } from '../core/cleanup';
import {
  APPEARANCE_CUSTOM_CSS_KEY,
  APPEARANCE_PRESET_KEY,
  appearanceCustomCss,
  appearancePreset,
} from '../core/appearance-preferences';
import { ZoteroLogger } from '../core/logging';
import { readAppearanceProfileCss } from '../platform/appearance-profile-css';
import { isDeadObject } from '../platform/cross-compartment';
import { NEO_APPEARANCE_CSS, NEO_APPEARANCE_ROOT, NEO_CUSTOM_STYLE_ID } from './appearance-styles';
import type { ThemePreferenceSource, ThemeRoot } from './theme';

const HTML = 'http://www.w3.org/1999/xhtml';
const documents = new WeakMap<Document, DocumentAppearance>();
// Reject resource functions even in custom properties, where they may remain escaped.
const RESOURCE_VALUE = /\\|(?:url|src|image-set|image)\s*\(/i;

type RuleContainer = CSSStyleSheet | CSSGroupingRule;

function scopeContainer(sheet: CSSStyleSheet): CSSGroupingRule | null {
  try {
    const index = sheet.insertRule(`@scope (${NEO_APPEARANCE_ROOT}) {}`, 0);
    const scope = sheet.cssRules[index];
    if (scope && 'insertRule' in scope) return scope as CSSGroupingRule;
    sheet.deleteRule(index);
  } catch {
    // Zotero 10's Firefox ESR does not have @scope enabled.
  }
  return null;
}

function insertRule(target: RuleContainer, text: string): CSSRule | undefined {
  try {
    return target.cssRules[target.insertRule(text, target.cssRules.length)];
  } catch {
    // A rule unsupported in the destination context never becomes live.
    return undefined;
  }
}

function copyRules(source: CSSRuleList, target: RuleContainer, scoped: boolean): void {
  for (let index = 0; index < source.length; index += 1) {
    const rule = source[index]!;
    if (rule.type === rule.STYLE_RULE) {
      const { selectorText, style } = rule as CSSStyleRule;
      for (let i = style.length - 1; i >= 0; i -= 1) {
        const property = style.item(i);
        if (RESOURCE_VALUE.test(style.getPropertyValue(property))) style.removeProperty(property);
      }
      if (!style.length) continue;
      // On ESR, intersect the parsed selector's subject with an explicitly owned Neo subtree.
      // :where() contributes no specificity; :is() preserves the parsed selector list.
      const selector = scoped
        ? selectorText
        : `:is(${selectorText}):where(${NEO_APPEARANCE_ROOT}, ${NEO_APPEARANCE_ROOT} *)`;
      insertRule(target, `${selector} { ${style.cssText} }`);
    } else if (rule.type === rule.MEDIA_RULE || rule.type === rule.SUPPORTS_RULE) {
      const group = rule as CSSMediaRule | CSSSupportsRule;
      const header =
        'media' in group ? `@media ${group.media.mediaText}` : `@supports ${group.conditionText}`;
      const child = insertRule(target, `${header} {}`);
      if (child && 'insertRule' in child)
        copyRules(group.cssRules, child as CSSGroupingRule, scoped);
    }
  }
}

function applyCss(style: HTMLStyleElement, css: string): void {
  const target = style.sheet;
  if (!target) return;
  while (target.cssRules.length) target.deleteRule(target.cssRules.length - 1);
  if (!css) return;

  const view = style.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const Sheet = view?.CSSStyleSheet;
  if (typeof Sheet?.prototype.replaceSync !== 'function') return;

  // An unadopted constructable sheet parses without applying rules and discards @import.
  const source = new Sheet();
  source.replaceSync(css);
  const scope = scopeContainer(target);
  copyRules(source.cssRules, scope ?? target, scope !== null);
}

/** One shared stylesheet pair and one preference subscription per owner document. */
class DocumentAppearance {
  readonly #roots = new Map<ThemeRoot, (() => void) | undefined>();
  readonly #cleanup = new CleanupScope();
  readonly #custom: HTMLStyleElement;
  #profileCss = '';
  #profileRead: Promise<void> | null = null;
  #appliedCss = '';

  constructor(
    document: Document,
    readonly preferences: ThemePreferenceSource,
  ) {
    const base = document.createElementNS(HTML, 'style');
    base.textContent = NEO_APPEARANCE_CSS;
    this.#custom = document.createElementNS(HTML, 'style') as HTMLStyleElement;
    this.#custom.id = NEO_CUSTOM_STYLE_ID;
    document.documentElement.append(base, this.#custom);
    this.#cleanup.add(() => documents.delete(document));
    this.#cleanup.add(() => {
      if (!isDeadObject(base)) base.remove();
    });
    this.#cleanup.add(() => {
      if (!isDeadObject(this.#custom)) this.#custom.remove();
    });
    try {
      const stopPreset = preferences.observe?.(APPEARANCE_PRESET_KEY, () => this.#updatePreset());
      if (stopPreset) this.#cleanup.add(stopPreset);
      const stopCss = preferences.observe?.(APPEARANCE_CUSTOM_CSS_KEY, () => this.#refreshCss());
      if (stopCss) this.#cleanup.add(stopCss);
    } catch (error) {
      this.#cleanup.dispose();
      throw error;
    }
  }

  add(root: ThemeRoot, changed?: () => void): () => void {
    this.#roots.set(root, changed);
    this.#setPreset(root, appearancePreset(this.preferences));
    this.#refreshCss();
    return () => {
      if (!this.#roots.delete(root)) return;
      try {
        if (isDeadObject(root)) return;
        root.removeAttribute('data-zotero-neo-preset');
        if (root.classList.contains('picker-root')) root.removeAttribute('data-picker-theme');
      } finally {
        if (!this.#roots.size) this.#cleanup.dispose();
      }
    };
  }

  #setPreset(root: ThemeRoot, preset: string): void {
    root.setAttribute('data-zotero-neo-preset', preset);
    if (root.classList.contains('picker-root')) root.setAttribute('data-picker-theme', preset);
  }

  #updatePreset(): void {
    const preset = appearancePreset(this.preferences);
    for (const root of this.#roots.keys()) {
      if (!isDeadObject(root)) this.#setPreset(root, preset);
    }
    this.#notify();
  }

  #notify(): void {
    for (const [root, changed] of this.#roots) {
      if (changed && !isDeadObject(root)) changed();
    }
  }

  #refreshCss(): void {
    const css = appearanceCustomCss(this.preferences).trim();
    this.#apply(css || this.#profileCss);
    if (css || this.#profileRead) return;
    // Coalesce mounts in the same document; never prefer a late file read to a saved value.
    this.#profileRead = readAppearanceProfileCss()
      .then((profileCss) => {
        if (this.#cleanup.disposed) return;
        this.#profileCss = profileCss;
        this.#apply(appearanceCustomCss(this.preferences).trim() || profileCss);
      })
      .catch((error: unknown) => {
        if (!this.#cleanup.disposed) this.#report(error);
      })
      .finally(() => {
        this.#profileRead = null;
      });
  }

  #apply(css: string): void {
    if (css === this.#appliedCss || isDeadObject(this.#custom)) return;
    try {
      applyCss(this.#custom, css);
      this.#appliedCss = css;
      this.#notify();
    } catch (error) {
      this.#report(error);
    }
  }

  #report(error: unknown): void {
    new ZoteroLogger().debug(`Neo appearance CSS: ${String(error)}`);
  }
}

/** Register only roots owned by Neo; the containing document may belong to Zotero. */
export function attachNeoAppearance(
  root: ThemeRoot,
  preferences: ThemePreferenceSource,
  changed?: () => void,
): () => void {
  const document = root.ownerDocument;
  let appearance = documents.get(document);
  if (!appearance) {
    appearance = new DocumentAppearance(document, preferences);
    documents.set(document, appearance);
  }
  return appearance.add(root, changed);
}
