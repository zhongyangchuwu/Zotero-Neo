import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_THEME_CATALOG,
  INTERACTION_SEMANTIC_SLOTS,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY as PRESET,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY as CUSTOM,
  INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY as WEIGHT,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY as WIDTH,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY as STYLE,
  InteractionAppearanceManager,
  deleteCustomInteractionTheme,
  findCustomInteractionTheme,
  generateCustomInteractionThemeId,
  interactionColorPresetFromPreferences,
  interactionMarkerWidthFromPreferences,
  interactionStatusColors,
  listCustomInteractionThemes,
  normalizeInteractionColorPreset,
  parseCustomInteractionThemes,
  resolveInteractionAppearance,
  seedCustomInteractionTheme,
  serializeCustomInteractionThemes,
  upsertCustomInteractionTheme,
  type CustomInteractionTheme,
  type InteractionAppearancePreferenceSource,
  type InteractionAppearanceThemeSource,
  type InteractionPalette8,
} from '../../src/main/interaction-appearance';
import type { ResolvedTheme } from '../../src/ui/theme';

class Preferences implements InteractionAppearancePreferenceSource {
  readonly values = new Map<string, boolean | number | string>();
  readonly listeners = new Map<string, Set<() => void>>();
  constructor(initial: Record<string, boolean | number | string> = {}) {
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
  set(key: string, value: boolean | number | string): void {
    this.values.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, group) => count + group.size, 0);
  }
}
class ThemeSource implements InteractionAppearanceThemeSource {
  theme: ResolvedTheme = 'light';
  readonly listeners = new Set<(theme: ResolvedTheme) => void>();
  observe(listener: (theme: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(theme: ResolvedTheme): void {
    this.theme = theme;
    for (const listener of this.listeners) listener(theme);
  }
}
const LIGHT: InteractionPalette8 = {
  black: '#202020',
  red: '#AA0000',
  green: '#00AA00',
  yellow: '#CC9900',
  blue: '#0000AA',
  magenta: '#AA00AA',
  cyan: '#00AAAA',
  white: '#FAFAFA',
};
const DARK: InteractionPalette8 = {
  black: '#161616',
  red: '#FF2222',
  green: '#00FF00',
  yellow: '#FFFF00',
  blue: '#2222FF',
  magenta: '#FF00FF',
  cyan: '#00FFFF',
  white: '#F0F0F0',
};
function custom(changes: Partial<CustomInteractionTheme> = {}): CustomInteractionTheme {
  return { id: 'custom:study', name: 'Study', version: 2, light: LIGHT, dark: DARK, ...changes };
}
function contrast(background: string, foreground: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((offset) => {
      const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
  };
  const a = luminance(background);
  const b = luminance(foreground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const EXPECTED = [
  {
    id: 'zotero',
    name: 'Zotero',
    light: ['#3B4252', '#B42318', '#287A43', '#9A6700', '#2563EB', '#7C3AED', '#0E7490', '#ECEFF4'],
    dark: ['#2E3440', '#FF7B72', '#56D364', '#E3B341', '#58A6FF', '#BC8CFF', '#39C5CF', '#D8DEE9'],
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    light: ['#4C4F69', '#D20F39', '#40A02B', '#DF8E1D', '#1E66F5', '#EA76CB', '#179299', '#EFF1F5'],
    dark: ['#1E1E2E', '#F38BA8', '#A6E3A1', '#F9E2AF', '#89B4FA', '#F5C2E7', '#94E2D5', '#CDD6F4'],
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    light: ['#3760BF', '#F52A65', '#587539', '#8C6C3E', '#2E7DE9', '#9854F1', '#007197', '#E1E2E7'],
    dark: ['#1A1B26', '#F7768E', '#9ECE6A', '#E0AF68', '#7AA2F7', '#BB9AF7', '#7DCFFF', '#C0CAF5'],
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    light: ['#3C3836', '#9D0006', '#79740E', '#B57614', '#076678', '#8F3F71', '#427B58', '#FBF1C7'],
    dark: ['#282828', '#FB4934', '#B8BB26', '#FABD2F', '#83A598', '#D3869B', '#8EC07C', '#EBDBB2'],
  },
];
const SLOTS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;

describe('interaction theme v2 contract', () => {
  it('exposes the four exact eight-slot built-ins in light and dark', () => {
    expect(INTERACTION_THEME_CATALOG.map(({ id, name }) => ({ id, name }))).toEqual(
      EXPECTED.map(({ id, name }) => ({ id, name })),
    );
    for (const [index, entry] of INTERACTION_THEME_CATALOG.entries()) {
      for (const mode of ['light', 'dark'] as const) {
        expect(Object.keys(entry[mode])).toEqual(SLOTS);
        expect(SLOTS.map((slot) => entry[mode][slot])).toEqual(EXPECTED[index]![mode]);
      }
    }
    expect(DEFAULT_INTERACTION_COLOR_PRESET).toBe('zotero');
    expect(interactionColorPresetFromPreferences(new Preferences())).toBe('zotero');
    expect(INTERACTION_SEMANTIC_SLOTS).toEqual({
      selection: 'yellow',
      visual: 'green',
      primary: 'blue',
      danger: 'red',
      info: 'cyan',
      secondary: 'magenta',
    });
  });

  it('resolves legacy IDs without rewriting preferences', () => {
    for (const [old, current] of [
      ['primer-neutral', 'zotero'],
      ['soft-academic', 'zotero'],
      ['yazi-like', 'catppuccin'],
    ] as const) {
      const preferences = new Preferences({ [PRESET]: old });
      const write = vi.spyOn(preferences, 'set');
      expect(normalizeInteractionColorPreset(old)).toBe(current);
      expect(interactionColorPresetFromPreferences(preferences)).toBe(current);
      expect(resolveInteractionAppearance(preferences, 'dark').colorPreset).toBe(current);
      expect(preferences.get(PRESET, '')).toBe(old);
      expect(write).not.toHaveBeenCalled();
    }
    expect(normalizeInteractionColorPreset('unknown')).toBe('zotero');
  });

  it('reads and serializes v2, canonicalizes hex and rejects invalid or reserved records', () => {
    const lowercase = custom({ light: { ...LIGHT, yellow: '#abcdef' } });
    const parsed = parseCustomInteractionThemes(
      JSON.stringify({ version: 2, themes: [lowercase] }),
    );
    expect(parsed.themes[0]?.light.yellow).toBe('#ABCDEF');
    expect(JSON.parse(serializeCustomInteractionThemes(parsed))).toEqual(parsed);
    expect(findCustomInteractionTheme(parsed, lowercase.id)?.name).toBe('Study');
    expect(listCustomInteractionThemes(parsed)).toHaveLength(1);
    const renamed = upsertCustomInteractionTheme(parsed, custom({ name: 'Renamed' }));
    expect(renamed.themes[0]?.name).toBe('Renamed');
    expect(parsed.themes[0]?.name).toBe('Study');
    expect(deleteCustomInteractionTheme(renamed, lowercase.id).themes).toEqual([]);
    for (const id of [
      ...INTERACTION_THEME_CATALOG.map((entry) => entry.id),
      'primer-neutral',
      'soft-academic',
      'yazi-like',
    ]) {
      expect(parseCustomInteractionThemes({ version: 2, themes: [custom({ id })] }).themes).toEqual(
        [],
      );
      expect(() => upsertCustomInteractionTheme(parsed, custom({ id }))).toThrow();
    }
    expect(
      parseCustomInteractionThemes({ version: 2, themes: [custom({ id: 'toString' })] }).themes[0]
        ?.id,
    ).toBe('toString');
    expect(
      parseCustomInteractionThemes({ version: 2, themes: [custom(), custom({ name: 'Later' })] })
        .themes,
    ).toEqual([custom()]);
    expect(() =>
      serializeCustomInteractionThemes({ version: 2, themes: [custom(), custom()] }),
    ).toThrow();
    expect(
      parseCustomInteractionThemes({
        version: 2,
        themes: [custom({ dark: { ...DARK, cyan: 'blue' } })],
      }).themes,
    ).toEqual([]);
  });

  it('converts valid v1 records exactly without startup writes or carried style and width', () => {
    const old = {
      id: 'custom:study',
      name: 'Study',
      version: 1,
      light: {
        selection: '#aabbcc',
        visual: '#112233',
        statusBackground: '#fafafa',
        statusForeground: '#202020',
        statusBorder: '#aaaaaa',
      },
      dark: {
        selection: '#ddeeff',
        visual: '#334455',
        statusBackground: '#161616',
        statusForeground: '#f0f0f0',
        statusBorder: '#555555',
      },
      markerWidth: 1,
      statusStyle: 'tinted',
    };
    const preferences = new Preferences({
      [PRESET]: old.id,
      [CUSTOM]: JSON.stringify({ version: 1, themes: [old] }),
    });
    const writes = vi.spyOn(preferences, 'set');
    const converted = parseCustomInteractionThemes(preferences.get(CUSTOM, ''));
    expect(converted).toEqual({
      version: 2,
      themes: [
        {
          id: old.id,
          name: old.name,
          version: 2,
          light: {
            ...INTERACTION_THEME_CATALOG[0]!.light,
            yellow: '#AABBCC',
            green: '#112233',
            black: '#202020',
            white: '#FAFAFA',
          },
          dark: {
            ...INTERACTION_THEME_CATALOG[0]!.dark,
            yellow: '#DDEEFF',
            green: '#334455',
            black: '#161616',
            white: '#F0F0F0',
          },
        },
      ],
    });
    expect(resolveInteractionAppearance(preferences, 'light').marker.width).toBe(3);
    expect(resolveInteractionAppearance(preferences, 'light').statusStyle).toBe('neutral');
    expect(writes).not.toHaveBeenCalled();
    expect(JSON.parse(serializeCustomInteractionThemes(converted)).version).toBe(2);
    expect(
      parseCustomInteractionThemes({ version: 1, themes: [{ ...old, markerWidth: 5 }] }).themes,
    ).toEqual([]);
  });

  it('fails safe on malformed containers and skips invalid records', () => {
    for (const raw of [
      '',
      '{',
      '{}',
      { version: 3, themes: [custom()] },
      { version: 2 },
      { version: 1, themes: null },
    ]) {
      expect(parseCustomInteractionThemes(raw)).toEqual({ version: 2, themes: [] });
    }
    expect(
      parseCustomInteractionThemes({
        version: 2,
        themes: [custom({ light: { ...LIGHT, red: 'red' } }), custom()],
      }).themes,
    ).toEqual([custom()]);
    expect(() => serializeCustomInteractionThemes({ version: 1, themes: [] } as never)).toThrow();
  });

  it('maps semantics and neutral surfaces from each built-in palette', () => {
    for (const entry of INTERACTION_THEME_CATALOG)
      for (const mode of ['light', 'dark'] as const) {
        const appearance = resolveInteractionAppearance(
          new Preferences({ [PRESET]: entry.id }),
          mode,
        );
        expect(appearance.colors.selectionMarker).toBe(entry[mode].yellow);
        expect(appearance.colors.visualMarker).toBe(entry[mode].green);
        expect(interactionStatusColors(appearance, 'selection')).toMatchObject({
          background: entry[mode][mode === 'light' ? 'white' : 'black'],
          foreground: entry[mode][mode === 'light' ? 'black' : 'white'],
        });
        expect(appearance.colors.neutralStatusBorder).toMatch(/^#[0-9A-F]{6}$/);
      }
  });

  it('resolves custom modes while keeping status style and width independent', () => {
    const preferences = new Preferences({
      [PRESET]: 'custom:study',
      [CUSTOM]: serializeCustomInteractionThemes({ version: 2, themes: [custom()] }),
      [STYLE]: 'tinted',
      [WIDTH]: 1,
    });
    for (const [mode, palette] of [
      ['light', LIGHT],
      ['dark', DARK],
    ] as const) {
      const appearance = resolveInteractionAppearance(preferences, mode);
      expect(appearance.colorPreset).toBe('custom:study');
      expect(appearance.colors.selectionMarker).toBe(palette.yellow);
      expect(appearance.colors.visualMarker).toBe(palette.green);
      expect(appearance.colors.neutralStatusBackground).toBe(
        mode === 'light' ? palette.white : palette.black,
      );
      expect(appearance.colors.neutralStatusForeground).toBe(
        mode === 'light' ? palette.black : palette.white,
      );
      expect(appearance.statusStyle).toBe('tinted');
      expect(appearance.marker.width).toBe(1);
      for (const kind of ['selection', 'visual'] as const) {
        const tinted = interactionStatusColors(appearance, kind);
        expect(contrast(tinted.background, tinted.foreground)).toBeGreaterThanOrEqual(4.5);
        expect(tinted.background).not.toBe(
          appearance.colors[kind === 'selection' ? 'selectionMarker' : 'visualMarker'],
        );
        expect(tinted.border).not.toBe(
          appearance.colors[kind === 'selection' ? 'selectionMarker' : 'visualMarker'],
        );
      }
    }
  });

  it('keeps tinted built-in status readable with derived borders', () => {
    for (const entry of INTERACTION_THEME_CATALOG)
      for (const mode of ['light', 'dark'] as const) {
        const appearance = resolveInteractionAppearance(
          new Preferences({ [PRESET]: entry.id, [STYLE]: 'tinted' }),
          mode,
        );
        for (const kind of ['selection', 'visual'] as const) {
          const colors = interactionStatusColors(appearance, kind);
          expect(contrast(colors.background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
          expect(colors.border).toMatch(/^#[0-9A-F]{6}$/);
        }
      }
  });

  it('keeps Tokyo Night Day tints light and uses rendering-only contrast fallbacks', () => {
    const entry = INTERACTION_THEME_CATALOG.find(({ id }) => id === 'tokyo-night')!;
    const appearance = resolveInteractionAppearance(
      new Preferences({ [PRESET]: entry.id, [STYLE]: 'tinted' }),
      'light',
    );
    const selection = interactionStatusColors(appearance, 'selection');
    const visual = interactionStatusColors(appearance, 'visual');
    expect(selection.background).toBe('#D3CFCC'); // 16% yellow into #E1E2E7
    expect(visual.background).toBe('#CBD1CB'); // 16% green into #E1E2E7
    expect(selection.foreground).toBe('#000000');
    expect(visual.foreground).toBe('#000000');
    expect(contrast(selection.background, selection.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(visual.background, visual.foreground)).toBeGreaterThanOrEqual(4.5);
    const saved = JSON.parse(
      serializeCustomInteractionThemes({
        version: 2,
        themes: [seedCustomInteractionTheme(new Preferences(), entry.id, 'custom:copy', 'Copy')],
      }),
    );
    expect(Object.keys(saved.themes[0].light)).toEqual(SLOTS);
    expect(Object.keys(saved.themes[0].dark)).toEqual(SLOTS);
  });

  it('honors numeric width 1–4 and exact safe lanes above legacy weight', () => {
    for (const [width, selectionLeft, visualLeft, radius] of [
      [1, 1, 14, 1],
      [2, 1, 13, 1],
      [3, 0, 13, 2],
      [4, 0, 12, 2],
    ]) {
      const preferences = new Preferences({ [WIDTH]: width, [WEIGHT]: 'strong' });
      expect(interactionMarkerWidthFromPreferences(preferences)).toBe(width);
      expect(resolveInteractionAppearance(preferences, 'light').marker).toEqual({
        width,
        selectionLeft,
        visualLeft,
        radius,
      });
    }
    for (const [weight, width] of [
      ['compact', 2],
      ['balanced', 3],
      ['strong', 4],
    ] as const) {
      for (const invalid of [0, 5, 1.5, '2']) {
        const preferences = new Preferences({ [WIDTH]: invalid, [WEIGHT]: weight });
        expect(interactionMarkerWidthFromPreferences(preferences)).toBe(width);
        expect(resolveInteractionAppearance(preferences, 'light').marker.width).toBe(width);
      }
    }
  });

  it('copies all eight slots in both modes from built-in, custom, aliases or fallback', () => {
    const preferences = new Preferences({
      [CUSTOM]: serializeCustomInteractionThemes({ version: 2, themes: [custom()] }),
      [WEIGHT]: 'strong',
      [STYLE]: 'tinted',
    });
    for (const source of [...INTERACTION_THEME_CATALOG, custom()]) {
      const seeded = seedCustomInteractionTheme(preferences, source.id, 'custom:copy', 'Copy');
      expect(seeded).toEqual({
        id: 'custom:copy',
        name: 'Copy',
        version: 2,
        light: source.light,
        dark: source.dark,
      });
      expect(seeded.light).not.toBe(source.light);
      expect(seeded.dark).not.toBe(source.dark);
    }
    expect(
      seedCustomInteractionTheme(preferences, 'yazi-like', 'custom:copy', 'Copy').light,
    ).toEqual(INTERACTION_THEME_CATALOG[1]!.light);
    expect(seedCustomInteractionTheme(preferences, 'missing', 'custom:copy', 'Copy').dark).toEqual(
      INTERACTION_THEME_CATALOG[0]!.dark,
    );
    for (const id of [
      'zotero',
      'gruvbox',
      'primer-neutral',
      'yazi-like',
      'custom:used',
      'bad id',
    ]) {
      expect(generateCustomInteractionThemeId(['custom:used', 'custom:theme-1'], () => id)).toBe(
        'custom:theme-2',
      );
    }
  });

  it('observes preference and mode changes, isolates drafts, and releases observers', () => {
    const preferences = new Preferences({
      [PRESET]: 'custom:study',
      [CUSTOM]: serializeCustomInteractionThemes({ version: 2, themes: [custom()] }),
    });
    const mode = new ThemeSource();
    const manager = new InteractionAppearanceManager(preferences, mode);
    const other = new InteractionAppearanceManager(preferences, mode);
    const seen = vi.fn();
    manager.observe(seen);
    manager.setDraft(custom({ light: { ...LIGHT, yellow: '#123456' } }));
    expect(manager.appearance.colors.selectionMarker).toBe('#123456');
    expect(other.appearance.colors.selectionMarker).toBe(LIGHT.yellow);
    mode.set('dark');
    expect(manager.appearance.colors.selectionMarker).toBe(DARK.yellow);
    preferences.set(WIDTH, 4);
    expect(manager.appearance.marker.width).toBe(4);
    manager.clearDraft();
    mode.set('light');
    expect(manager.appearance.colors.selectionMarker).toBe(LIGHT.yellow);
    preferences.set(
      CUSTOM,
      serializeCustomInteractionThemes({
        version: 2,
        themes: [custom({ light: { ...LIGHT, yellow: '#ABCDEF' } })],
      }),
    );
    expect(manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    expect(seen).toHaveBeenCalledTimes(5);
    expect(() => manager.setDraft(custom({ dark: { ...DARK, red: 'invalid' } }))).toThrow();
    manager.dispose();
    other.dispose();
    expect(preferences.listenerCount()).toBe(0);
    expect(mode.listeners.size).toBe(0);
  });
});
