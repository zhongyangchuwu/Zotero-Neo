import { describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY as PRESET,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY as CUSTOM,
  serializeCustomInteractionThemes,
} from '../../src/main/interaction-appearance';
import {
  bindLegacyInteractionThemeSelect,
  legacyInteractionThemeSelection,
} from '../../src/preferences/interaction-theme';

class MenuElement {
  value = '';
  readonly children: MenuElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  constructor(
    readonly tag: string,
    readonly parent: MenuElement | null = null,
  ) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }
  querySelector(name: string): MenuElement | null {
    return this.children.find((child) => child.tag === name) ?? null;
  }
  append(child: MenuElement): void {
    this.children.push(child);
  }
  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parent?.children.splice(index, 1);
  }
  addEventListener(name: string, callback: () => void): void {
    this.listeners.set(name, callback);
  }
  removeEventListener(name: string): void {
    this.listeners.delete(name);
  }
  fire(name: string): void {
    this.listeners.get(name)?.();
  }
}

const theme = {
  id: 'custom:study',
  name: 'Study',
  version: 2 as const,
  light: {
    black: '#202020',
    red: '#AA0000',
    green: '#00FF00',
    yellow: '#FF0000',
    blue: '#0000AA',
    magenta: '#AA00AA',
    cyan: '#00AAAA',
    white: '#FAFAFA',
  },
  dark: {
    black: '#161616',
    red: '#FF2222',
    green: '#00FFFF',
    yellow: '#FF00FF',
    blue: '#2222FF',
    magenta: '#AA00AA',
    cyan: '#00AAAA',
    white: '#F0F0F0',
  },
};

function setup() {
  const values = new Map<string, string>([
    [PRESET, theme.id],
    [CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [theme] })],
  ]);
  const listeners = new Map<string, Set<() => void>>();
  const writes: Array<[string, string]> = [];
  const preferences: PreferenceStore = {
    has: (key) => values.has(key),
    get: ((_key: string, fallback: string) =>
      values.get(_key) ?? fallback) as PreferenceStore['get'],
    set: (key, value) => {
      writes.push([key, String(value)]);
      values.set(key, String(value));
      for (const listener of listeners.get(key) ?? []) listener();
    },
    observe: (key, listener) => {
      const group = listeners.get(key) ?? new Set();
      group.add(listener);
      listeners.set(key, group);
      return () => group.delete(listener);
    },
  };
  const select = new MenuElement('menulist');
  const popup = new MenuElement('menupopup', select);
  select.append(popup);
  const doc = {
    createElementNS: (_ns: string, tag: string) => new MenuElement(tag, popup),
  } as unknown as Document;
  return { preferences, select, popup, doc, writes, values, listeners };
}

describe('legacy interaction appearance selector', () => {
  it('identifies active custom themes by name, with invalid IDs falling back', () => {
    const test = setup();
    expect(legacyInteractionThemeSelection(test.preferences)).toEqual({
      value: theme.id,
      customLabel: 'Custom: Study',
    });
    test.values.set(PRESET, 'missing');
    expect(legacyInteractionThemeSelection(test.preferences)).toEqual({
      value: 'zotero',
      customLabel: 'Zotero',
    });
  });

  it('displays modern built-in themes without rewriting the legacy menu preference', () => {
    const test = setup();
    test.values.set(PRESET, 'gruvbox');
    const dispose = bindLegacyInteractionThemeSelect(
      test.select as never,
      test.doc,
      test.preferences,
      vi.fn(),
    );
    expect(test.select.value).toBe('gruvbox');
    expect(test.popup.children[0]?.getAttribute('label')).toBe('Gruvbox');
    expect(test.writes).toEqual([]);
    dispose();
  });

  it('selects a temporary custom menu item and still switches built-ins', () => {
    const test = setup();
    const onBuiltIn = vi.fn((id: string) => test.preferences.set(PRESET, id));
    const dispose = bindLegacyInteractionThemeSelect(
      test.select as never,
      test.doc,
      test.preferences,
      onBuiltIn,
    );
    expect(test.select.value).toBe(theme.id);
    expect(test.popup.children[0]?.getAttribute('label')).toBe('Custom: Study');
    test.select.fire('command');
    expect(onBuiltIn).not.toHaveBeenCalled();
    test.select.value = 'soft-academic';
    test.select.fire('command');
    expect(test.writes).toEqual([[PRESET, 'soft-academic']]);
    expect(test.select.value).toBe('soft-academic');
    expect(test.popup.children).toEqual([]);
    test.preferences.set(PRESET, theme.id);
    expect(test.popup.children[0]?.getAttribute('label')).toBe('Custom: Study');
    dispose();
    expect(test.select.listeners.size).toBe(0);
    expect([...test.listeners.values()].every((group) => group.size === 0)).toBe(true);
  });
});
