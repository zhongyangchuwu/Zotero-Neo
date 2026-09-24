import { describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY as PRESET,
  INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY as WEIGHT,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY as WIDTH,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY as CUSTOM,
  serializeCustomInteractionThemes,
} from '../../src/main/interaction-appearance';
import {
  bindLegacyInteractionMarkerWidthSelect,
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
  const values = new Map<string, boolean | number | string>([
    [PRESET, theme.id],
    [CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [theme] })],
  ]);
  const listeners = new Map<string, Set<() => void>>();
  const writes: Array<[string, boolean | number | string]> = [];
  const preferences: PreferenceStore = {
    has: (key) => values.has(key),
    get: ((key: string, fallback: boolean | number | string) =>
      values.get(key) ?? fallback) as PreferenceStore['get'],
    set: (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
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
      customLabel: null,
    });
  });

  it('projects removed built-ins without rewriting their persisted IDs', () => {
    const test = setup();
    const dispose = bindLegacyInteractionThemeSelect(
      test.select as never,
      test.doc,
      test.preferences,
      vi.fn(),
    );
    for (const [legacy, current] of [
      ['primer-neutral', 'zotero'],
      ['soft-academic', 'zotero'],
      ['yazi-like', 'catppuccin'],
    ] as const) {
      test.preferences.set(PRESET, legacy);
      expect(test.select.value).toBe(current);
      expect(test.values.get(PRESET)).toBe(legacy);
      expect(test.popup.children).toEqual([]);
    }
    expect(test.writes.map(([key, value]) => [key, value])).toEqual([
      [PRESET, 'primer-neutral'],
      [PRESET, 'soft-academic'],
      [PRESET, 'yazi-like'],
    ]);
    dispose();
  });

  it('selects each canonical built-in without temporary menu entries or startup writes', () => {
    const test = setup();
    const onBuiltIn = vi.fn((id: string) => test.preferences.set(PRESET, id));
    const dispose = bindLegacyInteractionThemeSelect(
      test.select as never,
      test.doc,
      test.preferences,
      onBuiltIn,
    );
    for (const id of ['zotero', 'catppuccin', 'tokyo-night', 'gruvbox']) {
      test.values.set(PRESET, id);
      expect(legacyInteractionThemeSelection(test.preferences)).toEqual({
        value: id,
        customLabel: null,
      });
      test.select.value = id;
      test.select.fire('command');
      expect(test.select.value).toBe(id);
    }
    expect(onBuiltIn.mock.calls.map(([id]) => id)).toEqual([
      'zotero',
      'catppuccin',
      'tokyo-night',
      'gruvbox',
    ]);
    expect(test.popup.children).toEqual([]);
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
    expect(onBuiltIn).not.toHaveBeenCalled();
    test.select.value = 'tokyo-night';
    test.select.fire('command');
    expect(test.writes).toEqual([[PRESET, 'tokyo-night']]);
    expect(test.select.value).toBe('tokyo-night');
    expect(test.popup.children).toEqual([]);
    test.preferences.set(PRESET, theme.id);
    expect(test.popup.children[0]?.getAttribute('label')).toBe('Custom: Study');
    dispose();
    expect(test.select.listeners.size).toBe(0);
    expect([...test.listeners.values()].every((group) => group.size === 0)).toBe(true);
  });

  it('shows legacy markerWeight fallback and writes only a new numeric markerWidth', () => {
    const test = setup();
    test.values.set(WEIGHT, 'compact');
    const onWidth = vi.fn((width: number) => test.preferences.set(WIDTH, width));
    const dispose = bindLegacyInteractionMarkerWidthSelect(
      test.select as never,
      test.preferences,
      onWidth,
    );
    expect(test.select.value).toBe('2');
    expect(test.writes).toEqual([]);
    test.preferences.set(WEIGHT, 'strong');
    expect(test.select.value).toBe('4');
    test.writes.length = 0;
    for (const width of [1, 2, 3, 4]) {
      test.select.value = String(width);
      test.select.fire('command');
      expect(test.values.get(WIDTH)).toBe(width);
      expect(test.select.value).toBe(String(width));
    }
    expect(onWidth.mock.calls.map(([width]) => width)).toEqual([1, 2, 3, 4]);
    expect(test.writes).toEqual([1, 2, 3, 4].map((width) => [WIDTH, width]));
    test.select.value = 'compact';
    test.select.fire('command');
    expect(test.writes).toHaveLength(4);
    dispose();
    expect(test.select.listeners.size).toBe(0);
  });
});
