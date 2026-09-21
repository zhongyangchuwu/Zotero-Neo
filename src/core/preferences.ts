import { KEY_GUIDE_CONFIG } from '../input/key-guide-config';

import {
  migrateBindingModeOverrides,
  migrateFrozenKeymapOverrides,
  migrateKeySequenceOverrides,
  migrateLegacyBindingOverrides,
  migrateMainDirectPrefixOverrides,
  migrateNoteBindingOverrides,
  migrateSemanticKeymapOverrides,
  resolveBindings,
  type BindingMap,
} from '../input/bindings';

export const PREFERENCE_PREFIX = 'extensions.zotero-neo' as const;
export const BINDING_SCHEMA_VERSION = 13;

export const PICKER_MOUSE_ENABLED_PREFERENCE_KEY = 'picker.mouse.enabled' as const;

export function pickerMouseEnabled(preferences: PreferenceReader): boolean {
  return preferences.get(PICKER_MOUSE_ENABLED_PREFERENCE_KEY, false);
}

export type ScrollMode = 'step' | 'follow' | 'trapezoid';
export type HighlightColorName = 'yellow' | 'red' | 'green' | 'blue' | 'purple';

export interface SmoothScrollConfig {
  readonly mode: ScrollMode;
  readonly initialSpeed: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly stopOnRelease: boolean;
  readonly followSpeed: number;
}

export interface KeyGuideConfig {
  readonly enabled: boolean;
  readonly delayMs: number;
  readonly fontSizePx: number;
}

export function keyGuideConfig(preferences: PreferenceReader): KeyGuideConfig {
  const delay = preferences.get('keyGuide.delayMs', KEY_GUIDE_CONFIG.defaultDelayMs);
  const fontSize = preferences.get('keyGuide.fontSizePx', KEY_GUIDE_CONFIG.defaultFontSizePx);
  return {
    enabled: preferences.get('keyGuide.enabled', true),
    delayMs: Math.max(0, Math.min(KEY_GUIDE_CONFIG.maxDelayMs, delay)),
    fontSizePx: Math.max(
      KEY_GUIDE_CONFIG.minFontSizePx,
      Math.min(KEY_GUIDE_CONFIG.maxFontSizePx, fontSize),
    ),
  };
}

export interface PreferenceReader {
  has?(key: string): boolean;
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
}

export interface PreferenceWriter extends PreferenceReader {
  set(key: string, value: boolean | number | string): void;
}

export function migrateBindingPreferences(preferences: PreferenceWriter): void {
  const version = preferences.get('bindings.schemaVersion', 0);
  if (version >= BINDING_SCHEMA_VERSION) return;
  const raw = preferences.get('bindings', '');
  const canonical =
    version >= 8
      ? raw
      : version >= 7
        ? migrateBindingModeOverrides(raw)
        : migrateLegacyBindingOverrides(raw);
  let migrated = canonical;
  if (version < 9) migrated = migrateNoteBindingOverrides(migrated);
  if (version < 10) migrated = migrateFrozenKeymapOverrides(migrated);
  if (version < 11) migrated = migrateSemanticKeymapOverrides(migrated);
  if (version < 12) migrated = migrateMainDirectPrefixOverrides(migrated);
  if (version < 13) migrated = migrateKeySequenceOverrides(migrated);
  if (migrated !== raw) preferences.set('bindings', migrated);
  preferences.set('bindings.schemaVersion', BINDING_SCHEMA_VERSION);
}

export function scrollModeFromPreferences(preferences: PreferenceReader): ScrollMode {
  const configured = preferences.get('scroll.mode', '');
  if (configured === 'step' || configured === 'follow' || configured === 'trapezoid') {
    return configured;
  }
  if (preferences.has?.('smoothScroll')) {
    return preferences.get('smoothScroll', true) ? 'trapezoid' : 'step';
  }
  return 'follow';
}

export function smoothScrollConfig(preferences: PreferenceReader): SmoothScrollConfig {
  const initialSpeed = preferences.get('smoothScroll.initialSpeed', 2000);
  return {
    mode: scrollModeFromPreferences(preferences),
    initialSpeed,
    maxSpeed: Math.max(initialSpeed, preferences.get('smoothScroll.maxSpeed', 2000)),
    acceleration: preferences.get('smoothScroll.acceleration', 2600),
    deceleration: preferences.get('smoothScroll.deceleration', 4200),
    stopOnRelease: preferences.get('smoothScroll.stopOnRelease', false),
    followSpeed: preferences.get('smoothScroll.followSpeed', 2000),
  };
}

export function bindingsFromPreferences(preferences: PreferenceReader): BindingMap {
  return resolveBindings(preferences.get('bindings', ''));
}
