import { describe, expect, it, vi } from 'vitest';
import type { PreferenceReader } from '../../src/core/preferences';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
  InteractionAppearanceManager,
  interactionColorPresetFromPreferences,
  interactionMarkerWeightFromPreferences,
  interactionStatusColors,
  interactionStatusStyleFromPreferences,
  resolveInteractionAppearance,
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
});
