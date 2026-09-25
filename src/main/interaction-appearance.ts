import type { PreferenceReader } from '../core/preferences';
import type { ResolvedTheme } from '../ui/theme';

export const INTERACTION_COLOR_PRESET_PREFERENCE_KEY =
  'appearance.interaction.colorPreset' as const;
export const INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY =
  'appearance.interaction.markerWeight' as const;
export const INTERACTION_MARKER_WIDTH_PREFERENCE_KEY =
  'appearance.interaction.markerWidth' as const;
export const INTERACTION_STATUS_STYLE_PREFERENCE_KEY =
  'appearance.interaction.statusStyle' as const;
export const INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY =
  'appearance.interaction.customThemes' as const;

export type InteractionColorPreset = 'zotero' | 'catppuccin' | 'tokyo-night' | 'gruvbox';
export type InteractionMarkerWeight = 'compact' | 'balanced' | 'strong';
export type InteractionStatusStyle = 'neutral' | 'tinted';

export const DEFAULT_INTERACTION_COLOR_PRESET: InteractionColorPreset = 'zotero';
export const DEFAULT_INTERACTION_MARKER_WEIGHT: InteractionMarkerWeight = 'balanced';
export const DEFAULT_INTERACTION_STATUS_STYLE: InteractionStatusStyle = 'neutral';

export interface InteractionPalette8 {
  readonly black: string;
  readonly red: string;
  readonly green: string;
  readonly yellow: string;
  readonly blue: string;
  readonly magenta: string;
  readonly cyan: string;
  readonly white: string;
}

/** Semantic roles always select the same slot in either palette mode. */
export const INTERACTION_SEMANTIC_SLOTS = {
  selection: 'yellow',
  visual: 'green',
  primary: 'blue',
  danger: 'red',
  info: 'cyan',
  secondary: 'magenta',
} as const satisfies Record<string, keyof InteractionPalette8>;

export interface CustomInteractionTheme {
  readonly id: string;
  readonly name: string;
  readonly version: 2;
  readonly light: InteractionPalette8;
  readonly dark: InteractionPalette8;
}

export interface CustomInteractionThemeStore {
  readonly version: 2;
  readonly themes: readonly CustomInteractionTheme[];
}

export interface InteractionAppearancePreferenceSource extends PreferenceReader {
  observe?(key: string, listener: () => void): () => void;
}

export interface InteractionAppearanceThemeSource {
  readonly theme: ResolvedTheme;
  observe(listener: (theme: ResolvedTheme) => void): () => void;
}
export interface InteractionAppearanceColors {
  readonly selectionMarker: string;
  readonly visualMarker: string;
  readonly neutralStatusBackground: string;
  readonly neutralStatusForeground: string;
  readonly neutralStatusBorder: string;
  readonly selectionTintBackground: string;
  readonly selectionTintForeground: string;
  readonly selectionTintBorder: string;
  readonly visualTintBackground: string;
  readonly visualTintForeground: string;
  readonly visualTintBorder: string;
  readonly shadow: string;
}

export interface InteractionMarkerGeometry {
  readonly width: number;
  readonly selectionLeft: number;
  readonly visualLeft: number;
  readonly radius: number;
}

export interface InteractionAppearance {
  readonly theme: ResolvedTheme;
  readonly colorPreset: string;
  readonly markerWeight: InteractionMarkerWeight;
  readonly statusStyle: InteractionStatusStyle;
  readonly colors: InteractionAppearanceColors;
  readonly marker: InteractionMarkerGeometry;
}

export type InteractionStatusKind = 'neutral' | 'selection' | 'visual';

export interface InteractionAppearanceSource {
  readonly appearance: InteractionAppearance;
  observe(listener: (appearance: InteractionAppearance) => void): () => void;
}

export interface InteractionStatusColors {
  readonly background: string;
  readonly foreground: string;
  readonly border: string;
  readonly selectionPrefix: string;
  readonly visualPrefix: string;
  readonly shadow: string;
}
/** Canonical built-in catalog for palette resolution and future Settings presentation. */
export const INTERACTION_THEME_CATALOG: readonly {
  readonly id: InteractionColorPreset;
  readonly name: string;
  readonly light: InteractionPalette8;
  readonly dark: InteractionPalette8;
}[] = [
  {
    id: 'zotero',
    name: 'Zotero',
    light: {
      black: '#3B4252',
      red: '#B42318',
      green: '#287A43',
      yellow: '#9A6700',
      blue: '#2563EB',
      magenta: '#7C3AED',
      cyan: '#0E7490',
      white: '#ECEFF4',
    },
    dark: {
      black: '#2E3440',
      red: '#FF7B72',
      green: '#56D364',
      yellow: '#E3B341',
      blue: '#58A6FF',
      magenta: '#BC8CFF',
      cyan: '#39C5CF',
      white: '#D8DEE9',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    light: {
      black: '#4C4F69',
      red: '#D20F39',
      green: '#40A02B',
      yellow: '#DF8E1D',
      blue: '#1E66F5',
      magenta: '#EA76CB',
      cyan: '#179299',
      white: '#EFF1F5',
    },
    dark: {
      black: '#1E1E2E',
      red: '#F38BA8',
      green: '#A6E3A1',
      yellow: '#F9E2AF',
      blue: '#89B4FA',
      magenta: '#F5C2E7',
      cyan: '#94E2D5',
      white: '#CDD6F4',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    light: {
      black: '#3760BF',
      red: '#F52A65',
      green: '#587539',
      yellow: '#8C6C3E',
      blue: '#2E7DE9',
      magenta: '#9854F1',
      cyan: '#007197',
      white: '#E1E2E7',
    },
    dark: {
      black: '#1A1B26',
      red: '#F7768E',
      green: '#9ECE6A',
      yellow: '#E0AF68',
      blue: '#7AA2F7',
      magenta: '#BB9AF7',
      cyan: '#7DCFFF',
      white: '#C0CAF5',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    light: {
      black: '#3C3836',
      red: '#9D0006',
      green: '#79740E',
      yellow: '#B57614',
      blue: '#076678',
      magenta: '#8F3F71',
      cyan: '#427B58',
      white: '#FBF1C7',
    },
    dark: {
      black: '#282828',
      red: '#FB4934',
      green: '#B8BB26',
      yellow: '#FABD2F',
      blue: '#83A598',
      magenta: '#D3869B',
      cyan: '#8EC07C',
      white: '#EBDBB2',
    },
  },
];

const COLOR_PRESETS: Readonly<
  Record<InteractionColorPreset, Readonly<Record<ResolvedTheme, InteractionPalette8>>>
> = Object.fromEntries(
  INTERACTION_THEME_CATALOG.map(({ id, light, dark }) => [id, { light, dark }]),
) as Record<InteractionColorPreset, Record<ResolvedTheme, InteractionPalette8>>;
const LEGACY_PRESETS: Readonly<Record<string, InteractionColorPreset>> = {
  'primer-neutral': 'zotero',
  'soft-academic': 'zotero',
  'yazi-like': 'catppuccin',
};
const EMPTY_CUSTOM_THEMES: CustomInteractionThemeStore = { version: 2, themes: [] };
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const THEME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const PALETTE_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
] as const;

function palette(value: unknown): InteractionPalette8 | null {
  const fields = record(value);
  if (
    !fields ||
    PALETTE_KEYS.some((key) => typeof fields[key] !== 'string' || !HEX_COLOR.test(fields[key]))
  )
    return null;
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, (fields[key] as string).toUpperCase()]),
  ) as unknown as InteractionPalette8;
}

function validIdentity(
  fields: Record<string, unknown> | null,
): fields is Record<string, unknown> & { id: string; name: string } {
  return (
    !!fields &&
    typeof fields.id === 'string' &&
    THEME_ID.test(fields.id) &&
    !Object.prototype.hasOwnProperty.call(COLOR_PRESETS, fields.id) &&
    !Object.prototype.hasOwnProperty.call(LEGACY_PRESETS, fields.id) &&
    typeof fields.name === 'string' &&
    !!fields.name.trim() &&
    fields.name.trim().length <= 100 &&
    !/[\x00-\x1f\x7f]/.test(fields.name)
  );
}

function validTheme(value: unknown): CustomInteractionTheme | null {
  const fields = record(value);
  if (!validIdentity(fields) || fields.version !== 2) return null;
  const light = palette(fields.light);
  const dark = palette(fields.dark);
  return light && dark
    ? { id: fields.id, name: fields.name.trim(), version: 2, light, dark }
    : null;
}

/** Converts only valid v1 records in memory; former geometry and style belong to preferences. */
function legacyTheme(value: unknown): CustomInteractionTheme | null {
  const fields = record(value);
  if (
    !validIdentity(fields) ||
    fields.version !== 1 ||
    !Number.isInteger(fields.markerWidth) ||
    (fields.markerWidth as number) < 1 ||
    (fields.markerWidth as number) > 4 ||
    (fields.statusStyle !== 'neutral' && fields.statusStyle !== 'tinted')
  )
    return null;
  const convert = (mode: ResolvedTheme): InteractionPalette8 | null => {
    const old = record(fields[mode]);
    if (
      !old ||
      ['selection', 'visual', 'statusBackground', 'statusForeground', 'statusBorder'].some(
        (key) => typeof old[key] !== 'string' || !HEX_COLOR.test(old[key]),
      )
    )
      return null;
    return {
      ...COLOR_PRESETS.zotero[mode],
      yellow: (old.selection as string).toUpperCase(),
      green: (old.visual as string).toUpperCase(),
      black: (
        old[mode === 'light' ? 'statusForeground' : 'statusBackground'] as string
      ).toUpperCase(),
      white: (
        old[mode === 'light' ? 'statusBackground' : 'statusForeground'] as string
      ).toUpperCase(),
    };
  };
  const light = convert('light');
  const dark = convert('dark');
  return light && dark
    ? { id: fields.id, name: fields.name.trim(), version: 2, light, dark }
    : null;
}

/** Parses untrusted preference data; invalid entries are skipped, keeping the first valid ID. */
export function parseCustomInteractionThemes(raw: unknown): CustomInteractionThemeStore {
  let input = raw;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return EMPTY_CUSTOM_THEMES;
    }
  }
  const data = record(input);
  if ((data?.version !== 1 && data?.version !== 2) || !Array.isArray(data.themes))
    return EMPTY_CUSTOM_THEMES;
  const themes: CustomInteractionTheme[] = [];
  const seen = new Set<string>();
  for (const value of data.themes) {
    const theme = data.version === 1 ? legacyTheme(value) : validTheme(value);
    if (!theme || seen.has(theme.id)) continue;
    themes.push(theme);
    seen.add(theme.id);
  }
  return { version: 2, themes };
}

function checkedStore(store: CustomInteractionThemeStore): CustomInteractionThemeStore {
  if (store?.version !== 2 || !Array.isArray(store.themes)) throw new Error('Invalid theme store');
  const themes: CustomInteractionTheme[] = [];
  const seen = new Set<string>();
  for (const entry of store.themes) {
    const theme = validTheme(entry);
    if (!theme || seen.has(theme.id)) throw new Error('Invalid custom theme');
    themes.push(theme);
    seen.add(theme.id);
  }
  return { version: 2, themes };
}

export function serializeCustomInteractionThemes(store: CustomInteractionThemeStore): string {
  return JSON.stringify(checkedStore(store));
}

export function listCustomInteractionThemes(
  store: CustomInteractionThemeStore,
): readonly CustomInteractionTheme[] {
  return checkedStore(store).themes;
}

export function findCustomInteractionTheme(
  store: CustomInteractionThemeStore,
  id: string,
): CustomInteractionTheme | undefined {
  return listCustomInteractionThemes(store).find((theme) => theme.id === id);
}

export function upsertCustomInteractionTheme(
  store: CustomInteractionThemeStore,
  value: CustomInteractionTheme,
): CustomInteractionThemeStore {
  const current = checkedStore(store);
  const theme = validTheme(value);
  if (!theme) throw new Error('Invalid custom theme');
  const index = current.themes.findIndex((entry) => entry.id === theme.id);
  if (index < 0) return { version: 2, themes: [...current.themes, theme] };
  const themes = [...current.themes];
  themes[index] = theme;
  return { version: 2, themes };
}

export function deleteCustomInteractionTheme(
  store: CustomInteractionThemeStore,
  id: string,
): CustomInteractionThemeStore {
  const current = checkedStore(store);
  return { version: 2, themes: current.themes.filter((theme) => theme.id !== id) };
}

/** Copies all eight colors in both modes, never appearance settings. */
export function seedCustomInteractionTheme(
  preferences: PreferenceReader,
  sourceId: string,
  id: string,
  name: string,
): CustomInteractionTheme {
  const custom = findCustomInteractionTheme(
    parseCustomInteractionThemes(preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '')),
    sourceId,
  );
  if (custom) return { ...custom, id, name, light: { ...custom.light }, dark: { ...custom.dark } };
  const preset = normalizeInteractionColorPreset(sourceId);
  return {
    id,
    name,
    version: 2,
    light: { ...COLOR_PRESETS[preset].light },
    dark: { ...COLOR_PRESETS[preset].dark },
  };
}

/** Tries an opaque candidate, then uses a deterministic unused valid ID. */
export function generateCustomInteractionThemeId(
  existing: readonly string[],
  generate: () => string,
): string {
  const taken = new Set(existing);
  const available = (id: string): boolean =>
    THEME_ID.test(id) &&
    !Object.prototype.hasOwnProperty.call(COLOR_PRESETS, id) &&
    !Object.prototype.hasOwnProperty.call(LEGACY_PRESETS, id) &&
    !taken.has(id);
  let candidate = '';
  try {
    candidate = generate();
  } catch {}
  if (available(candidate)) return candidate;
  for (let index = 1; ; index++) {
    const fallback = `custom:theme-${index}`;
    if (available(fallback)) return fallback;
  }
}

function markerGeometry(width: number): InteractionMarkerGeometry {
  const selectionLeft = Math.floor((4 - width) / 2);
  const visualLeft = 12 + Math.ceil((4 - width) / 2);
  return { width, selectionLeft, visualLeft, radius: Math.ceil(width / 2) };
}

function blend(foreground: string, background: string, strength: number): string {
  let result = '#';
  for (const offset of [1, 3, 5]) {
    const mixed = Math.round(
      Number.parseInt(foreground.slice(offset, offset + 2), 16) * strength +
        Number.parseInt(background.slice(offset, offset + 2), 16) * (1 - strength),
    );
    result += mixed.toString(16).padStart(2, '0').toUpperCase();
  }
  return result;
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const srgb = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function readableForeground(
  background: string,
  neutral: string,
  palette: InteractionPalette8,
): string {
  const backgroundLuminance = relativeLuminance(background);
  let best = neutral;
  let bestRatio = 0;
  for (const candidate of [neutral, palette.black, palette.white, '#000000', '#FFFFFF']) {
    const luminance = relativeLuminance(candidate);
    const ratio =
      (Math.max(backgroundLuminance, luminance) + 0.05) /
      (Math.min(backgroundLuminance, luminance) + 0.05);
    if (ratio >= 4.5) return candidate;
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

function paletteColors(
  palette: InteractionPalette8,
  theme: ResolvedTheme,
): InteractionAppearanceColors {
  const background = theme === 'light' ? palette.white : palette.black;
  const foreground = theme === 'light' ? palette.black : palette.white;
  const selectionColor = palette[INTERACTION_SEMANTIC_SLOTS.selection];
  const visualColor = palette[INTERACTION_SEMANTIC_SLOTS.visual];
  const selectionTintBackground = blend(selectionColor, background, 0.16);
  const visualTintBackground = blend(visualColor, background, 0.16);
  return {
    selectionMarker: selectionColor,
    visualMarker: visualColor,
    neutralStatusBackground: background,
    neutralStatusForeground: foreground,
    neutralStatusBorder: blend(foreground, background, 0.22),
    selectionTintBackground,
    selectionTintForeground: readableForeground(selectionTintBackground, foreground, palette),
    selectionTintBorder: blend(selectionColor, background, 0.55),
    visualTintBackground,
    visualTintForeground: readableForeground(visualTintBackground, foreground, palette),
    visualTintBorder: blend(visualColor, background, 0.55),
    shadow: theme === 'light' ? 'rgba(31,35,40,0.12)' : 'rgba(0,0,0,0.35)',
  };
}

/** Resolves legacy aliases without rewriting the stored preference. */
export function normalizeInteractionColorPreset(value: string): InteractionColorPreset {
  if (Object.prototype.hasOwnProperty.call(COLOR_PRESETS, value))
    return value as InteractionColorPreset;
  return LEGACY_PRESETS[value] ?? DEFAULT_INTERACTION_COLOR_PRESET;
}

export function interactionColorPresetFromPreferences(
  preferences: PreferenceReader,
): InteractionColorPreset {
  return normalizeInteractionColorPreset(
    preferences.get(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, DEFAULT_INTERACTION_COLOR_PRESET),
  );
}
export function interactionMarkerWeightFromPreferences(
  preferences: PreferenceReader,
): InteractionMarkerWeight {
  const value = preferences.get(
    INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY,
    DEFAULT_INTERACTION_MARKER_WEIGHT,
  );
  return value === 'compact' || value === 'strong' ? value : 'balanced';
}
/** Uses an explicit integer preference when valid, otherwise the legacy weight mapping. */
export function interactionMarkerWidthFromPreferences(preferences: PreferenceReader): number {
  const width = preferences.get(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, 0);
  if (Number.isInteger(width) && width >= 1 && width <= 4) return width;
  const legacy = interactionMarkerWeightFromPreferences(preferences);
  return { compact: 2, balanced: 3, strong: 4 }[legacy];
}

export function interactionStatusStyleFromPreferences(
  preferences: PreferenceReader,
): InteractionStatusStyle {
  const value = preferences.get(
    INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
    DEFAULT_INTERACTION_STATUS_STYLE,
  );
  return value === 'tinted' ? 'tinted' : 'neutral';
}

export function resolveInteractionAppearance(
  preferences: PreferenceReader,
  theme: ResolvedTheme,
  draft: CustomInteractionTheme | null = null,
): InteractionAppearance {
  const activeId = preferences.get(
    INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    DEFAULT_INTERACTION_COLOR_PRESET,
  );
  const builtIn =
    Object.prototype.hasOwnProperty.call(COLOR_PRESETS, activeId) ||
    Object.prototype.hasOwnProperty.call(LEGACY_PRESETS, activeId);
  const custom = draft
    ? validTheme(draft)
    : builtIn
      ? null
      : (parseCustomInteractionThemes(
          preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, ''),
        ).themes.find((entry) => entry.id === activeId) ?? null);
  const colorPreset = custom?.id ?? normalizeInteractionColorPreset(activeId);
  const markerWeight = interactionMarkerWeightFromPreferences(preferences);
  return {
    theme,
    colorPreset,
    markerWeight,
    statusStyle: interactionStatusStyleFromPreferences(preferences),
    colors: paletteColors(
      custom ? custom[theme] : COLOR_PRESETS[normalizeInteractionColorPreset(activeId)][theme],
      theme,
    ),
    marker: markerGeometry(interactionMarkerWidthFromPreferences(preferences)),
  };
}
export function interactionStatusColors(
  appearance: InteractionAppearance,
  kind: InteractionStatusKind,
): InteractionStatusColors {
  const { colors } = appearance;
  if (appearance.statusStyle === 'tinted' && kind === 'selection') {
    return {
      background: colors.selectionTintBackground,
      foreground: colors.selectionTintForeground,
      border: colors.selectionTintBorder,
      selectionPrefix: colors.selectionTintForeground,
      visualPrefix: colors.visualTintForeground,
      shadow: colors.shadow,
    };
  }
  if (appearance.statusStyle === 'tinted' && kind === 'visual') {
    return {
      background: colors.visualTintBackground,
      foreground: colors.visualTintForeground,
      border: colors.visualTintBorder,
      selectionPrefix: colors.selectionTintForeground,
      visualPrefix: colors.visualTintForeground,
      shadow: colors.shadow,
    };
  }
  return {
    background: colors.neutralStatusBackground,
    foreground: colors.neutralStatusForeground,
    border: colors.neutralStatusBorder,
    selectionPrefix: colors.selectionMarker,
    visualPrefix: colors.visualMarker,
    shadow: colors.shadow,
  };
}
function sameAppearance(left: InteractionAppearance, right: InteractionAppearance): boolean {
  const a = left.colors;
  const b = right.colors;
  const x = left.marker;
  const y = right.marker;
  return (
    left.theme === right.theme &&
    left.colorPreset === right.colorPreset &&
    left.markerWeight === right.markerWeight &&
    left.statusStyle === right.statusStyle &&
    a.selectionMarker === b.selectionMarker &&
    a.visualMarker === b.visualMarker &&
    a.neutralStatusBackground === b.neutralStatusBackground &&
    a.neutralStatusForeground === b.neutralStatusForeground &&
    a.neutralStatusBorder === b.neutralStatusBorder &&
    a.selectionTintBackground === b.selectionTintBackground &&
    a.selectionTintBorder === b.selectionTintBorder &&
    a.visualTintBorder === b.visualTintBorder &&
    a.selectionTintForeground === b.selectionTintForeground &&
    a.visualTintBackground === b.visualTintBackground &&
    a.visualTintForeground === b.visualTintForeground &&
    a.shadow === b.shadow &&
    x.width === y.width &&
    x.selectionLeft === y.selectionLeft &&
    x.visualLeft === y.visualLeft &&
    x.radius === y.radius
  );
}

/** Resolves and observes Main-only interaction appearance for one Zotero window. */
export class InteractionAppearanceManager {
  readonly #preferences: InteractionAppearancePreferenceSource;
  readonly #theme: InteractionAppearanceThemeSource;
  readonly #listeners = new Set<(appearance: InteractionAppearance) => void>();
  readonly #cleanups: Array<() => void> = [];
  #appearance: InteractionAppearance;
  #disposed = false;
  #draft: CustomInteractionTheme | null = null;

  constructor(
    preferences: InteractionAppearancePreferenceSource,
    theme: InteractionAppearanceThemeSource,
  ) {
    this.#preferences = preferences;
    this.#theme = theme;
    this.#appearance = resolveInteractionAppearance(preferences, theme.theme);
    for (const key of [
      INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
      INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY,
      INTERACTION_MARKER_WIDTH_PREFERENCE_KEY,
      INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
      INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
    ]) {
      try {
        const cleanup = preferences.observe?.(key, () => this.refresh());
        if (cleanup) this.#cleanups.push(cleanup);
      } catch {}
    }
    this.#cleanups.push(theme.observe(() => this.refresh()));
  }
  get appearance(): InteractionAppearance {
    return this.#appearance;
  }

  observe(listener: (appearance: InteractionAppearance) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Previews one validated theme in this Main session without writing preferences. */
  setDraft(draft: CustomInteractionTheme | null): void {
    if (this.#disposed) return;
    if (draft === null) {
      this.clearDraft();
      return;
    }
    const validated = validTheme(draft);
    if (!validated) throw new Error('Invalid interaction appearance draft');
    this.#draft = validated;
    this.refresh();
  }

  clearDraft(): void {
    if (this.#disposed || !this.#draft) return;
    this.#draft = null;
    this.refresh();
  }

  refresh(): void {
    if (this.#disposed) return;
    const next = resolveInteractionAppearance(this.#preferences, this.#theme.theme, this.#draft);
    if (sameAppearance(next, this.#appearance)) return;
    this.#appearance = next;
    for (const listener of this.#listeners) {
      try {
        listener(next);
      } catch {}
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#draft = null;
    for (const cleanup of this.#cleanups.splice(0)) {
      try {
        cleanup();
      } catch {}
    }
    this.#listeners.clear();
  }
}
