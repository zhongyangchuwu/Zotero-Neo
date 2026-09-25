import { KEY_GUIDE_CONFIG } from '../input/key-guide-config';

import {
  migrateBindingModeOverrides,
  migrateFrozenKeymapOverrides,
  migrateKeySequenceOverrides,
  migrateLegacyBindingOverrides,
  migrateMainDirectPrefixOverrides,
  migrateMainSelectionCommandOverrides,
  migrateMainSpaceSelectionOverrides,
  migrateUnifiedSpaceLeaderOverrides,
  migrateNoteBindingOverrides,
  migrateSemanticKeymapOverrides,
  resolveBindings,
  type BindingMap,
} from '../input/bindings';

export const PREFERENCE_PREFIX = 'extensions.zotero-neo' as const;
export const BINDING_SCHEMA_VERSION = 16;
export const BINDINGS_PREFERENCE_KEY = 'bindings' as const;

export const PICKER_MOUSE_ENABLED_PREFERENCE_KEY = 'picker.mouse.enabled' as const;

export function pickerMouseEnabled(preferences: PreferenceReader): boolean {
  return preferences.get(PICKER_MOUSE_ENABLED_PREFERENCE_KEY, false);
}

export const NOTE_EDITOR_ENABLED_PREFERENCE_KEY = 'noteEditor.enabled' as const;

export function noteEditorEnabled(preferences: PreferenceReader): boolean {
  return preferences.get(NOTE_EDITOR_ENABLED_PREFERENCE_KEY, true);
}

export type ReaderModePreference = 'visual' | 'insert';
export type ScrollMode = 'step' | 'follow' | 'trapezoid';
export type HighlightColorName = 'yellow' | 'red' | 'green' | 'blue' | 'purple';

export const READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY = 'mode.visual.enabled' as const;
export const READER_INSERT_MODE_ENABLED_PREFERENCE_KEY = 'mode.insert.enabled' as const;
export const READER_MARKS_PERSIST_PREFERENCE_KEY = 'marks.persist' as const;
export const READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY = 'defaultHighlightColor' as const;
export const READER_SCROLL_MODE_PREFERENCE_KEY = 'scroll.mode' as const;
export const READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY = 'smoothScroll.stopOnRelease' as const;

const LEGACY_SMOOTH_SCROLL_PREFERENCE_KEY = 'smoothScroll' as const;

export const READER_SCROLL_NUMBER_SPECS = {
  scrollStep: { key: 'scrollStep', defaultValue: 60, minimum: 10, maximum: 500 },
  followSpeed: {
    key: 'smoothScroll.followSpeed',
    defaultValue: 2_000,
    minimum: 100,
    maximum: 6_000,
  },
  initialSpeed: {
    key: 'smoothScroll.initialSpeed',
    defaultValue: 2_000,
    minimum: 50,
    maximum: 2_000,
  },
  maxSpeed: {
    key: 'smoothScroll.maxSpeed',
    defaultValue: 2_000,
    minimum: 100,
    maximum: 6_000,
  },
  acceleration: {
    key: 'smoothScroll.acceleration',
    defaultValue: 2_600,
    minimum: 100,
    maximum: 10_000,
  },
  deceleration: {
    key: 'smoothScroll.deceleration',
    defaultValue: 4_200,
    minimum: 100,
    maximum: 12_000,
  },
} as const;

export type ReaderScrollNumberSetting = keyof typeof READER_SCROLL_NUMBER_SPECS;

export interface ReaderScrollConfig {
  readonly mode: ScrollMode;
  readonly scrollStep: number;
  readonly initialSpeed: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly stopOnRelease: boolean;
  readonly followSpeed: number;
}

export type SmoothScrollConfig = Omit<ReaderScrollConfig, 'scrollStep'>;

export function readerModeEnabled(
  preferences: PreferenceReader,
  mode: ReaderModePreference,
): boolean {
  const key =
    mode === 'visual'
      ? READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY
      : READER_INSERT_MODE_ENABLED_PREFERENCE_KEY;
  return preferences.get(key, true);
}

export function readerMarksPersist(preferences: PreferenceReader): boolean {
  return preferences.get(READER_MARKS_PERSIST_PREFERENCE_KEY, false);
}

export function readerDefaultHighlightColor(preferences: PreferenceReader): HighlightColorName {
  const configured = preferences.get(READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY, 'yellow');
  return configured === 'red' ||
    configured === 'green' ||
    configured === 'blue' ||
    configured === 'purple'
    ? configured
    : 'yellow';
}

export function normalizeReaderScrollNumber(
  setting: ReaderScrollNumberSetting,
  value: number,
): number {
  const spec = READER_SCROLL_NUMBER_SPECS[setting];
  const finite = Number.isFinite(value) ? Math.trunc(value) : spec.defaultValue;
  return Math.max(spec.minimum, Math.min(spec.maximum, finite));
}

function readerScrollNumber(
  preferences: PreferenceReader,
  setting: ReaderScrollNumberSetting,
): number {
  const spec = READER_SCROLL_NUMBER_SPECS[setting];
  return normalizeReaderScrollNumber(setting, preferences.get(spec.key, spec.defaultValue));
}

function isScrollMode(value: string): value is ScrollMode {
  return value === 'step' || value === 'follow' || value === 'trapezoid';
}

export const KEY_GUIDE_ENABLED_PREFERENCE_KEY = 'keyGuide.enabled' as const;
export const KEY_GUIDE_DELAY_PREFERENCE_KEY = 'keyGuide.delayMs' as const;
export const KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY = 'keyGuide.fontSizePx' as const;

export const KEY_GUIDE_NUMBER_SPECS = {
  delayMs: {
    key: KEY_GUIDE_DELAY_PREFERENCE_KEY,
    defaultValue: KEY_GUIDE_CONFIG.defaultDelayMs,
    minimum: 0,
    maximum: KEY_GUIDE_CONFIG.maxDelayMs,
  },
  fontSizePx: {
    key: KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
    defaultValue: KEY_GUIDE_CONFIG.defaultFontSizePx,
    minimum: KEY_GUIDE_CONFIG.minFontSizePx,
    maximum: KEY_GUIDE_CONFIG.maxFontSizePx,
  },
} as const;

export type KeyGuideNumberSetting = keyof typeof KEY_GUIDE_NUMBER_SPECS;

export interface KeyGuideConfig {
  readonly enabled: boolean;
  readonly delayMs: number;
  readonly fontSizePx: number;
}

export function normalizeKeyGuideNumber(
  setting: KeyGuideNumberSetting,
  value: number,
): number {
  const spec = KEY_GUIDE_NUMBER_SPECS[setting];
  const finite = Number.isFinite(value) ? Math.trunc(value) : spec.defaultValue;
  return Math.max(spec.minimum, Math.min(spec.maximum, finite));
}

export function keyGuideConfig(preferences: PreferenceReader): KeyGuideConfig {
  return {
    enabled: preferences.get(KEY_GUIDE_ENABLED_PREFERENCE_KEY, true),
    delayMs: normalizeKeyGuideNumber(
      'delayMs',
      preferences.get(KEY_GUIDE_DELAY_PREFERENCE_KEY, KEY_GUIDE_NUMBER_SPECS.delayMs.defaultValue),
    ),
    fontSizePx: normalizeKeyGuideNumber(
      'fontSizePx',
      preferences.get(
        KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
        KEY_GUIDE_NUMBER_SPECS.fontSizePx.defaultValue,
      ),
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
  const raw = preferences.get(BINDINGS_PREFERENCE_KEY, '');
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
  if (version < 14) migrated = migrateMainSpaceSelectionOverrides(migrated);
  if (version < 15) migrated = migrateUnifiedSpaceLeaderOverrides(migrated);
  if (version < 16) migrated = migrateMainSelectionCommandOverrides(migrated);
  if (migrated !== raw) preferences.set(BINDINGS_PREFERENCE_KEY, migrated);
  preferences.set('bindings.schemaVersion', BINDING_SCHEMA_VERSION);
}

export function scrollModeFromPreferences(preferences: PreferenceReader): ScrollMode {
  const configured = preferences.get(READER_SCROLL_MODE_PREFERENCE_KEY, '');
  if (isScrollMode(configured)) return configured;
  if (preferences.has?.(LEGACY_SMOOTH_SCROLL_PREFERENCE_KEY)) {
    return preferences.get(LEGACY_SMOOTH_SCROLL_PREFERENCE_KEY, true) ? 'trapezoid' : 'step';
  }
  return 'follow';
}

/** Persists only the historical smoothScroll boolean into the canonical scroll.mode key. */
export function migrateReaderPreferences(preferences: PreferenceWriter): void {
  const configured = preferences.get(READER_SCROLL_MODE_PREFERENCE_KEY, '');
  if (isScrollMode(configured) || !preferences.has?.(LEGACY_SMOOTH_SCROLL_PREFERENCE_KEY)) return;
  preferences.set(
    READER_SCROLL_MODE_PREFERENCE_KEY,
    preferences.get(LEGACY_SMOOTH_SCROLL_PREFERENCE_KEY, true) ? 'trapezoid' : 'step',
  );
}

export function readerScrollConfig(preferences: PreferenceReader): ReaderScrollConfig {
  const initialSpeed = readerScrollNumber(preferences, 'initialSpeed');
  return {
    mode: scrollModeFromPreferences(preferences),
    scrollStep: readerScrollNumber(preferences, 'scrollStep'),
    followSpeed: readerScrollNumber(preferences, 'followSpeed'),
    initialSpeed,
    maxSpeed: Math.max(initialSpeed, readerScrollNumber(preferences, 'maxSpeed')),
    acceleration: readerScrollNumber(preferences, 'acceleration'),
    deceleration: readerScrollNumber(preferences, 'deceleration'),
    stopOnRelease: preferences.get(READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY, false),
  };
}

export function readerScrollStep(preferences: PreferenceReader): number {
  return readerScrollNumber(preferences, 'scrollStep');
}

export function smoothScrollConfig(preferences: PreferenceReader): SmoothScrollConfig {
  const { scrollStep: _scrollStep, ...config } = readerScrollConfig(preferences);
  return config;
}

export function bindingsFromPreferences(preferences: PreferenceReader): BindingMap {
  return resolveBindings(preferences.get(BINDINGS_PREFERENCE_KEY, ''));
}
