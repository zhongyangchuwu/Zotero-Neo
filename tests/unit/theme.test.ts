import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_PREFERENCE_KEY,
  ThemeManager,
  applyTheme,
  appearanceModeFromPreferences,
  cssColorIsDark,
  resolveThemeFromSignals,
  type AppearanceMode,
  type ThemePreferenceSource,
  type ThemeRoot,
} from '../../src/ui/theme';

function preferences(initial: AppearanceMode | string): ThemePreferenceSource & {
  set(value: string): void;
  listeners: Set<() => void>;
} {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    listeners,
    get: ((_key: string, fallback: boolean | number | string) =>
      value || fallback) as ThemePreferenceSource['get'],
    set(next: string): void {
      value = next;
      for (const listener of listeners) listener();
    },
    observe(key: string, listener: () => void): () => void {
      expect(key).toBe(APPEARANCE_PREFERENCE_KEY);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function root(): ThemeRoot & { attributes: Map<string, string>; values: Map<string, string> } {
  const attributes = new Map<string, string>();
  const values = new Map<string, string>();
  return {
    attributes,
    values,
    getAttribute(name: string): string | null {
      return attributes.get(name) ?? null;
    },
    setAttribute(name: string, value: string): void {
      attributes.set(name, value);
    },
    style: {
      colorScheme: '',
      getPropertyValue(name: string): string {
        return values.get(name) ?? '';
      },
      setProperty(name: string, value: string): void {
        values.set(name, value);
      },
    } as unknown as CSSStyleDeclaration,
  } as unknown as ThemeRoot & { attributes: Map<string, string>; values: Map<string, string> };
}

function themeWindow(background: string, matches: boolean) {
  const mediaListeners = new Set<() => void>();
  let disconnected = false;
  const media = {
    matches,
    addEventListener(_type: string, listener: () => void): void {
      mediaListeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void): void {
      mediaListeners.delete(listener);
    },
  };
  class FakeMutationObserver {
    constructor(_listener: () => void) {}
    observe(): void {}
    disconnect(): void {
      disconnected = true;
    }
  }
  const window = {
    document: { documentElement: {} },
    getComputedStyle() {
      return { getPropertyValue: () => background };
    },
    matchMedia: () => media,
    MutationObserver: FakeMutationObserver,
  } as unknown as Window;
  return { window, mediaListeners, disconnected: () => disconnected };
}

describe('appearance theme contract', () => {
  it('normalizes missing and invalid preference values to auto', () => {
    expect(appearanceModeFromPreferences(preferences('auto'))).toBe('auto');
    expect(appearanceModeFromPreferences(preferences('light'))).toBe('light');
    expect(appearanceModeFromPreferences(preferences('dark'))).toBe('dark');
    expect(appearanceModeFromPreferences(preferences('sepia'))).toBe('auto');
  });

  it('reads Zotero background colors before the media-query fallback', () => {
    expect(cssColorIsDark('#1e1e1e')).toBe(true);
    expect(cssColorIsDark('rgb(255, 255, 255)')).toBe(false);
    expect(cssColorIsDark('not-a-color')).toBeNull();
    expect(resolveThemeFromSignals('auto', '#fff', true)).toBe('light');
    expect(resolveThemeFromSignals('auto', '#1e1e1e', false)).toBe('dark');
    expect(resolveThemeFromSignals('auto', '', true)).toBe('dark');
    expect(resolveThemeFromSignals('light', '#1e1e1e', true)).toBe('light');
  });
  it('keeps theming available when optional host subscriptions fail', () => {
    const source = preferences('dark');
    source.observe = () => {
      throw new Error('observer unavailable');
    };
    const host = themeWindow('', false);
    const manager = new ThemeManager(host.window, source);
    const panel = root();

    expect(() => manager.add(panel)).not.toThrow();
    expect(panel.attributes.get('data-zotero-neo-theme')).toBe('dark');
    manager.dispose();
  });

  it('provides paired semantic surfaces and foregrounds for modes and statuses', () => {
    const panel = root();

    applyTheme(panel, 'light');
    expect(panel.values.get('--zotero-neo-mode-visual')).toBe('#e8f5e9');
    expect(panel.values.get('--zotero-neo-mode-visual-text')).toBe('#14532d');
    expect(panel.values.get('--zotero-neo-mode-insert')).toBe('#fff8e1');
    expect(panel.values.get('--zotero-neo-mode-insert-text')).toBe('#713f12');
    expect(panel.values.get('--zotero-neo-item-selection')).toBe('#7c3aed');
    expect(panel.values.get('--zotero-neo-item-visual')).toBe('#16a34a');
    expect(panel.values.get('--zotero-neo-status-success')).toBe('#dcfce7');
    expect(panel.values.get('--zotero-neo-status-success-text')).toBe('#166534');
    expect(panel.values.get('--zotero-neo-status-info')).toBe('#dbeafe');
    expect(panel.values.get('--zotero-neo-status-info-text')).toBe('#1e40af');
    expect(panel.values.get('--zotero-neo-status-error')).toBe('#fee2e2');
    expect(panel.values.get('--zotero-neo-status-error-text')).toBe('#991b1b');

    applyTheme(panel, 'dark');
    expect(panel.values.get('--zotero-neo-mode-visual')).toBe('#1a3020');
    expect(panel.values.get('--zotero-neo-mode-visual-text')).toBe('#dcfce7');
    expect(panel.values.get('--zotero-neo-mode-insert')).toBe('#332800');
    expect(panel.values.get('--zotero-neo-mode-insert-text')).toBe('#fef3c7');
    expect(panel.values.get('--zotero-neo-item-selection')).toBe('#a78bfa');
    expect(panel.values.get('--zotero-neo-item-visual')).toBe('#4ade80');
    expect(panel.values.get('--zotero-neo-status-success')).toBe('#16301f');
    expect(panel.values.get('--zotero-neo-status-success-text')).toBe('#bbf7d0');
    expect(panel.values.get('--zotero-neo-status-info')).toBe('#172554');
    expect(panel.values.get('--zotero-neo-status-info-text')).toBe('#dbeafe');
    expect(panel.values.get('--zotero-neo-status-error')).toBe('#3f1d1d');
    expect(panel.values.get('--zotero-neo-status-error-text')).toBe('#fecaca');
  });

  it('notifies live consumers only when the resolved theme changes', () => {
    const source = preferences('light');
    const host = themeWindow('', false);
    const manager = new ThemeManager(host.window, source);
    const themes: string[] = [];
    const stop = manager.observe((theme) => themes.push(theme));

    source.set('dark');
    source.set('dark');
    stop();
    source.set('light');

    expect(themes).toEqual(['dark']);
    manager.dispose();
  });

  it('updates existing roots in place and detaches live listeners', () => {
    const source = preferences('auto');
    const host = themeWindow('#fff', false);
    const manager = new ThemeManager(host.window, source);
    const panel = root();

    manager.add(panel);
    expect(panel.attributes.get('data-zotero-neo-theme')).toBe('light');
    expect(panel.values.get('--zotero-neo-surface')).toBe('#ffffff');

    source.set('dark');
    expect(panel.attributes.get('data-zotero-neo-theme')).toBe('dark');
    expect(panel.values.get('--zotero-neo-surface')).toBe('#1e1e1e');

    manager.dispose();
    expect(source.listeners.size).toBe(0);
    expect(host.mediaListeners.size).toBe(0);
    expect(host.disconnected()).toBe(true);
  });
});
