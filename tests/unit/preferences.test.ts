import { describe, expect, it } from 'vitest';

import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';
import { advanceInput } from '../../src/input/engine';
import { bindingsForMode } from '../../src/input/bindings';

import {
  BINDING_SCHEMA_VERSION,
  KEY_GUIDE_DELAY_PREFERENCE_KEY,
  KEY_GUIDE_ENABLED_PREFERENCE_KEY,
  KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY,
  NOTE_EDITOR_ENABLED_PREFERENCE_KEY,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY,
  READER_SCROLL_MODE_PREFERENCE_KEY,
  bindingsFromPreferences,
  keyGuideConfig,
  migrateBindingPreferences,
  normalizeKeyGuideNumber,
  migrateReaderPreferences,
  normalizeReaderScrollNumber,
  noteEditorEnabled,
  pickerMouseEnabled,
  readerDefaultHighlightColor,
  readerMarksPersist,
  readerModeEnabled,
  readerScrollConfig,
  scrollModeFromPreferences,
  smoothScrollConfig,
  type PreferenceWriter,
} from '../../src/core/preferences';

class TestPreferences implements PreferenceWriter {
  readonly writes: Array<readonly [string, boolean | number | string]> = [];
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
    this.writes.push([key, value]);
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

  it('persists the legacy smoothScroll boolean into scroll.mode once', () => {
    const enabled = new TestPreferences({ smoothScroll: true });
    migrateReaderPreferences(enabled);
    expect(enabled.writes).toEqual([[READER_SCROLL_MODE_PREFERENCE_KEY, 'trapezoid']]);
    expect(scrollModeFromPreferences(enabled)).toBe('trapezoid');
    migrateReaderPreferences(enabled);
    expect(enabled.writes).toHaveLength(1);

    const disabled = new TestPreferences({ smoothScroll: false });
    migrateReaderPreferences(disabled);
    expect(disabled.writes).toEqual([[READER_SCROLL_MODE_PREFERENCE_KEY, 'step']]);

    const explicit = new TestPreferences({ 'scroll.mode': 'follow', smoothScroll: true });
    migrateReaderPreferences(explicit);
    expect(explicit.writes).toEqual([]);

    const fresh = new TestPreferences({});
    migrateReaderPreferences(fresh);
    expect(fresh.writes).toEqual([]);
  });

  it('normalizes Reader scroll numbers through one canonical configuration', () => {
    const preferences = new TestPreferences({
      scrollStep: -40,
      'smoothScroll.followSpeed': 9000,
      'smoothScroll.initialSpeed': 2500,
      'smoothScroll.maxSpeed': 100,
      'smoothScroll.acceleration': 50,
      'smoothScroll.deceleration': 20000,
      'smoothScroll.stopOnRelease': true,
    });

    expect(readerScrollConfig(preferences)).toEqual({
      mode: 'follow',
      scrollStep: 10,
      followSpeed: 6000,
      initialSpeed: 2000,
      maxSpeed: 2000,
      acceleration: 100,
      deceleration: 12000,
      stopOnRelease: true,
    });
    expect(normalizeReaderScrollNumber('scrollStep', Number.NaN)).toBe(60);
    expect(normalizeReaderScrollNumber('followSpeed', 1234.9)).toBe(1234);
  });

  it('normalizes Reader mode, marks, and highlight preferences', () => {
    const defaults = new TestPreferences({});
    expect(readerModeEnabled(defaults, 'visual')).toBe(true);
    expect(readerModeEnabled(defaults, 'insert')).toBe(true);
    expect(readerMarksPersist(defaults)).toBe(false);
    expect(readerDefaultHighlightColor(defaults)).toBe('yellow');

    const configured = new TestPreferences({
      'mode.visual.enabled': false,
      'mode.insert.enabled': false,
      'marks.persist': true,
      defaultHighlightColor: 'purple',
    });
    expect(readerModeEnabled(configured, 'visual')).toBe(false);
    expect(readerModeEnabled(configured, 'insert')).toBe(false);
    expect(readerMarksPersist(configured)).toBe(true);
    expect(readerDefaultHighlightColor(configured)).toBe('purple');

    expect(
      readerDefaultHighlightColor(new TestPreferences({ defaultHighlightColor: 'orange' })),
    ).toBe('yellow');
  });
});

describe('binding preferences', () => {
  it('merges valid custom bindings over the defaults', () => {
    const preferences = new TestPreferences({
      bindings: JSON.stringify({ 'reader-normal:j': 'scrollUp', 'main-normal:x': 'mainActivate' }),
    });

    const bindings = bindingsFromPreferences(preferences);
    expect(bindings['reader-normal:j']).toBe('scrollUp');
    expect(bindings['reader-normal:k']).toBe('scrollUp');
    expect(bindings['main-normal:x']).toBe('mainActivate');
  });

  it('falls back to default bindings when the preference is malformed', () => {
    const preferences = new TestPreferences({ bindings: '{"reader-normal:j":' });

    const bindings = bindingsFromPreferences(preferences);
    expect(bindings['reader-normal:j']).toBe('scrollDown');
    expect(bindings['main-normal:<Enter>']).toBe('mainActivate');
    expect(bindings['reader-normal:<Space>fn']).toBe('findNotes');
    expect(bindings['main-normal:<Space>fn']).toBe('findNotes');
    expect(bindings['reader-normal: n']).toBeUndefined();
    expect(bindings['main-normal: n']).toBeUndefined();
    expect(bindings['reader-normal:<Space>,']).toBe('switchTab');
    expect(bindings['main-normal:<Space>,']).toBe('switchTab');
    expect(bindings['main-normal:<Space>ta']).toBe('addTag');
    expect(bindings['main-normal:<Space>tr']).toBe('removeTag');
    expect(bindings['main-normal:<Space>tf']).toBe('toggleTagFilter');
    expect(bindings['main-normal:<Space>tc']).toBe('clearTagFilters');
    expect(bindings['main-normal: fT']).toBeUndefined();
    expect(bindings['reader-normal:<Space>q']).toBe('closeCurrentTab');
    expect(bindings['main-normal:<Space>q']).toBe('closeCurrentTab');
    expect(bindings['reader-normal: ft']).toBeUndefined();
    expect(bindings['main-normal: ft']).toBeUndefined();
    expect(bindings['main-normal: td']).toBeUndefined();
    expect(bindings['main-normal:u']).toBe('mainRestoreTrashedItems');
    expect(bindings['reader-normal: tp']).toBeUndefined();
    expect(bindings['main-normal: tp']).toBeUndefined();
    expect(bindings['main-normal:<C-u>']).toBeUndefined();
  });

  it('canonicalizes pre-release Tag action aliases without changing custom key sequences', () => {
    const bindings = bindingsFromPreferences(
      new TestPreferences({
        bindings: JSON.stringify({
          'reader-normal: custom-add': 'mainTagEditor',
          'main-normal: custom-filter': 'mainTagPicker',
          'main-normal: custom-find': 'mainFuzzyAll',
          'main-normal: custom-tab': 'mainTabPick',
        }),
      }),
    );

    expect(bindings['reader-normal:<Space>custom-add']).toBe('addTag');
    expect(bindings['main-normal:<Space>custom-filter']).toBe('toggleTagFilter');
    expect(bindings['main-normal:<Space>custom-find']).toBe('findAllItems');
    expect(bindings['main-normal:<Space>custom-tab']).toBe('switchTab');
  });

  it('migrates retired defaults and removes legacy native-search actions without dropping unrelated remaps', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 4,
      bindings: JSON.stringify({
        'reader-normal: fb': 'mainFuzzyCollection',
        'main-normal: bj': 'mainTabPick',
        'main-normal: legacy-search': 'mainFocusSearch',
        'main-normal: old-advanced': 'mainAdvancedSearch',
        'main-normal:x': 'mainActivate',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:x': 'mainActivate',
    });
    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['main-normal: legacy-search']).toBeUndefined();
    expect(resolved['main-normal: old-advanced']).toBeUndefined();
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);

    preferences.set('bindings', JSON.stringify({ 'main-normal: q': 'closeCurrentTab' }));
    migrateBindingPreferences(preferences);
    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal: q': 'closeCurrentTab',
    });
  });

  it('retires only exact old H/L and J/K defaults while preserving custom rows', () => {
    const exact = new TestPreferences({
      'bindings.schemaVersion': 5,
      bindings: JSON.stringify({
        'reader-normal:H': 'scrollLeft',
        'reader-normal:L': 'scrollRight',
        'reader-normal:J': 'mainPrevTab',
        'reader-normal:K': 'mainNextTab',
        'main-normal:J': 'mainPrevTab',
        'main-normal:K': 'mainNextTab',
        'main-normal:x': 'mainActivate',
      }),
    });
    migrateBindingPreferences(exact);
    expect(JSON.parse(exact.get('bindings', ''))).toEqual({ 'main-normal:x': 'mainActivate' });
    expect(exact.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
    expect(bindingsFromPreferences(exact)['reader-normal:H']).toBe('previousTab');
    expect(bindingsFromPreferences(exact)['reader-normal:zh']).toBe('scrollLeft');

    const custom = new TestPreferences({
      'bindings.schemaVersion': 5,
      bindings: JSON.stringify({
        'reader-normal:H': 'scrollRight',
        'reader-normal:L': 'scrollLeft',
        'reader-normal:J': 'mainNextTab',
        'reader-normal:K': 'mainPrevTab',
        'main-normal:J': 'mainNextTab',
        'main-normal:K': 'mainPrevTab',
      }),
    });
    migrateBindingPreferences(custom);
    expect(JSON.parse(custom.get('bindings', ''))).toEqual({
      'reader-normal:H': 'scrollRight',
      'reader-normal:L': 'scrollLeft',
      'reader-normal:J': 'nextTab',
      'reader-normal:K': 'previousTab',
      'main-normal:J': 'nextTab',
      'main-normal:K': 'previousTab',
    });
    expect(custom.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
    expect(bindingsFromPreferences(custom)['reader-normal:H']).toBe('scrollRight');
    expect(bindingsFromPreferences(custom)['main-normal:J']).toBe('nextTab');
  });
  it('moves schema-10 explicit unbindings to the final semantic leader keys', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 10,
      bindings: JSON.stringify({
        'reader-normal: ft': null,
        'reader-normal: td': null,
        'note-normal: ft': null,
        'note-normal: td': null,
        'note-normal: fT': null,
        'main-normal: ft': null,
        'main-normal: td': null,
        'main-normal: fT': null,
        'main-normal: custom-tab': 'mainTabPick',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:<Space>,': null,
      'main-normal:<Space>q': null,
      'main-normal:<Space>tf': null,
      'main-normal:custom-tab': 'switchTab',
      'note-normal:<Space>,': null,
      'note-normal:<Space>q': null,
      'reader-normal:<Space>,': null,
      'reader-normal:<Space>q': null,
    });
    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['reader-normal:<Space>,']).toBeUndefined();
    expect(resolved['reader-normal:<Space>q']).toBeUndefined();
    expect(resolved['note-normal:<Space>,']).toBeUndefined();
    expect(resolved['note-normal:<Space>q']).toBeUndefined();
    expect(resolved['main-normal:<Space>,']).toBeUndefined();
    expect(resolved['main-normal:<Space>q']).toBeUndefined();
    expect(resolved['main-normal:<Space>tf']).toBeUndefined();
    expect(resolved['main-normal:custom-tab']).toBe('switchTab');
    expect(resolved['main-normal:<Space>ta']).toBe('addTag');
  });

  it('carries schema-11 Main default unbindings through the restored Space leader', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 11,
      bindings: JSON.stringify({
        'main-normal: ff': null,
        'main-normal: ta': null,
        'main-normal: q': null,
        'main-normal: e': null,
        'main-normal: custom': 'nextTab',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:<Space>ff': null,
      'main-normal:<Space>q': null,
      'main-normal:<Space>ta': null,
      'main-normal:custom': 'nextTab',
      'main-normal:e': null,
    });
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['main-normal:<Space>ff']).toBeUndefined();
    expect(resolved['main-normal:<Space>ta']).toBeUndefined();
    expect(resolved['main-normal:<Space>q']).toBeUndefined();
    expect(resolved['main-normal:e']).toBeUndefined();
    expect(resolved['main-normal:<Space>fc']).toBe('findCollectionItems');
    expect(resolved['reader-normal:<Space>ff']).toBe('findAllItems');
  });

  it('migrates schema-12 flat key strings to Neovim notation', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 12,
      bindings: JSON.stringify({
        'main-normal:ctrl+dg': 'mainActivate',
        'main-normal:enter': 'mainFocusTree',
        'reader-normal: ff': null,
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:<C-d>g': 'mainActivate',
      'main-normal:<Enter>': 'mainFocusTree',
      'reader-normal:<Space>ff': null,
    });
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
  });

  it('preserves schema-13 custom direct migrations while restoring Space as leader', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 13,
      bindings: JSON.stringify({
        'main-normal:<Space>': 'previousTab',
        'main-normal:<Space>zx': 'nextTab',
        'main-normal:<Space>ff': 'previousTab',
        'main-normal:ff': 'findNotes',
        'reader-normal:<Space>zx': 'nextTab',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:ff': 'findNotes',
      'main-normal:zx': 'nextTab',
      'reader-normal:<Space>zx': 'nextTab',
    });
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);

    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['main-normal:<Space>']).toBeUndefined();
    expect(resolved['main-normal:s']).toBe('mainToggleSelection');
    expect(resolved['main-normal:<Space>zx']).toBeUndefined();
    expect(resolved['main-normal:zx']).toBe('nextTab');
    expect(resolved['main-normal:ff']).toBe('findNotes');
    expect(resolved['main-normal:<Space>ff']).toBe('findAllItems');
    expect(resolved['reader-normal:<Space>zx']).toBe('nextTab');
  });

  it('moves schema-14 Selection Space overrides to s and default tombstones back under Space', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 14,
      bindings: JSON.stringify({
        'main-normal:<Space>': 'previousTab',
        'main-select:<Space>': null,
        'main-normal:ff': null,
        'main-normal:ta': null,
        'main-normal:q': null,
        'main-normal:custom': 'nextTab',
      }),
    });

    migrateBindingPreferences(preferences);

    expect(JSON.parse(preferences.get('bindings', ''))).toEqual({
      'main-normal:<Space>ff': null,
      'main-normal:<Space>q': null,
      'main-normal:<Space>ta': null,
      'main-normal:custom': 'nextTab',
      'main-normal:s': 'previousTab',
      'main-select:s': null,
    });
    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['main-normal:<Space>ff']).toBeUndefined();
    expect(resolved['main-normal:<Space>ta']).toBeUndefined();
    expect(resolved['main-normal:<Space>q']).toBeUndefined();
    expect(resolved['main-normal:s']).toBe('previousTab');
    expect(resolved['main-select:s']).toBeUndefined();
    expect(resolved['main-normal:custom']).toBe('nextTab');
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
  });

  it('preserves schema-15 custom Space-s dispatch around new Selection defaults', () => {
    const exact = new TestPreferences({
      'bindings.schemaVersion': 15,
      bindings: JSON.stringify({ 'main-normal:<Space>s': 'nextTab' }),
    });
    migrateBindingPreferences(exact);
    expect(JSON.parse(exact.get('bindings', ''))).toEqual({
      'main-normal:<Space>s': 'nextTab',
      'main-normal:<Space>sc': null,
      'main-normal:<Space>ss': null,
    });
    const bindings = bindingsForMode(bindingsFromPreferences(exact), 'main-normal');
    const leader = advanceInput(
      { mode: 'main-normal', keyBuffer: '', countBuffer: '', bindings, allowCountPrefix: true },
      ' ',
    );
    expect(leader.kind).toBe('pending');
    expect(advanceInput({ ...leader.state, bindings, allowCountPrefix: true }, 's')).toMatchObject({
      kind: 'execute',
      action: 'nextTab',
    });

    const descendants = new TestPreferences({
      'bindings.schemaVersion': 15,
      bindings: JSON.stringify({
        'main-normal:<Space>ssx': 'nextTab',
        'main-normal:<Space>scx': 'previousTab',
      }),
    });
    migrateBindingPreferences(descendants);
    expect(JSON.parse(descendants.get('bindings', ''))).toEqual({
      'main-normal:<Space>sc': null,
      'main-normal:<Space>scx': 'previousTab',
      'main-normal:<Space>ss': null,
      'main-normal:<Space>ssx': 'nextTab',
    });

    const explicit = new TestPreferences({
      'bindings.schemaVersion': 15,
      bindings: JSON.stringify({
        'main-normal:<Space>s': 'nextTab',
        'main-normal:<Space>ss': 'manageSelection',
      }),
    });
    migrateBindingPreferences(explicit);
    expect(JSON.parse(explicit.get('bindings', ''))).toEqual({
      'main-normal:<Space>s': 'nextTab',
      'main-normal:<Space>sc': null,
      'main-normal:<Space>ss': 'manageSelection',
    });
  });

  it('migrates schema 9 yank unbindings to Y while preserving genuine custom yy chords', () => {
    const unbound = new TestPreferences({
      'bindings.schemaVersion': 9,
      bindings: JSON.stringify({
        'reader-normal:yy': null,
        'reader-select:yy': null,
      }),
    });

    migrateBindingPreferences(unbound);

    expect(JSON.parse(unbound.get('bindings', ''))).toEqual({
      'reader-normal:Y': null,
    });
    expect(unbound.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
    const resolvedUnbound = bindingsFromPreferences(unbound);
    expect(resolvedUnbound['reader-normal:y']).toBe('yankAnnotation');
    expect(resolvedUnbound['reader-normal:Y']).toBeUndefined();
    expect(resolvedUnbound['reader-normal:yy']).toBeUndefined();
    expect(resolvedUnbound['reader-select:y']).toBe('copySelection');
    expect(resolvedUnbound['reader-select:yy']).toBeUndefined();

    const custom = new TestPreferences({
      'bindings.schemaVersion': 9,
      bindings: JSON.stringify({
        'reader-normal:Y': null,
        'reader-normal:yy': 'scrollDown',
        'reader-select:yy': 'searchSelection',
      }),
    });

    migrateBindingPreferences(custom);

    expect(JSON.parse(custom.get('bindings', ''))).toEqual({
      'reader-normal:Y': null,
      'reader-normal:yy': 'scrollDown',
      'reader-select:yy': 'searchSelection',
    });
    expect(custom.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);
    const resolvedCustom = bindingsFromPreferences(custom);
    expect(resolvedCustom['reader-normal:Y']).toBeUndefined();
    expect(resolvedCustom['reader-normal:yy']).toBe('scrollDown');
    expect(resolvedCustom['reader-select:yy']).toBe('searchSelection');
  });

  it('migrates schema 6 to compact storage before versioning and remains idempotent', () => {
    const preferences = new TestPreferences({
      'bindings.schemaVersion': 6,
      bindings: JSON.stringify({
        'reader-normal:j': 'scrollDown',
        'reader-normal:H': 'scrollRight',
        'reader-normal:L': 'scrollLeft',
        'reader-normal:J': 'nextTab',
        'reader-normal:K': 'previousTab',
        'main-normal:J': 'nextTab',
        'main-normal:K': 'previousTab',
        'main-normal:x': 'mainActivate',
        'main-normal:enter': 'mainActivate',
      }),
    });

    migrateBindingPreferences(preferences);

    const persisted = preferences.get('bindings', '');
    expect(JSON.parse(persisted)).toEqual({
      'main-normal:J': 'nextTab',
      'main-normal:K': 'previousTab',
      'main-normal:x': 'mainActivate',
      'reader-normal:H': 'scrollRight',
      'reader-normal:J': 'nextTab',
      'reader-normal:K': 'previousTab',
      'reader-normal:L': 'scrollLeft',
    });
    expect(preferences.writes).toHaveLength(2);
    expect(preferences.writes[0]).toEqual(['bindings', persisted]);
    expect(preferences.writes[1]).toEqual(['bindings.schemaVersion', BINDING_SCHEMA_VERSION]);
    expect(preferences.get('bindings.schemaVersion', 0)).toBe(BINDING_SCHEMA_VERSION);

    const resolved = bindingsFromPreferences(preferences);
    expect(resolved['reader-normal:H']).toBe('scrollRight');
    expect(resolved['reader-normal:L']).toBe('scrollLeft');
    expect(resolved['reader-normal:J']).toBe('nextTab');
    expect(resolved['reader-normal:K']).toBe('previousTab');
    expect(resolved['main-normal:J']).toBe('nextTab');
    expect(resolved['main-normal:K']).toBe('previousTab');
    expect(resolved['reader-normal:zh']).toBe('scrollLeft');
    expect(resolved['reader-normal:zl']).toBe('scrollRight');
    expect(resolved['main-normal:H']).toBe('previousTab');
    expect(resolved['main-normal:L']).toBe('nextTab');

    const writeCount = preferences.writes.length;
    migrateBindingPreferences(preferences);
    expect(preferences.writes).toHaveLength(writeCount);
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
          [KEY_GUIDE_DELAY_PREFERENCE_KEY]: KEY_GUIDE_CONFIG.maxDelayMs + 1_000,
          [KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY]: KEY_GUIDE_CONFIG.maxFontSizePx + 10,
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
          [KEY_GUIDE_ENABLED_PREFERENCE_KEY]: false,
          [KEY_GUIDE_DELAY_PREFERENCE_KEY]: -10,
          [KEY_GUIDE_FONT_SIZE_PREFERENCE_KEY]: 1,
        }),
      ),
    ).toEqual({
      enabled: false,
      delayMs: 0,
      fontSizePx: KEY_GUIDE_CONFIG.minFontSizePx,
    });
    expect(normalizeKeyGuideNumber('delayMs', Number.NaN)).toBe(
      KEY_GUIDE_CONFIG.defaultDelayMs,
    );
    expect(normalizeKeyGuideNumber('fontSizePx', 18.9)).toBe(18);
  });
});

describe('picker preferences', () => {
  it('defaults mouse row interaction off and honors explicit values', () => {
    expect(pickerMouseEnabled(new TestPreferences({}))).toBe(false);
    expect(
      pickerMouseEnabled(new TestPreferences({ [PICKER_MOUSE_ENABLED_PREFERENCE_KEY]: false })),
    ).toBe(false);
    expect(
      pickerMouseEnabled(new TestPreferences({ [PICKER_MOUSE_ENABLED_PREFERENCE_KEY]: true })),
    ).toBe(true);
  });
});

describe('note editor preferences', () => {
  it('defaults Vim editing on and reads changes without startup migration', () => {
    const preferences = new TestPreferences({});
    expect(noteEditorEnabled(preferences)).toBe(true);
    preferences.set(NOTE_EDITOR_ENABLED_PREFERENCE_KEY, false);
    expect(noteEditorEnabled(preferences)).toBe(false);
    preferences.set(NOTE_EDITOR_ENABLED_PREFERENCE_KEY, true);
    expect(noteEditorEnabled(preferences)).toBe(true);
  });
});
