import { describe, expect, it } from 'vitest';

import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';

import {
  BINDING_SCHEMA_VERSION,
  bindingsFromPreferences,
  keyGuideConfig,
  migrateBindingPreferences,
  scrollModeFromPreferences,
  smoothScrollConfig,
  type PreferenceReader,
} from '../../src/core/preferences';

class TestPreferences implements PreferenceReader {
  private readonly values: Record<string, boolean | number | string>;
  constructor(values: Readonly<Record<string, boolean | number | string>>) {
    this.values = { ...values };
  }
  has(key: string): boolean {
    return Object.hasOwn(this.values, key);
  }

  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values[key] ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    this.values[key] = value;
  }
}

describe('scroll preferences', () => {
  it('uses follow mode when the configured mode is absent or invalid', () => {
    expect(scrollModeFromPreferences(new TestPreferences({}))).toBe('follow');
    expect(scrollModeFromPreferences(new TestPreferences({ 'scroll.mode': 'freeform' }))).toBe(
      'follow',
    );
  });

  it('migrates a present legacy smooth-scroll preference when scroll mode is absent or invalid', () => {
    expect(scrollModeFromPreferences(new TestPreferences({ smoothScroll: true }))).toBe(
      'trapezoid',
    );
    expect(
      scrollModeFromPreferences(
        new TestPreferences({
          'scroll.mode': 'freeform',
          smoothScroll: true,
        }),
      ),
    ).toBe('trapezoid');
    expect(scrollModeFromPreferences(new TestPreferences({ smoothScroll: false }))).toBe('step');
    expect(
      scrollModeFromPreferences(
        new TestPreferences({
          'scroll.mode': 'freeform',
          smoothScroll: false,
        }),
      ),
    ).toBe('step');
  });

  it('accepts supported scroll modes and resolves a complete smooth-scroll configuration', () => {
    const preferences = new TestPreferences({
      'scroll.mode': 'trapezoid',
      'smoothScroll.initialSpeed': 900,
      'smoothScroll.maxSpeed': 2400,
      'smoothScroll.acceleration': 3100,
      'smoothScroll.deceleration': 4700,
      'smoothScroll.stopOnRelease': true,
      'smoothScroll.followSpeed': 1800,
    });

    expect(scrollModeFromPreferences(preferences)).toBe('trapezoid');
    expect(smoothScrollConfig(preferences)).toEqual({
      mode: 'trapezoid',
      initialSpeed: 900,
      maxSpeed: 2400,
      acceleration: 3100,
      deceleration: 4700,
      stopOnRelease: true,
      followSpeed: 1800,
    });
  });

  it('keeps maximum speed at least as high as the configured initial speed', () => {
    const preferences = new TestPreferences({
      'smoothScroll.initialSpeed': 2000,
      'smoothScroll.maxSpeed': 1200,
    });

    expect(smoothScrollConfig(preferences)).toEqual({
      mode: 'follow',
      initialSpeed: 2000,
      maxSpeed: 2000,
      acceleration: 2600,
      deceleration: 4200,
      stopOnRelease: false,
      followSpeed: 2000,
    });
  });
});

describe('binding preferences', () => {
  it('merges valid custom bindings over the defaults', () => {
    const preferences = new TestPreferences({
      bindings: JSON.stringify({ 'normal:j': 'scrollUp', 'main:x': 'mainActivate' }),
    });

    const bindings = bindingsFromPreferences(preferences);
    expect(bindings['normal:j']).toBe('scrollUp');
    expect(bindings['normal:k']).toBe('scrollUp');
    expect(bindings['main:x']).toBe('mainActivate');
  });

  it('falls back to default bindings when the preference is malformed', () => {
    const preferences = new TestPreferences({ bindings: '{"normal:j":' });

    const bindings = bindingsFromPreferences(preferences);
    expect(bindings['normal:j']).toBe('scrollDown');
    expect(bindings['main:enter']).toBe('mainActivate');
    expect(bindings['normal: fn']).toBe('mainNotesLayout');
    expect(bindings['main: fn']).toBe('mainNotesLayout');
    expect(bindings['normal: n']).toBeUndefined();
    expect(bindings['main: n']).toBeUndefined();
    expect(bindings['normal: ft']).toBe('mainTabPick');
    expect(bindings['main: ft']).toBe('mainTabPick');
    expect(bindings['main: fT']).toBe('mainTagPicker');
    expect(bindings['main:u']).toBe('mainRestoreTrashedItems');
    expect(bindings['normal: tp']).toBeUndefined();
    expect(bindings['main: tp']).toBeUndefined();
    expect(bindings['main:ctrl+u']).toBeUndefined();
  });

  it('migrates retired defaults and removes legacy native-search actions without dropping unrelated remaps', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 4,
      bindings: JSON.stringify({
        'normal: fb': 'mainFuzzyCollection',
        'main: bj': 'mainTabPick',
        'main: legacy-search': 'mainFocusSearch',
        'main: old-advanced': 'mainAdvancedSearch',
        'main:x': 'mainActivate',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({ 'main:x': 'mainActivate' });
    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['main: legacy-search']).toBeUndefined();
    expect(resolved['main: old-advanced']).toBeUndefined();
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);

    preferences.set('bindings', JSON.stringify({ 'main: q': 'mainClosePDF' }));
    migrateBindingPreferences(preferences);
    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main: q': 'mainClosePDF',
    });
  });
});

describe('key guide preferences', () => {
  it('uses configured defaults and clamps display delay and font size', () => {
    expect(keyGuideConfig(new TestPreferences({}))).toEqual({
      enabled: true,
      delayMs: KEY_GUIDE_CONFIG.defaultDelayMs,
      fontSizePx: KEY_GUIDE_CONFIG.defaultFontSizePx,
    });
    expect(
      keyGuideConfig(
        new TestPreferences({
          'keyGuide.delayMs': KEY_GUIDE_CONFIG.maxDelayMs + 1_000,
          'keyGuide.fontSizePx': KEY_GUIDE_CONFIG.maxFontSizePx + 10,
        }),
      ),
    ).toEqual({
      enabled: true,
      delayMs: KEY_GUIDE_CONFIG.maxDelayMs,
      fontSizePx: KEY_GUIDE_CONFIG.maxFontSizePx,
    });
    expect(
      keyGuideConfig(
        new TestPreferences({
          'keyGuide.enabled': false,
          'keyGuide.delayMs': -10,
          'keyGuide.fontSizePx': 1,
        }),
      ),
    ).toEqual({
      enabled: false,
      delayMs: 0,
      fontSizePx: KEY_GUIDE_CONFIG.minFontSizePx,
    });
  });
});
