import type { PreferenceReader } from '../core/preferences';
import type { ResolvedTheme } from '../ui/theme';

export const INTERACTION_COLOR_PRESET_PREFERENCE_KEY =
  'appearance.interaction.colorPreset' as const;
export const INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY =
  'appearance.interaction.markerWeight' as const;
export const INTERACTION_STATUS_STYLE_PREFERENCE_KEY =
  'appearance.interaction.statusStyle' as const;

export type InteractionColorPreset = 'primer-neutral' | 'soft-academic' | 'yazi-like';
export type InteractionMarkerWeight = 'compact' | 'balanced' | 'strong';
export type InteractionStatusStyle = 'neutral' | 'tinted';

export const DEFAULT_INTERACTION_COLOR_PRESET: InteractionColorPreset = 'primer-neutral';
export const DEFAULT_INTERACTION_MARKER_WEIGHT: InteractionMarkerWeight = 'balanced';
export const DEFAULT_INTERACTION_STATUS_STYLE: InteractionStatusStyle = 'neutral';

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
  readonly colorPreset: InteractionColorPreset;
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

const MARKER_GEOMETRIES: Readonly<Record<InteractionMarkerWeight, InteractionMarkerGeometry>> = {
  compact: { width: 2, selectionLeft: 1, visualLeft: 13, radius: 1 },
  balanced: { width: 3, selectionLeft: 1, visualLeft: 13, radius: 2 },
  strong: { width: 4, selectionLeft: 0, visualLeft: 12, radius: 2 },
};

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
): InteractionAppearance {
  const colorPreset = interactionColorPresetFromPreferences(preferences);
  const markerWeight = interactionMarkerWeightFromPreferences(preferences);
  return {
    theme,
    colorPreset,
    markerWeight,
    statusStyle: interactionStatusStyleFromPreferences(preferences),
    colors: COLOR_PRESETS[colorPreset][theme],
    marker: MARKER_GEOMETRIES[markerWeight],
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
  return (
    left.theme === right.theme &&
    left.colorPreset === right.colorPreset &&
    left.markerWeight === right.markerWeight &&
    left.statusStyle === right.statusStyle
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

  refresh(): void {
    if (this.#disposed) return;
    const next = resolveInteractionAppearance(this.#preferences, this.#theme.theme);
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
    for (const cleanup of this.#cleanups.splice(0)) {
      try {
        cleanup();
      } catch {}
    }
    this.#listeners.clear();
  }
}
