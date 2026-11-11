import { describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY as PRESET,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY as CUSTOM,
  InteractionAppearanceManager,
  interactionStatusColors,
  parseCustomInteractionThemes,
  resolveInteractionAppearance,
  seedCustomInteractionTheme,
  serializeCustomInteractionThemes,
  type CustomInteractionTheme,
} from '../../src/main/interaction-appearance';
import { SettingsAppearance, type SettingsAppearanceState } from '../../src/main/settings-appearance';

class Preferences implements PreferenceStore {
  readonly data = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failPreset = false;
  failCustom = false;
  constructor(initial: Record<string, boolean | number | string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }
  has(key: string): boolean { return this.data.has(key); }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.data.get(key) ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    if (key === PRESET && this.failPreset) throw new Error('write failure');
    if (key === CUSTOM && this.failCustom) throw new Error('store write failure');
    this.writes.push([key, value]);
    this.data.set(key, value);
    for (const observer of this.observers.get(key) ?? []) observer();
  }
  clear(key: string): void {
    this.data.delete(key);
    for (const observer of this.observers.get(key) ?? []) observer();
  }
  observe(key: string, listener: () => void): () => void {
    const listeners = this.observers.get(key) ?? new Set();
    listeners.add(listener);
    this.observers.set(key, listeners);
    return () => { listeners.delete(listener); };
  }
  listenerCount(): number {
    return [...this.observers.values()].reduce((count, group) => count + group.size, 0);
  }
}

const custom: CustomInteractionTheme = {
  id: 'custom:study', name: 'Study', version: 2,
  light: {
    black: '#202020', red: '#AA0000', green: '#00FF00', yellow: '#FF0000',
    blue: '#0000AA', magenta: '#AA00AA', cyan: '#00AAAA', white: '#FAFAFA',
  },
  dark: {
    black: '#161616', red: '#FF2222', green: '#00FFFF', yellow: '#FF00FF',
    blue: '#2222FF', magenta: '#AA00AA', cyan: '#00AAAA', white: '#F0F0F0',
  },
};
const stored = serializeCustomInteractionThemes({ version: 2, themes: [custom] });
const WIDTH = 'appearance.interaction.markerWidth';
const STYLE = 'appearance.interaction.statusStyle';

function mount(
  initial: Record<string, boolean | number | string> = {},
  state: SettingsAppearanceState = { view: 'library', editingThemeId: null, paletteMode: 'light' },
  mode: 'light' | 'dark' = 'light',
) {
  const preferences = new Preferences(initial);
  const source = { theme: mode, observe: () => () => {} };
  const manager = new InteractionAppearanceManager(preferences, source);
  const window = { document: { defaultView: { crypto: { randomUUID: () => 'opaque-123' } } } } as never;
  const changed = vi.fn();
  const open = () => new SettingsAppearance(window, preferences, manager, state, 'en', changed);
  const appearance = open();
  return { preferences, manager, appearance, state, changed, open };
}

function themes(preferences: Preferences): readonly CustomInteractionTheme[] {
  return parseCustomInteractionThemes(preferences.get(CUSTOM, '')).themes;
}

describe('Settings Appearance consumer contracts', () => {
  it('exposes built-in and custom themes with the active theme and current-mode palette', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id }, undefined, 'dark');
    const model = test.appearance.model();
    expect(model.themes.map((theme) => theme.id)).toEqual(
      expect.arrayContaining(['zotero', 'catppuccin', 'tokyo-night', 'gruvbox', custom.id]),
    );
    expect(model.themes.filter((theme) => theme.selected).map((theme) => theme.id)).toEqual([custom.id]);
    expect(model.themes.find((theme) => theme.id === custom.id)).toMatchObject({ custom: true, palette: custom.dark });
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('persists selection, marker width and status style independently', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id, [WIDTH]: 1, [STYLE]: 'tinted' });
    test.appearance.dispatch({ type: 'select', id: 'gruvbox' });
    expect(test.preferences.writes).toEqual([[PRESET, 'gruvbox']]);
    expect(test.manager.appearance).toMatchObject({ colorPreset: 'gruvbox', marker: { width: 1 }, statusStyle: 'tinted' });
    test.appearance.dispatch({ type: 'marker-width', value: 4 });
    test.appearance.dispatch({ type: 'status-style', value: 'neutral' });
    test.appearance.dispatch({ type: 'select', id: 'catppuccin' });
    expect(test.appearance.model()).toMatchObject({ markerWidth: 4, statusStyle: 'neutral' });
    expect(test.manager.appearance).toMatchObject({ colorPreset: 'catppuccin', marker: { width: 4 }, statusStyle: 'neutral' });
    expect(test.preferences.get(WIDTH, 0)).toBe(4);
    expect(test.preferences.get(STYLE, '')).toBe('neutral');
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('previews a local draft without changing active appearance and discards it on Back', () => {
    const test = mount({ [PRESET]: 'catppuccin', [WIDTH]: 1, [STYLE]: 'tinted' });
    const initialAppearance = test.manager.appearance;
    test.appearance.dispatch({ type: 'create' });
    expect(test.state).toMatchObject({ view: 'editor', editingThemeId: null });
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#112233' });
    const seeded = seedCustomInteractionTheme(test.preferences, 'catppuccin', 'custom:preview', 'New theme');
    const expected = resolveInteractionAppearance(test.preferences, 'light', {
      ...seeded, light: { ...seeded.light, yellow: '#112233' },
    });
    expect(test.appearance.model().editor).toMatchObject({
      isNew: true, colors: { yellow: '#112233' },
      preview: { markerWidth: 1, selection: interactionStatusColors(expected, 'selection'), visual: interactionStatusColors(expected, 'visual') },
    });
    expect(test.manager.appearance).toEqual(initialAppearance);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispatch({ type: 'back' });
    expect(test.appearance.model()).toMatchObject({ view: 'library', editor: null });
    expect(test.preferences.get(CUSTOM, '')).toBe('');
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('validates both palettes and name before adding a v2 theme and activating it', () => {
    const test = mount({ [PRESET]: 'catppuccin' });
    test.appearance.dispatch({ type: 'create' });
    const original = test.appearance.model().editor!.colors.yellow;
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#123' });
    expect(test.appearance.model().editor).toMatchObject({ canAdd: false, colors: { yellow: original }, hex: { light: { yellow: '#123' } } });
    test.appearance.dispatch({ type: 'name', value: '   ' });
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#123456' });
    expect(test.appearance.model().editor).toMatchObject({ nameValid: false, canAdd: false });
    test.appearance.dispatch({ type: 'name', value: '  Personal  ' });
    test.appearance.dispatch({ type: 'picker', key: 'blue', value: '#456789' });
    test.appearance.dispatch({ type: 'mode', value: 'dark' });
    test.appearance.dispatch({ type: 'hex', key: 'green', value: 'bad' });
    expect(test.appearance.model().editor?.canAdd).toBe(false);
    test.appearance.dispatch({ type: 'hex', key: 'green', value: '#a6e3a1' });
    expect(test.appearance.model().editor?.canAdd).toBe(true);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispatch({ type: 'add' });
    const id = test.preferences.get(PRESET, '');
    expect(themes(test.preferences)).toEqual([{
      id, name: 'Personal', version: 2,
      light: expect.objectContaining({ yellow: '#123456', blue: '#456789' }),
      dark: expect.objectContaining({ green: '#A6E3A1' }),
    }]);
    expect(test.preferences.writes.map(([key]) => key)).toEqual([CUSTOM, PRESET]);
    expect(test.manager.appearance.colors.selectionMarker).toBe('#123456');
    expect(test.appearance.model().themes.find((theme) => theme.id === id)?.selected).toBe(true);
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('seeds a new or copied theme from its source, including both palettes', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id, [WIDTH]: 2, [STYLE]: 'tinted' });
    test.appearance.dispatch({ type: 'create' });
    expect(test.appearance.model().editor?.colors).toEqual(custom.light);
    test.appearance.dispatch({ type: 'name', value: 'Study' });
    test.appearance.dispatch({ type: 'add' });
    const copy = themes(test.preferences)[1]!;
    expect(copy).toMatchObject({ name: 'Study', light: custom.light, dark: custom.dark });
    expect(test.preferences.get(PRESET, '')).toBe(copy.id);
    expect(test.manager.appearance).toMatchObject({ marker: { width: 2 }, statusStyle: 'tinted' });
    test.appearance.dispatch({ type: 'copy', id: 'catppuccin' });
    const seeded = seedCustomInteractionTheme(test.preferences, 'catppuccin', 'custom:other', 'New theme');
    expect(test.appearance.model().editor?.colors).toEqual(seeded.light);
    test.appearance.dispatch({ type: 'back' });
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('keeps invalid editor text without writes and autosaves valid edits to the active custom theme', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: 'zotero' });
    test.appearance.dispatch({ type: 'edit', id: custom.id });
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#ff' });
    test.appearance.dispatch({ type: 'name', value: '   ' });
    expect(test.appearance.model().editor).toMatchObject({ nameValid: false, hex: { light: { yellow: '#ff' } } });
    expect(test.preferences.writes).toEqual([[PRESET, custom.id]]);
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#abcdef' });
    expect(test.appearance.model().editor?.hex.light.yellow).toBe('#abcdef');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    test.appearance.dispatch({ type: 'name', value: '  Study 2  ' });
    expect(themes(test.preferences)[0]).toMatchObject({ name: 'Study 2', light: { yellow: '#ABCDEF' } });
    expect(test.preferences.writes.map(([key]) => key)).toEqual([PRESET, CUSTOM, CUSTOM]);
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('persists picker edits, restores editor state on reopen, and falls back if the theme is removed', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.appearance.dispatch({ type: 'edit', id: custom.id });
    test.appearance.dispatch({ type: 'mode', value: 'dark' });
    test.appearance.dispatch({ type: 'picker', key: 'green', value: '#123456' });
    expect(themes(test.preferences)[0]?.dark.green).toBe('#123456');
    expect(test.appearance.model().editor?.hex.dark.green).toBe('#123456');
    test.appearance.dispose();
    const reopened = test.open();
    expect(test.state).toMatchObject({ view: 'editor', editingThemeId: custom.id, paletteMode: 'dark' });
    expect(reopened.model().editor).toMatchObject({ mode: 'dark', colors: { green: '#123456' } });
    reopened.dispose();
    test.preferences.set(CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [] }));
    const fallback = test.open();
    expect(fallback.model()).toMatchObject({ view: 'library', editor: null });
    fallback.dispose();
    test.manager.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
  });

  it('requires confirmation to delete and falls back when deleting the active theme', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.appearance.dispatch({ type: 'delete', id: custom.id });
    expect(test.appearance.model().confirmedDelete).toBe(custom.id);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispatch({ type: 'delete', id: custom.id });
    expect(themes(test.preferences)).toEqual([]);
    expect(test.preferences.get(PRESET, '')).toBe('zotero');
    expect(test.manager.appearance.colorPreset).toBe('zotero');
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('rolls back deletion if switching away from the active theme fails', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.preferences.failPreset = true;
    test.appearance.dispatch({ type: 'delete', id: custom.id });
    test.appearance.dispatch({ type: 'delete', id: custom.id });
    expect(test.appearance.model().status).not.toBe('');
    expect(themes(test.preferences)).toEqual([custom]);
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    expect(test.manager.appearance.colors.selectionMarker).toBe(custom.light.yellow);
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('retains the draft and rolls back failed Add writes, then permits retry', () => {
    const test = mount({ [PRESET]: 'zotero' });
    test.appearance.dispatch({ type: 'create' });
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#123456' });
    test.preferences.failCustom = true;
    test.appearance.dispatch({ type: 'add' });
    expect(test.preferences.get(CUSTOM, '')).toBe('');
    expect(test.appearance.model().status).not.toBe('');
    test.preferences.failCustom = false;
    test.preferences.failPreset = true;
    test.appearance.dispatch({ type: 'add' });
    expect(test.preferences.get(CUSTOM, '')).toBe('');
    expect(test.preferences.get(PRESET, '')).toBe('zotero');
    expect(test.appearance.model()).toMatchObject({ view: 'editor', editor: { hex: { light: { yellow: '#123456' } } } });
    expect(test.appearance.model().status).not.toBe('');
    test.preferences.failPreset = false;
    test.appearance.dispatch({ type: 'add' });
    expect(themes(test.preferences)[0]?.light.yellow).toBe('#123456');
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('keeps persisted appearance authoritative when autosave fails', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.appearance.dispatch({ type: 'edit', id: custom.id });
    test.preferences.failCustom = true;
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#123456' });
    expect(test.appearance.model().editor?.hex.light.yellow).toBe('#123456');
    expect(test.appearance.model().status).not.toBe('');
    expect(test.manager.appearance.colors.selectionMarker).toBe(custom.light.yellow);
    expect(themes(test.preferences)).toEqual([custom]);
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('reflects external selection and custom-theme updates while preserving later edits', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: 'zotero' });
    test.preferences.set(PRESET, custom.id);
    expect(test.appearance.model().themes.find((theme) => theme.id === custom.id)?.selected).toBe(true);
    test.appearance.dispatch({ type: 'edit', id: custom.id });
    const updated = { ...custom, name: 'External', light: { ...custom.light, yellow: '#123456' } };
    test.preferences.set(CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [updated] }));
    expect(test.appearance.model().editor).toMatchObject({ name: 'External', colors: { yellow: '#123456' }, hex: { light: { yellow: '#123456' } } });
    test.appearance.dispatch({ type: 'picker', key: 'blue', value: '#654321' });
    expect(themes(test.preferences)[0]).toMatchObject({ name: 'External', light: { yellow: '#123456', blue: '#654321' } });
    test.preferences.set(CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [] }));
    expect(test.appearance.model()).toMatchObject({ view: 'library', editor: null });
    test.appearance.dispose();
    test.manager.dispose();
  });

  it('disposes subscriptions, abandons new drafts and ignores subsequent commands', () => {
    const test = mount({ [PRESET]: 'zotero' });
    test.appearance.dispatch({ type: 'create' });
    test.appearance.dispatch({ type: 'hex', key: 'yellow', value: '#123456' });
    test.appearance.dispose();
    test.appearance.dispose();
    expect(test.state).toMatchObject({ view: 'library', editingThemeId: null });
    test.changed.mockClear();
    test.preferences.set(PRESET, 'gruvbox');
    test.appearance.dispatch({ type: 'select', id: 'catppuccin' });
    expect(test.preferences.get(PRESET, '')).toBe('gruvbox');
    expect(test.preferences.get(CUSTOM, '')).toBe('');
    expect(test.changed).not.toHaveBeenCalled();
    test.manager.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
  });
});
