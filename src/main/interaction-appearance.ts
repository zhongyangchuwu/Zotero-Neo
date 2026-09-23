import type { PreferenceReader } from '../core/preferences';
import type { ResolvedTheme } from '../ui/theme';

export const INTERACTION_COLOR_PRESET_PREFERENCE_KEY =
  'appearance.interaction.colorPreset' as const;
export const INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY =
  'appearance.interaction.markerWeight' as const;
export const INTERACTION_STATUS_STYLE_PREFERENCE_KEY =
  'appearance.interaction.statusStyle' as const;
export const INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY =
  'appearance.interaction.customThemes' as const;

export type InteractionColorPreset = 'primer-neutral' | 'soft-academic' | 'yazi-like';
export type InteractionMarkerWeight = 'compact' | 'balanced' | 'strong';
export type InteractionStatusStyle = 'neutral' | 'tinted';

export const DEFAULT_INTERACTION_COLOR_PRESET: InteractionColorPreset = 'primer-neutral';
export const DEFAULT_INTERACTION_MARKER_WEIGHT: InteractionMarkerWeight = 'balanced';
export const DEFAULT_INTERACTION_STATUS_STYLE: InteractionStatusStyle = 'neutral';

export interface CustomInteractionPalette {
  readonly selection: string;
  readonly visual: string;
  readonly statusBackground: string;
  readonly statusForeground: string;
  readonly statusBorder: string;
}

export interface CustomInteractionTheme {
  readonly id: string;
  readonly name: string;
  readonly version: 1;
  readonly light: CustomInteractionPalette;
  readonly dark: CustomInteractionPalette;
  readonly markerWidth: number;
  readonly statusStyle: InteractionStatusStyle;
}

export interface CustomInteractionThemeStore {
  readonly version: 1;
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
  readonly visualTintBackground: string;
  readonly visualTintForeground: string;
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
const PRIMER_NEUTRAL: Readonly<Record<ResolvedTheme, InteractionAppearanceColors>> = {
  light: {
    selectionMarker: '#9A6700',
    visualMarker: '#1A7F37',
    neutralStatusBackground: '#F6F8FA',
    neutralStatusForeground: '#1F2328',
    neutralStatusBorder: '#D0D7DE',
    selectionTintBackground: '#FFF8C5',
    selectionTintForeground: '#633C01',
    visualTintBackground: '#DAFBE1',
    visualTintForeground: '#116329',
    shadow: 'rgba(31,35,40,0.12)',
  },
  dark: {
    selectionMarker: '#D29922',
    visualMarker: '#3FB950',
    neutralStatusBackground: '#161B22',
    neutralStatusForeground: '#F0F6FC',
    neutralStatusBorder: '#30363D',
    selectionTintBackground: '#3B2E00',
    selectionTintForeground: '#E3B341',
    visualTintBackground: '#12261E',
    visualTintForeground: '#56D364',
    shadow: 'rgba(0,0,0,0.35)',
  },
};
const SOFT_ACADEMIC: Readonly<Record<ResolvedTheme, InteractionAppearanceColors>> = {
  light: {
    selectionMarker: '#A8792A',
    visualMarker: '#4B8065',
    neutralStatusBackground: '#FAFAF9',
    neutralStatusForeground: '#292524',
    neutralStatusBorder: '#D6D3D1',
    selectionTintBackground: '#F8F0DE',
    selectionTintForeground: '#6C501B',
    visualTintBackground: '#E8F1EC',
    visualTintForeground: '#315C49',
    shadow: 'rgba(41,37,36,0.10)',
  },
  dark: {
    selectionMarker: '#D2A75C',
    visualMarker: '#7EAD96',
    neutralStatusBackground: '#242321',
    neutralStatusForeground: '#F5F5F4',
    neutralStatusBorder: '#514E49',
    selectionTintBackground: '#3A3020',
    selectionTintForeground: '#F0CF8A',
    visualTintBackground: '#22352D',
    visualTintForeground: '#B9D8C8',
    shadow: 'rgba(0,0,0,0.32)',
  },
};
const YAZI_LIKE: Readonly<Record<ResolvedTheme, InteractionAppearanceColors>> = {
  light: {
    selectionMarker: '#E0A000',
    visualMarker: '#26A269',
    neutralStatusBackground: '#F3F4F6',
    neutralStatusForeground: '#111827',
    neutralStatusBorder: '#CBD5E1',
    selectionTintBackground: '#FFF3C4',
    selectionTintForeground: '#654900',
    visualTintBackground: '#DCFCE7',
    visualTintForeground: '#14532D',
    shadow: 'rgba(17,24,39,0.12)',
  },
  dark: {
    selectionMarker: '#FACC15',
    visualMarker: '#4ADE80',
    neutralStatusBackground: '#1F2937',
    neutralStatusForeground: '#F8FAFC',
    neutralStatusBorder: '#475569',
    selectionTintBackground: '#42350B',
    selectionTintForeground: '#FDE68A',
    visualTintBackground: '#153A24',
    visualTintForeground: '#BBF7D0',
    shadow: 'rgba(0,0,0,0.35)',
  },
};
const COLOR_PRESETS: Readonly<
  Record<InteractionColorPreset, Readonly<Record<ResolvedTheme, InteractionAppearanceColors>>>
> = {
  'primer-neutral': PRIMER_NEUTRAL,
  'soft-academic': SOFT_ACADEMIC,
  'yazi-like': YAZI_LIKE,
};

const EMPTY_CUSTOM_THEMES: CustomInteractionThemeStore = { version: 1, themes: [] };
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const THEME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function palette(value: unknown): CustomInteractionPalette | null {
  const fields = record(value);
  if (!fields) return null;
  for (const key of [
    'selection',
    'visual',
    'statusBackground',
    'statusForeground',
    'statusBorder',
  ]) {
    if (typeof fields[key] !== 'string' || !HEX_COLOR.test(fields[key])) return null;
  }
  return {
    selection: (fields.selection as string).toUpperCase(),
    visual: (fields.visual as string).toUpperCase(),
    statusBackground: (fields.statusBackground as string).toUpperCase(),
    statusForeground: (fields.statusForeground as string).toUpperCase(),
    statusBorder: (fields.statusBorder as string).toUpperCase(),
  };
}

function validTheme(value: unknown): CustomInteractionTheme | null {
  const fields = record(value);
  if (
    !fields ||
    fields.version !== 1 ||
    typeof fields.id !== 'string' ||
    !THEME_ID.test(fields.id) ||
    Object.prototype.hasOwnProperty.call(COLOR_PRESETS, fields.id) ||
    typeof fields.name !== 'string' ||
    !fields.name.trim() ||
    fields.name.trim().length > 100 ||
    /[\x00-\x1f\x7f]/.test(fields.name) ||
    !Number.isInteger(fields.markerWidth) ||
    (fields.markerWidth as number) < 1 ||
    (fields.markerWidth as number) > 4 ||
    (fields.statusStyle !== 'neutral' && fields.statusStyle !== 'tinted')
  )
    return null;
  const light = palette(fields.light);
  const dark = palette(fields.dark);
  if (!light || !dark) return null;
  return {
    id: fields.id,
    name: fields.name.trim(),
    version: 1,
    light,
    dark,
    markerWidth: fields.markerWidth as number,
    statusStyle: fields.statusStyle,
  };
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
  if (data?.version !== 1 || !Array.isArray(data.themes)) return EMPTY_CUSTOM_THEMES;
  const themes: CustomInteractionTheme[] = [];
  const seen = new Set<string>();
  for (const value of data.themes) {
    const theme = validTheme(value);
    if (!theme || seen.has(theme.id)) continue;
    themes.push(theme);
    seen.add(theme.id);
  }
  return { version: 1, themes };
}

function checkedStore(store: CustomInteractionThemeStore): CustomInteractionThemeStore {
  if (store?.version !== 1 || !Array.isArray(store.themes)) throw new Error('Invalid theme store');
  const themes: CustomInteractionTheme[] = [];
  const seen = new Set<string>();
  for (const entry of store.themes) {
    const theme = validTheme(entry);
    if (!theme || seen.has(theme.id)) throw new Error('Invalid custom theme');
    themes.push(theme);
    seen.add(theme.id);
  }
  return { version: 1, themes };
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
  if (index < 0) return { version: 1, themes: [...current.themes, theme] };
  const themes = [...current.themes];
  themes[index] = theme;
  return { version: 1, themes };
}

export function deleteCustomInteractionTheme(
  store: CustomInteractionThemeStore,
  id: string,
): CustomInteractionThemeStore {
  const current = checkedStore(store);
  return { version: 1, themes: current.themes.filter((theme) => theme.id !== id) };
}

const MARKER_GEOMETRIES: Readonly<Record<InteractionMarkerWeight, InteractionMarkerGeometry>> = {
  compact: { width: 2, selectionLeft: 1, visualLeft: 13, radius: 1 },
  balanced: { width: 3, selectionLeft: 1, visualLeft: 13, radius: 2 },
  strong: { width: 4, selectionLeft: 0, visualLeft: 12, radius: 2 },
};

function markerGeometry(width: number): InteractionMarkerGeometry {
  const selectionLeft = Math.floor((4 - width) / 2);
  const visualLeft = 12 + Math.ceil((4 - width) / 2);
  return { width, selectionLeft, visualLeft, radius: Math.ceil(width / 2) };
}

function tintedBackground(semantic: string, background: string): string {
  let result = '#';
  for (const offset of [1, 3, 5]) {
    const mixed = Math.round(
      Number.parseInt(semantic.slice(offset, offset + 2), 16) * 0.16 +
        Number.parseInt(background.slice(offset, offset + 2), 16) * 0.84,
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

function readableForeground(background: string, preferred: string, semantic: string): string {
  const backgroundLuminance = relativeLuminance(background);
  let best = preferred;
  let bestRatio = 0;
  for (const candidate of [preferred, semantic, '#000000', '#FFFFFF']) {
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

function customColors(
  palette: CustomInteractionPalette,
  theme: ResolvedTheme,
): InteractionAppearanceColors {
  const selectionTintBackground = tintedBackground(palette.selection, palette.statusBackground);
  const visualTintBackground = tintedBackground(palette.visual, palette.statusBackground);
  return {
    selectionMarker: palette.selection,
    visualMarker: palette.visual,
    neutralStatusBackground: palette.statusBackground,
    neutralStatusForeground: palette.statusForeground,
    neutralStatusBorder: palette.statusBorder,
    selectionTintBackground,
    selectionTintForeground: readableForeground(
      selectionTintBackground,
      palette.statusForeground,
      palette.selection,
    ),
    visualTintBackground,
    visualTintForeground: readableForeground(
      visualTintBackground,
      palette.statusForeground,
      palette.visual,
    ),
    shadow: PRIMER_NEUTRAL[theme].shadow,
  };
}

export function interactionColorPresetFromPreferences(
  preferences: PreferenceReader,
): InteractionColorPreset {
  const value = preferences.get(
    INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    DEFAULT_INTERACTION_COLOR_PRESET,
  );
  return value === 'soft-academic' || value === 'yazi-like' ? value : 'primer-neutral';
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
  const builtIn = Object.prototype.hasOwnProperty.call(COLOR_PRESETS, activeId)
    ? (activeId as InteractionColorPreset)
    : null;
  const custom = draft
    ? validTheme(draft)
    : builtIn
      ? null
      : (parseCustomInteractionThemes(
          preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, ''),
        ).themes.find((entry) => entry.id === activeId) ?? null);
  const colorPreset = custom?.id ?? builtIn ?? DEFAULT_INTERACTION_COLOR_PRESET;
  const markerWeight = interactionMarkerWeightFromPreferences(preferences);
  return {
    theme,
    colorPreset,
    markerWeight,
    statusStyle: custom?.statusStyle ?? interactionStatusStyleFromPreferences(preferences),
    colors: custom
      ? customColors(custom[theme], theme)
      : COLOR_PRESETS[colorPreset as InteractionColorPreset][theme],
    marker: custom ? markerGeometry(custom.markerWidth) : MARKER_GEOMETRIES[markerWeight],
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
      border: colors.selectionMarker,
      selectionPrefix: colors.selectionTintForeground,
      visualPrefix: colors.visualTintForeground,
      shadow: colors.shadow,
    };
  }
  if (appearance.statusStyle === 'tinted' && kind === 'visual') {
    return {
      background: colors.visualTintBackground,
      foreground: colors.visualTintForeground,
      border: colors.visualMarker,
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
