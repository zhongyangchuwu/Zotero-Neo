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
  const rootListeners = new Set<() => void>();
  const colors: Record<string, string> = { '--color-background': background };
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
    constructor(listener: () => void) {
      rootListeners.add(listener);
    }
    observe(): void {}
    disconnect(): void {
      disconnected = true;
      rootListeners.clear();
    }
  }
  const window = {
    document: { documentElement: {} },
    getComputedStyle() {
      return { getPropertyValue: (name: string) => colors[name] ?? '' };
    },
    matchMedia: () => media,
    MutationObserver: FakeMutationObserver,
  } as unknown as Window;
  return {
    window,
    mediaListeners,
    disconnected: () => disconnected,
    setColors(next: Record<string, string>) {
      Object.assign(colors, next);
      for (const listener of rootListeners) listener();
    },
  };
}

function contrast(background: string, foreground: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(background);
  const b = luminance(foreground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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

    manager.add(panel);
    expect(panel.attributes.get('data-zotero-neo-theme')).toBe('dark');
    manager.dispose();
  });

  it('keeps text readable on fallback surfaces, selections and semantic states in either mode', () => {
    const panel = root();
    for (const theme of ['light', 'dark'] as const) {
      applyTheme(panel, theme);
      for (const [surface, text] of [
        ['surface', 'text'],
        ['selected', 'selected-text'],
        ['accent', 'on-accent'],
        ['mode-normal', 'mode-normal-text'],
        ['mode-visual', 'mode-visual-text'],
        ['mode-insert', 'mode-insert-text'],
        ['status-success', 'status-success-text'],
        ['status-info', 'status-info-text'],
        ['status-error', 'status-error-text'],
      ]) {
        expect(
          contrast(
            panel.values.get(`--zotero-neo-${surface}`)!,
            panel.values.get(`--zotero-neo-${text}`)!,
          ),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('copies native chrome colors into embedded roots and updates them without a mode change', () => {
    const source = preferences('auto');
    const host = themeWindow('#ffffff', false);
    host.setColors({
      '--color-sidepane': '#f0f0f0',
      '--fill-primary': '#202020',
      '--color-quarternary-on-background': '#dddddd',
      '--color-accent': '#225588',
      '--color-accent-text': '#ffffff',
    });
    const manager = new ThemeManager(host.window, source);
    const embedded = root();
    manager.add(embedded);
    expect(embedded.values.get('--zotero-neo-elevated')).toBe('#f0f0f0');
    expect(embedded.values.get('--zotero-neo-text')).toBe('#202020');
    expect(embedded.values.get('--zotero-neo-selected')).toBe('#dddddd');
    expect(embedded.values.get('--zotero-neo-accent')).toBe('#225588');
    expect(embedded.values.get('--zotero-neo-on-accent')).toBe('#ffffff');
    host.setColors({
      '--color-sidepane': '#eeeeee',
      '--color-quarternary-on-background': '#cccccc',
    });
    expect(embedded.values.get('--zotero-neo-elevated')).toBe('#eeeeee');
    expect(embedded.values.get('--zotero-neo-selected')).toBe('#cccccc');
    manager.dispose();
    host.setColors({ '--color-sidepane': '#aaaaaa' });
    expect(embedded.values.get('--zotero-neo-elevated')).toBe('#eeeeee');
  });

  it('does not mix opposite-mode host surfaces or an incomplete accent foreground pair', () => {
    const source = preferences('dark');
    const host = themeWindow('#ffffff', false);
    host.setColors({ '--fill-primary': '#000000', '--color-accent': '#ffffff' });
    const manager = new ThemeManager(host.window, source);
    const panel = root();
    manager.add(panel);
    expect(cssColorIsDark(panel.values.get('--zotero-neo-surface')!)).toBe(true);
    expect(
      contrast(panel.values.get('--zotero-neo-surface')!, panel.values.get('--zotero-neo-text')!),
    ).toBeGreaterThanOrEqual(4.5);
    source.set('light');
    expect(
      contrast(
        panel.values.get('--zotero-neo-accent')!,
        panel.values.get('--zotero-neo-on-accent')!,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    manager.dispose();
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
    expect(cssColorIsDark(panel.values.get('--zotero-neo-surface')!)).toBe(false);

    source.set('dark');
    expect(panel.attributes.get('data-zotero-neo-theme')).toBe('dark');
    expect(cssColorIsDark(panel.values.get('--zotero-neo-surface')!)).toBe(true);

    manager.dispose();
    expect(source.listeners.size).toBe(0);
    expect(host.mediaListeners.size).toBe(0);
    expect(host.disconnected()).toBe(true);
  });
});
