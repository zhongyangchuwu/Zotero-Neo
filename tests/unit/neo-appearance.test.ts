// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_CUSTOM_CSS_KEY,
  APPEARANCE_PRESET_KEY,
} from '../../src/core/appearance-preferences';
import { readAppearanceProfileCss } from '../../src/platform/appearance-profile-css';
import { PICKER_REACT_CSS } from '../../src/ui/react/surfaces/picker-styles';
import {
  APPEARANCE_PREFERENCE_KEY,
  ThemeManager,
  type ThemePreferenceSource,
} from '../../src/ui/theme';

vi.mock('../../src/platform/appearance-profile-css', () => ({ readAppearanceProfileCss: vi.fn() }));

function fixture() {
  const values = new Map<string, string>();
  const observers = new Map<string, Set<() => void>>();
  const preferences: ThemePreferenceSource = {
    get: ((key: string, fallback: string | number | boolean) =>
      values.get(key) ?? fallback) as ThemePreferenceSource['get'],
    observe(key, changed) {
      const set = observers.get(key) ?? new Set();
      observers.set(key, set);
      set.add(changed);
      return () => set.delete(changed);
    },
  };
  const theme = new ThemeManager(window, preferences);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const pdf = frame.contentDocument!;
  const mount = (doc: Document, className: string) => {
    const root = doc.createElement('section');
    root.className = `neo-appearance ${className}`;
    doc.body.append(root);
    return { root, close: theme.add(root) };
  };
  return {
    pdf,
    mount,
    observers,
    dispose() {
      theme.dispose();
      frame.remove();
    },
    set(key: string, value: string) {
      values.set(key, value);
      for (const changed of observers.get(key) ?? []) changed();
    },
  };
}

const computed = (root: HTMLElement) => root.ownerDocument.defaultView!.getComputedStyle(root)!;
const value = (root: HTMLElement, name: string) => computed(root).getPropertyValue(name).trim();

describe('Neo chrome appearance', () => {
  beforeEach(() => {
    vi.mocked(readAppearanceProfileCss).mockResolvedValue('');
    // jsdom parses CSSOM rules but lacks constructable sheet replacement. Parse as a separate sheet.
    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      configurable: true,
      value(this: CSSStyleSheet, css: string) {
        const parser = document.createElement('style');
        parser.textContent = css;
        document.head.append(parser);
        try {
          for (const input of parser.sheet!.cssRules) {
            const rule = this.cssRules[this.insertRule(input.cssText, this.cssRules.length)]!;
            Object.assign(rule, {
              STYLE_RULE: CSSRule.STYLE_RULE,
              MEDIA_RULE: CSSRule.MEDIA_RULE,
              SUPPORTS_RULE: CSSRule.SUPPORTS_RULE,
            });
            if (rule.type === CSSRule.STYLE_RULE) {
              const { style } = rule as CSSStyleRule;
              Object.assign(style, { item: (index: number) => style[index] ?? '' });
            }
          }
        } finally {
          parser.remove();
        }
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(CSSStyleSheet.prototype, 'replaceSync');
    document.body.replaceChildren();
    document.head.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('updates the Picker token aliases and independent chrome and PDF surfaces without remounting', () => {
    const test = fixture();
    try {
      const pickerStyles = document.createElement('style');
      pickerStyles.textContent = PICKER_REACT_CSS;
      document.head.append(pickerStyles);
      test.set(APPEARANCE_PREFERENCE_KEY, 'light');
      const { root: picker } = test.mount(document, 'picker-root');
      const { root: settings } = test.mount(document, 'neo-settings');
      const { root: comment } = test.mount(test.pdf, 'neo-reader-overlay');

      test.set(APPEARANCE_PRESET_KEY, 'terminal');
      for (const root of [picker, settings, comment]) {
        expect(root.dataset.zoteroNeoPreset).toBe('terminal');
        expect(root.dataset.zoteroNeoTheme).toBe('light');
        expect(value(root, '--neo-bg')).toBe('#f8fafc');
        expect(value(root, '--neo-radius')).toBe('0px');
        expect(value(root, '--neo-divider-width')).toBe('1px');
      }
      expect(picker.dataset.pickerTheme).toBe('terminal');
      expect(value(picker, '--picker-bg')).toBe('var(--neo-surface)');
      expect(value(picker, '--picker-accent')).toBe('var(--neo-accent)');

      test.set(APPEARANCE_PREFERENCE_KEY, 'dark');
      expect(comment.dataset.zoteroNeoTheme).toBe('dark');
      expect(value(comment, '--neo-bg')).toBe('#111318');
      expect(value(picker, '--neo-accent')).toBe('#68e4d5');
      test.set(APPEARANCE_PRESET_KEY, 'modern');
      expect(picker.dataset.pickerTheme).toBe('modern');
      expect(value(settings, '--neo-radius')).toBe('18px');
    } finally {
      test.dispose();
    }
  });

  it('applies CSS edits to existing panels without reaching a neighboring toolbar or the PDF paper', () => {
    const test = fixture();
    try {
      test.set(APPEARANCE_PRESET_KEY, 'terminal');
      const picker = test.mount(document, 'picker-root');
      const { root: extensions } = test.mount(document, 'neo-extensions');
      const { root: selection } = test.mount(test.pdf, 'neo-reader-overlay');
      const toolbar = document.createElement('div');
      const page = test.pdf.createElement('canvas');
      document.body.append(toolbar);
      test.pdf.body.append(page);
      for (const root of [extensions, selection]) {
        const button = root.ownerDocument.createElement('div');
        button.className = 'shared-target';
        root.append(button);
      }
      toolbar.className = page.className = 'shared-target';
      const nativeBackground = computed(toolbar).backgroundColor;
      const paperBackground = computed(page).backgroundColor;
      test.set(
        APPEARANCE_CUSTOM_CSS_KEY,
        `.neo-appearance { --neo-accent: #1557a2; }
         .picker-root[data-picker-theme="terminal"] { --picker-row-height: 30px; }
         .shared-target { background-color: rgb(11, 22, 33); background-image: url("https://example.invalid/a.png"); }`,
      );
      for (const root of [picker.root, extensions, selection]) {
        expect(value(root, '--neo-accent')).toBe('#1557a2');
      }
      expect(value(picker.root, '--picker-row-height')).toBe('30px');
      for (const root of [extensions, selection]) {
        const button = root.firstElementChild as HTMLElement;
        expect(computed(button).backgroundColor).toBe('rgb(11, 22, 33)');
        expect(computed(button).backgroundImage).toBe('');
      }
      expect(computed(toolbar).backgroundColor).toBe(nativeBackground);
      expect(computed(page).backgroundColor).toBe(paperBackground);
      picker.close();
      test.set(APPEARANCE_CUSTOM_CSS_KEY, '.neo-appearance { --neo-accent: #a02166; }');
      // jsdom caches iframe styles across CSSOM mutations until the document itself changes.
      test.pdf.body.append(test.pdf.createTextNode(''));
      expect(value(picker.root, '--neo-accent')).toBe('');
      expect(value(extensions, '--neo-accent')).toBe('#a02166');
      expect(value(selection, '--neo-accent')).toBe('#a02166');
    } finally {
      test.dispose();
    }
  });

  it('does not let a late file read replace saved CSS, and restores the file when saved CSS clears', async () => {
    const test = fixture();
    try {
      const { promise, resolve } = Promise.withResolvers<string>();
      vi.mocked(readAppearanceProfileCss).mockReturnValueOnce(promise);
      const { root } = test.mount(document, 'neo-settings');
      test.set(APPEARANCE_CUSTOM_CSS_KEY, '.neo-appearance { --neo-accent: #123456; }');
      resolve('.neo-appearance { --neo-accent: #987654; }');
      await promise;
      expect(value(root, '--neo-accent')).toBe('#123456');
      test.set(APPEARANCE_CUSTOM_CSS_KEY, '  ');
      expect(value(root, '--neo-accent')).toBe('#987654');
    } finally {
      test.dispose();
    }
  });

  it('retires a destroyed PDF document without disabling edits in a remaining document', () => {
    const test = fixture();
    try {
      const { root: settings } = test.mount(document, 'neo-settings');
      const { root: selection, close } = test.mount(test.pdf, 'neo-reader-overlay');
      vi.stubGlobal('Components', {
        utils: { isDeadWrapper: (value: object) => value === selection },
      });
      close();
      expect(test.observers.get(APPEARANCE_PRESET_KEY)?.size).toBe(1);
      test.set(APPEARANCE_PRESET_KEY, 'terminal');
      expect(settings.dataset.zoteroNeoPreset).toBe('terminal');
    } finally {
      test.dispose();
    }
  });
});
