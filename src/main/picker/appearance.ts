import { CleanupScope } from '../../core/cleanup';
import type { PreferenceStore } from '../../core/preference-store';
import type { PreferenceReader } from '../../core/preferences';
import { readPickerProfileCss } from '../../platform/picker-profile-css';

export const PICKER_THEMES = ['classic', 'terminal', 'modern'] as const;
export type PickerTheme = (typeof PICKER_THEMES)[number];
export const PICKER_THEME_PREFERENCE_KEY = 'picker.theme';
export const PICKER_CUSTOM_CSS_PREFERENCE_KEY = 'picker.customCss';

const PICKER_ROOT = '.picker-root[data-picker-theme]';
// Reject resource functions even in custom properties, where they may remain escaped.
const RESOURCE_VALUE = /\\|(?:url|src|image-set|image)\s*\(/i;

type RuleContainer = CSSStyleSheet | CSSGroupingRule;

export function normalizePickerTheme(value: unknown): PickerTheme {
  return value === 'terminal' || value === 'modern' ? value : 'classic';
}

export function pickerTheme(preferences: PreferenceReader): PickerTheme {
  return normalizePickerTheme(preferences.get(PICKER_THEME_PREFERENCE_KEY, 'classic'));
}

export function pickerCustomCss(preferences: PreferenceReader): string {
  const value = preferences.get(PICKER_CUSTOM_CSS_PREFERENCE_KEY, '');
  return typeof value === 'string' ? value : '';
}

function scopeContainer(sheet: CSSStyleSheet): CSSGroupingRule | null {
  try {
    const index = sheet.insertRule(`@scope (${PICKER_ROOT}) {}`, 0);
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
      // On ESR intersect the parsed selector's subject with the Picker subtree. :where()
      // contributes no specificity; :is() safely keeps commas inside the selector list.
      const selector = scoped
        ? selectorText
        : `:is(${selectorText}):where(${PICKER_ROOT}, ${PICKER_ROOT} *)`;
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

/** Binds the preset and scoped custom stylesheet to one open Picker session. */
export function attachPickerAppearance(
  root: HTMLElement,
  preferences: PreferenceStore,
  reportError: (error: unknown) => void,
): () => void {
  const doc = root.ownerDocument;
  const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style') as HTMLStyleElement;
  style.id = 'neo-picker-custom-css';
  const cleanup = new CleanupScope();
  cleanup.add(() => {
    style.remove();
    delete root.dataset.pickerTheme;
  });
  let profileCss = '';
  let appliedCss = '';
  // Reflow can move the highlighted row out of view even though its identity has not changed.
  const revealSelection = (): void => {
    root.querySelector('.picker-row[selected]')?.scrollIntoView({ block: 'nearest' });
  };
  const refreshTheme = () => {
    root.dataset.pickerTheme = pickerTheme(preferences);
    revealSelection();
  };
  const refreshCss = () => {
    const css = pickerCustomCss(preferences).trim() || profileCss;
    if (css === appliedCss) return;
    try {
      applyCss(style, css);
      appliedCss = css;
      revealSelection();
    } catch (error) {
      reportError(error);
    }
  };
  try {
    const base = doc.getElementById('zotero-neo-native-react-style');
    if (base) base.after(style);
    else doc.documentElement.append(style);
    refreshTheme();
    for (const [key, refresh] of [
      [PICKER_THEME_PREFERENCE_KEY, refreshTheme],
      [PICKER_CUSTOM_CSS_PREFERENCE_KEY, refreshCss],
    ] as const) {
      const stop = preferences.observe?.(key, refresh);
      if (stop) cleanup.add(stop);
    }
    refreshCss();
    void readPickerProfileCss()
      .then((css) => {
        if (cleanup.disposed) return;
        profileCss = css;
        refreshCss();
      })
      .catch((error: unknown) => {
        if (!cleanup.disposed) reportError(error);
      });
  } catch (error) {
    cleanup.dispose();
    reportError(error);
  }
  return () => cleanup.dispose();
}
