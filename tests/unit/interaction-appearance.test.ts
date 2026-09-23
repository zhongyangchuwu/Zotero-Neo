import { describe, expect, it, vi } from 'vitest';
import type { PreferenceReader } from '../../src/core/preferences';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
  InteractionAppearanceManager,
  deleteCustomInteractionTheme,
  findCustomInteractionTheme,
  interactionColorPresetFromPreferences,
  interactionMarkerWeightFromPreferences,
  interactionStatusColors,
  interactionStatusStyleFromPreferences,
  listCustomInteractionThemes,
  parseCustomInteractionThemes,
  resolveInteractionAppearance,
  serializeCustomInteractionThemes,
  upsertCustomInteractionTheme,
  type CustomInteractionPalette,
  type CustomInteractionTheme,
  type InteractionAppearancePreferenceSource,
  type InteractionAppearanceThemeSource,
} from '../../src/main/interaction-appearance';
import type { ResolvedTheme } from '../../src/ui/theme';

class Preferences implements InteractionAppearancePreferenceSource {
  readonly listeners = new Map<string, Set<() => void>>();
  readonly values = new Map<string, boolean | number | string>();

  constructor(initial: Readonly<Record<string, boolean | number | string>> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }

  observe(key: string, listener: () => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => listeners.delete(listener);
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class ThemeSource implements InteractionAppearanceThemeSource {
  readonly listeners = new Set<(theme: ResolvedTheme) => void>();
  theme: ResolvedTheme = 'light';

  observe(listener: (theme: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(theme: ResolvedTheme): void {
    this.theme = theme;
    for (const listener of this.listeners) listener(theme);
  }
}

function reader(values: Readonly<Record<string, string>>): PreferenceReader {
  return {
    get: ((_key: string, fallback: boolean | number | string) =>
      values[_key] ?? fallback) as PreferenceReader['get'],
  };
}

const LIGHT_PALETTE: CustomInteractionPalette = {
  selection: '#FF0000',
  visual: '#00FF00',
  statusBackground: '#FAFAFA',
  statusForeground: '#202020',
  statusBorder: '#AAAAAA',
};
const DARK_PALETTE: CustomInteractionPalette = {
  selection: '#FF00FF',
  visual: '#00FFFF',
  statusBackground: '#161616',
  statusForeground: '#F0F0F0',
  statusBorder: '#555555',
};

function customTheme(changes: Partial<CustomInteractionTheme> = {}): CustomInteractionTheme {
  return {
    id: 'custom:study',
    name: 'Study',
    version: 1,
    light: LIGHT_PALETTE,
    dark: DARK_PALETTE,
    markerWidth: 3,
    statusStyle: 'tinted',
    ...changes,
  };
}

function contrastRatio(background: string, foreground: string): number {
  const luminance = (color: string): number => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const light = Math.max(luminance(background), luminance(foreground));
  const dark = Math.min(luminance(background), luminance(foreground));
  return (light + 0.05) / (dark + 0.05);
}

describe('Main interaction appearance preferences', () => {
  it('normalizes missing and invalid values to stable defaults', () => {
    const empty = reader({});
    expect(interactionColorPresetFromPreferences(empty)).toBe('primer-neutral');
    expect(interactionMarkerWeightFromPreferences(empty)).toBe('balanced');
    expect(interactionStatusStyleFromPreferences(empty)).toBe('neutral');

    const invalid = reader({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'neon',
      [INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY]: 'huge',
      [INTERACTION_STATUS_STYLE_PREFERENCE_KEY]: 'solid',
    });
    expect(interactionColorPresetFromPreferences(invalid)).toBe('primer-neutral');
    expect(interactionMarkerWeightFromPreferences(invalid)).toBe('balanced');
    expect(interactionStatusStyleFromPreferences(invalid)).toBe('neutral');
  });
  it('resolves all color presets in light and dark themes', () => {
    const primer = resolveInteractionAppearance(new Preferences(), 'light');
    expect(primer.colors.selectionMarker).toBe('#9A6700');
    expect(primer.colors.visualMarker).toBe('#1A7F37');
    expect(primer.colors.neutralStatusBackground).toBe('#F6F8FA');

    const academic = resolveInteractionAppearance(
      new Preferences({ [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'soft-academic' }),
      'dark',
    );
    expect(academic.colors.selectionMarker).toBe('#D2A75C');
    expect(academic.colors.visualMarker).toBe('#7EAD96');
    expect(academic.colors.neutralStatusForeground).toBe('#F5F5F4');

    const yazi = resolveInteractionAppearance(
      new Preferences({ [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'yazi-like' }),
      'dark',
    );
    expect(yazi.colors.selectionMarker).toBe('#FACC15');
    expect(yazi.colors.visualMarker).toBe('#4ADE80');
    expect(yazi.colors.neutralStatusBackground).toBe('#1F2937');
  });

  it('keeps marker weights inside the two safe twisty padding lanes', () => {
    const compact = resolveInteractionAppearance(
      new Preferences({ [INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY]: 'compact' }),
      'light',
    );
    expect(compact.marker).toEqual({ width: 2, selectionLeft: 1, visualLeft: 13, radius: 1 });

    const balanced = resolveInteractionAppearance(new Preferences(), 'light');
    expect(balanced.marker).toEqual({
      width: 3,
      selectionLeft: 1,
      visualLeft: 13,
      radius: 2,
    });

    const strong = resolveInteractionAppearance(
      new Preferences({ [INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY]: 'strong' }),
      'light',
    );
    expect(strong.marker).toEqual({ width: 4, selectionLeft: 0, visualLeft: 12, radius: 2 });

    for (const appearance of [compact, balanced, strong]) {
      expect(appearance.marker.selectionLeft + appearance.marker.width).toBeLessThanOrEqual(4);
      expect(appearance.marker.visualLeft).toBeGreaterThanOrEqual(12);
      expect(appearance.marker.visualLeft + appearance.marker.width).toBeLessThanOrEqual(16);
    }
  });

  it('pairs tinted light surfaces with dark semantic foregrounds', () => {
    const selection = resolveInteractionAppearance(
      new Preferences({ [INTERACTION_STATUS_STYLE_PREFERENCE_KEY]: 'tinted' }),
      'light',
    );
    expect(interactionStatusColors(selection, 'selection')).toMatchObject({
      background: '#FFF8C5',
      foreground: '#633C01',
      border: '#9A6700',
    });
    expect(interactionStatusColors(selection, 'visual')).toMatchObject({
      background: '#DAFBE1',
      foreground: '#116329',
      border: '#1A7F37',
    });
    expect(interactionStatusColors(selection, 'selection').foreground).not.toBe('#FFFFFF');
  });

  it('updates live on preference or theme changes and detaches every observer', () => {
    const preferences = new Preferences();
    const theme = new ThemeSource();
    const manager = new InteractionAppearanceManager(preferences, theme);
    const seen = vi.fn();
    manager.observe(seen);

    preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, 'soft-academic');
    expect(manager.appearance.colorPreset).toBe('soft-academic');
    expect(seen).toHaveBeenCalledTimes(1);

    preferences.set(INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY, 'strong');
    preferences.set(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, 'tinted');
    theme.set('dark');
    expect(manager.appearance).toMatchObject({
      theme: 'dark',
      markerWeight: 'strong',
      statusStyle: 'tinted',
    });
    expect(seen).toHaveBeenCalledTimes(4);

    preferences.set(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, 'tinted');
    expect(seen).toHaveBeenCalledTimes(4);

    manager.dispose();
    expect(preferences.listenerCount()).toBe(0);
    expect(theme.listeners.size).toBe(0);
  });
  it('treats absent, malformed, or unsupported stores as empty', () => {
    for (const raw of ['', '{', '{}', '{"version":2,"themes":[]}', '{"version":1}']) {
      expect(parseCustomInteractionThemes(raw)).toEqual({ version: 1, themes: [] });
    }
  });

  it('rejects malformed records and reserved IDs, keeping the first valid duplicate', () => {
    const first = customTheme();
    const later = customTheme({ name: 'Later' });
    const parsed = parseCustomInteractionThemes(
      JSON.stringify({
        version: 1,
        themes: [
          { ...first, markerWidth: 5 },
          { ...first, id: 'primer-neutral' },
          { ...first, light: { ...LIGHT_PALETTE, selection: 'red' } },
          { ...first, version: 2 },
          first,
          later,
        ],
      }),
    );
    expect(parsed.themes).toEqual([first]);
    expect(() =>
      serializeCustomInteractionThemes({ version: 1, themes: [first, later] }),
    ).toThrow();
  });

  it('reserves only real built-in IDs, not inherited object names', () => {
    const inheritedName = customTheme({ id: 'toString' });
    const parsed = parseCustomInteractionThemes(
      JSON.stringify({ version: 1, themes: [inheritedName] }),
    );
    expect(parsed.themes).toEqual([inheritedName]);
    for (const id of ['primer-neutral', 'soft-academic', 'yazi-like']) {
      expect(
        parseCustomInteractionThemes(
          JSON.stringify({
            version: 1,
            themes: [customTheme({ id })],
          }),
        ).themes,
      ).toEqual([]);
    }
    const active = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'toString',
      [INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY]: serializeCustomInteractionThemes(parsed),
    });
    expect(resolveInteractionAppearance(active, 'light').colors.selectionMarker).toBe('#FF0000');
  });

  it('round-trips canonical colors and supports validated list, find, upsert, and delete', () => {
    const lower = customTheme({ light: { ...LIGHT_PALETTE, selection: '#aabbcc' } });
    const added = upsertCustomInteractionTheme({ version: 1, themes: [] }, lower);
    expect(listCustomInteractionThemes(added)).toHaveLength(1);
    expect(findCustomInteractionTheme(added, lower.id)?.light.selection).toBe('#AABBCC');
    const renamed = upsertCustomInteractionTheme(added, customTheme({ name: 'Renamed' }));
    expect(renamed.themes).toHaveLength(1);
    expect(renamed.themes[0]?.name).toBe('Renamed');
    expect(added.themes[0]?.name).toBe('Study');
    expect(parseCustomInteractionThemes(serializeCustomInteractionThemes(renamed))).toEqual(
      renamed,
    );
    expect(deleteCustomInteractionTheme(renamed, lower.id).themes).toEqual([]);
    expect(() => upsertCustomInteractionTheme(added, customTheme({ markerWidth: 0 }))).toThrow();
    expect(() => upsertCustomInteractionTheme(added, customTheme({ id: 'yazi-like' }))).toThrow();
  });

  it('resolves custom light and dark palettes and their own status and width', () => {
    const selected = customTheme({ markerWidth: 1, statusStyle: 'neutral' });
    const preferences = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: selected.id,
      [INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY]: serializeCustomInteractionThemes({
        version: 1,
        themes: [selected],
      }),
      [INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY]: 'strong',
      [INTERACTION_STATUS_STYLE_PREFERENCE_KEY]: 'tinted',
    });
    const light = resolveInteractionAppearance(preferences, 'light');
    const dark = resolveInteractionAppearance(preferences, 'dark');
    expect(light.colorPreset).toBe(selected.id);
    expect(light.colors.selectionMarker).toBe('#FF0000');
    expect(dark.colors.selectionMarker).toBe('#FF00FF');
    expect(light.marker).toMatchObject({ width: 1, selectionLeft: 1, visualLeft: 14 });
    expect(light.statusStyle).toBe('neutral');
    expect(interactionStatusColors(light, 'selection')).toMatchObject({
      background: LIGHT_PALETTE.statusBackground,
      foreground: LIGHT_PALETTE.statusForeground,
      border: LIGHT_PALETTE.statusBorder,
    });
  });

  it('falls back for deleted and unknown IDs without changing the active pref', () => {
    const preferences = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'custom:deleted',
      [INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY]: serializeCustomInteractionThemes({
        version: 1,
        themes: [customTheme()],
      }),
    });
    const write = vi.spyOn(preferences, 'set');
    expect(resolveInteractionAppearance(preferences, 'light').colors.selectionMarker).toBe(
      '#9A6700',
    );
    expect(resolveInteractionAppearance(preferences, 'light').colorPreset).toBe('primer-neutral');
    expect(preferences.get(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, '')).toBe('custom:deleted');
    expect(write).not.toHaveBeenCalled();
  });

  it('centers custom widths outward inside safe lanes and rejects invalid widths', () => {
    for (const [width, selectionLeft, visualLeft] of [
      [1, 1, 14],
      [2, 1, 13],
      [3, 0, 13],
      [4, 0, 12],
    ]) {
      const selected = customTheme({ markerWidth: width });
      const appearance = resolveInteractionAppearance(new Preferences(), 'light', selected);
      expect(appearance.marker.width).toBe(width);
      expect(appearance.marker).toMatchObject({ width, selectionLeft, visualLeft });
      expect(appearance.marker.selectionLeft).toBeGreaterThanOrEqual(0);
      expect(appearance.marker.selectionLeft + width).toBeLessThanOrEqual(4);
      expect(appearance.marker.visualLeft).toBeGreaterThanOrEqual(12);
      expect(appearance.marker.visualLeft + width).toBeLessThanOrEqual(16);
      expect(Number.isInteger(appearance.marker.selectionLeft)).toBe(true);
    }
    for (const width of [0, 2.5, 5]) {
      expect(
        parseCustomInteractionThemes(
          JSON.stringify({
            version: 1,
            themes: [customTheme({ markerWidth: width })],
          }),
        ).themes,
      ).toEqual([]);
    }
  });

  it('derives readable muted tinted statuses for light, dark, and saturated colors', () => {
    for (const theme of ['light', 'dark'] as const) {
      const appearance = resolveInteractionAppearance(
        new Preferences(),
        theme,
        customTheme({
          light: { ...LIGHT_PALETTE, statusForeground: '#FFFFFF' },
          dark: { ...DARK_PALETTE, statusForeground: '#000000' },
        }),
      );
      for (const kind of ['selection', 'visual'] as const) {
        const colors = interactionStatusColors(appearance, kind);
        expect(contrastRatio(colors.background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
        expect(colors.background).not.toBe(
          appearance.colors[kind === 'selection' ? 'selectionMarker' : 'visualMarker'],
        );
      }
    }
    const readable = resolveInteractionAppearance(new Preferences(), 'light', customTheme());
    expect(interactionStatusColors(readable, 'selection').foreground).toBe('#202020');
  });

  it('prioritizes an unsaved session draft over a built-in without changing preferences', () => {
    const preferences = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: 'soft-academic',
    });
    const manager = new InteractionAppearanceManager(preferences, new ThemeSource());
    const persisted = manager.appearance;
    const write = vi.spyOn(preferences, 'set');
    manager.setDraft(customTheme());
    expect(manager.appearance.colorPreset).toBe('custom:study');
    expect(manager.appearance.colors.selectionMarker).toBe('#FF0000');
    expect(write).not.toHaveBeenCalled();
    manager.setDraft(null);
    expect(manager.appearance).toEqual(persisted);
    expect(preferences.get(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, '')).toBe('soft-academic');
    manager.dispose();
  });

  it('previews in one session, observes same-ID changes, and restores persisted appearance', () => {
    const saved = customTheme();
    const preferences = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: saved.id,
      [INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY]: serializeCustomInteractionThemes({
        version: 1,
        themes: [saved],
      }),
    });
    const mode = new ThemeSource();
    const manager = new InteractionAppearanceManager(preferences, mode);
    const other = new InteractionAppearanceManager(preferences, mode);
    const seen = vi.fn();
    manager.observe(seen);
    manager.setDraft(customTheme({ light: { ...LIGHT_PALETTE, selection: '#123456' } }));
    expect(manager.appearance.colors.selectionMarker).toBe('#123456');
    expect(other.appearance.colors.selectionMarker).toBe('#FF0000');
    manager.setDraft(customTheme({ light: { ...LIGHT_PALETTE, selection: '#654321' } }));
    expect(manager.appearance.colors.selectionMarker).toBe('#654321');
    expect(seen).toHaveBeenCalledTimes(2);
    mode.set('dark');
    expect(manager.appearance.colors.selectionMarker).toBe('#FF00FF');
    expect(seen).toHaveBeenCalledTimes(3);
    mode.set('light');
    manager.clearDraft();
    expect(manager.appearance.colors.selectionMarker).toBe('#FF0000');
    expect(seen).toHaveBeenCalledTimes(5);
    expect(() => manager.setDraft(customTheme({ markerWidth: 9 }))).toThrow();
    expect(manager.appearance.colors.selectionMarker).toBe('#FF0000');
    expect(preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '')).toContain('#FF0000');
    manager.dispose();
    other.dispose();
    expect(preferences.listenerCount()).toBe(0);
    expect(mode.listeners.size).toBe(0);
  });

  it('observes a saved edit to the active custom ID without changing its ID', () => {
    const saved = customTheme();
    const preferences = new Preferences({
      [INTERACTION_COLOR_PRESET_PREFERENCE_KEY]: saved.id,
      [INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY]: serializeCustomInteractionThemes({
        version: 1,
        themes: [saved],
      }),
    });
    const manager = new InteractionAppearanceManager(preferences, new ThemeSource());
    const seen = vi.fn();
    manager.observe(seen);
    preferences.set(
      INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
      serializeCustomInteractionThemes({
        version: 1,
        themes: [customTheme({ light: { ...LIGHT_PALETTE, selection: '#123456' } })],
      }),
    );
    expect(manager.appearance.colors.selectionMarker).toBe('#123456');
    expect(seen).toHaveBeenCalledTimes(1);
    manager.dispose();
  });
});
