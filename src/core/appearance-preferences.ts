import type { PreferenceStore } from './preference-store';
import type { PreferenceReader } from './preferences';

export const APPEARANCE_PRESETS = ['classic', 'terminal', 'modern'] as const;
export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];
export const APPEARANCE_PRESET_KEY = 'appearance.preset';
export const APPEARANCE_CUSTOM_CSS_KEY = 'appearance.customCss';

const LEGACY_PICKER_PRESET_KEY = 'picker.theme';
const LEGACY_PICKER_CSS_KEY = 'picker.customCss';

export function isAppearancePreset(value: unknown): value is AppearancePreset {
  return APPEARANCE_PRESETS.some((preset) => preset === value);
}

export function appearancePreset(preferences: PreferenceReader): AppearancePreset {
  const value = preferences.get(APPEARANCE_PRESET_KEY, 'classic');
  return isAppearancePreset(value) ? value : 'classic';
}

export function appearanceCustomCss(preferences: PreferenceReader): string {
  const value = preferences.get(APPEARANCE_CUSTOM_CSS_KEY, '');
  return typeof value === 'string' ? value : '';
}

/** Removes legacy values after copying them so resetting appearance cannot import them again. */
export function migrateAppearancePreferences(preferences: PreferenceStore): void {
  if (preferences.has(LEGACY_PICKER_PRESET_KEY)) {
    if (!preferences.has(APPEARANCE_PRESET_KEY)) {
      const preset = preferences.get(LEGACY_PICKER_PRESET_KEY, '');
      if (isAppearancePreset(preset)) preferences.set(APPEARANCE_PRESET_KEY, preset);
    }
    preferences.clear(LEGACY_PICKER_PRESET_KEY);
  }
  if (preferences.has(LEGACY_PICKER_CSS_KEY)) {
    if (!preferences.has(APPEARANCE_CUSTOM_CSS_KEY)) {
      const css = preferences.get(LEGACY_PICKER_CSS_KEY, '');
      if (typeof css === 'string') preferences.set(APPEARANCE_CUSTOM_CSS_KEY, css);
    }
    preferences.clear(LEGACY_PICKER_CSS_KEY);
  }
}
