import type { PreferenceReader } from '../core/preferences';

export const APPEARANCE_PREFERENCE_KEY = 'appearance.theme' as const;

export type AppearanceMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = Exclude<AppearanceMode, 'auto'>;

export interface ThemePreferenceSource extends PreferenceReader {
  observe?(key: string, listener: () => void): () => void;
}

export type ThemeRoot = Element & { readonly style: CSSStyleDeclaration };

export const THEME_VARS = {
  backdrop: 'var(--zotero-neo-backdrop)',
  surface: 'var(--zotero-neo-surface)',
  elevated: 'var(--zotero-neo-elevated)',
  text: 'var(--zotero-neo-text)',
  muted: 'var(--zotero-neo-muted)',
  border: 'var(--zotero-neo-border)',
  input: 'var(--zotero-neo-input)',
  selected: 'var(--zotero-neo-selected)',
  selectedText: 'var(--zotero-neo-selected-text)',
  accent: 'var(--zotero-neo-accent)',
  onAccent: 'var(--zotero-neo-on-accent)',
  success: 'var(--zotero-neo-success)',
  warning: 'var(--zotero-neo-warning)',
  error: 'var(--zotero-neo-error)',
  focusRing: 'var(--zotero-neo-focus-ring)',
  shadow: 'var(--zotero-neo-shadow)',
  itemSelection: 'var(--zotero-neo-item-selection)',
  itemVisual: 'var(--zotero-neo-item-visual)',
  modeNormal: 'var(--zotero-neo-mode-normal)',
  modeNormalText: 'var(--zotero-neo-mode-normal-text)',
  modeVisual: 'var(--zotero-neo-mode-visual)',
  modeVisualText: 'var(--zotero-neo-mode-visual-text)',
  modeInsert: 'var(--zotero-neo-mode-insert)',
  modeInsertText: 'var(--zotero-neo-mode-insert-text)',
  modeMain: 'var(--zotero-neo-mode-main)',
  modeMainText: 'var(--zotero-neo-mode-main-text)',
  statusSuccess: 'var(--zotero-neo-status-success)',
  statusSuccessText: 'var(--zotero-neo-status-success-text)',
  statusInfo: 'var(--zotero-neo-status-info)',
  statusInfoText: 'var(--zotero-neo-status-info-text)',
  statusError: 'var(--zotero-neo-status-error)',
  statusErrorText: 'var(--zotero-neo-status-error-text)',
} as const;

const PALETTES: Readonly<Record<ResolvedTheme, Readonly<Record<string, string>>>> = {
  light: {
    '--zotero-neo-backdrop': 'rgba(0, 0, 0, 0.24)',
    '--zotero-neo-surface': '#ffffff',
    '--zotero-neo-elevated': '#f2f2f2',
    '--zotero-neo-text': '#222222',
    '--zotero-neo-muted': '#666666',
    '--zotero-neo-border': '#dadada',
    '--zotero-neo-input': '#ffffff',
    '--zotero-neo-selected': '#e5e5e5',
    '--zotero-neo-selected-text': '#222222',
    '--zotero-neo-accent': '#3568d4',
    '--zotero-neo-on-accent': '#ffffff',
    '--zotero-neo-success': '#287a43',
    '--zotero-neo-warning': '#9a6700',
    '--zotero-neo-error': '#b42318',
    '--zotero-neo-focus-ring': '#4072e5',
    '--zotero-neo-shadow': 'rgba(0, 0, 0, 0.2)',
    '--zotero-neo-item-selection': '#eab308',
    '--zotero-neo-item-visual': '#22c55e',
    '--zotero-neo-mode-normal': '#f2f2f2',
    '--zotero-neo-mode-normal-text': '#222222',
    '--zotero-neo-mode-visual': '#e8f5e9',
    '--zotero-neo-mode-visual-text': '#14532d',
    '--zotero-neo-mode-insert': '#fff8e1',
    '--zotero-neo-mode-insert-text': '#713f12',
    '--zotero-neo-mode-main': '#f2f2f2',
    '--zotero-neo-mode-main-text': '#222222',
    '--zotero-neo-status-success': '#dcfce7',
    '--zotero-neo-status-success-text': '#166534',
    '--zotero-neo-status-info': '#f2f2f2',
    '--zotero-neo-status-info-text': '#222222',
    '--zotero-neo-status-error': '#fee2e2',
    '--zotero-neo-status-error-text': '#991b1b',
  },
  dark: {
    '--zotero-neo-backdrop': 'rgba(0, 0, 0, 0.62)',
    '--zotero-neo-surface': '#1e1e1e',
    '--zotero-neo-elevated': '#303030',
    '--zotero-neo-text': '#eeeeee',
    '--zotero-neo-muted': '#aaaaaa',
    '--zotero-neo-border': '#484848',
    '--zotero-neo-input': '#282828',
    '--zotero-neo-selected': '#444444',
    '--zotero-neo-selected-text': '#eeeeee',
    '--zotero-neo-accent': '#8ab4f8',
    '--zotero-neo-on-accent': '#1e1e1e',
    '--zotero-neo-success': '#2f8f52',
    '--zotero-neo-warning': '#c58a16',
    '--zotero-neo-error': '#c94b4b',
    '--zotero-neo-focus-ring': '#8ab4f8',
    '--zotero-neo-shadow': 'rgba(0, 0, 0, 0.55)',
    '--zotero-neo-item-selection': '#facc15',
    '--zotero-neo-item-visual': '#4ade80',
    '--zotero-neo-mode-normal': '#303030',
    '--zotero-neo-mode-normal-text': '#eeeeee',
    '--zotero-neo-mode-visual': '#1a3020',
    '--zotero-neo-mode-visual-text': '#dcfce7',
    '--zotero-neo-mode-insert': '#332800',
    '--zotero-neo-mode-insert-text': '#fef3c7',
    '--zotero-neo-mode-main': '#303030',
    '--zotero-neo-mode-main-text': '#eeeeee',
    '--zotero-neo-status-success': '#16301f',
    '--zotero-neo-status-success-text': '#bbf7d0',
    '--zotero-neo-status-info': '#303030',
    '--zotero-neo-status-info-text': '#eeeeee',
    '--zotero-neo-status-error': '#3f1d1d',
    '--zotero-neo-status-error-text': '#fecaca',
  },
};

const HOST_COLORS = [
  ['--color-background', ['surface']],
  ['--color-sidepane', ['elevated', 'mode-normal', 'mode-main', 'status-info']],
  [
    '--fill-primary',
    ['text', 'selected-text', 'mode-normal-text', 'mode-main-text', 'status-info-text'],
  ],
  ['--fill-secondary', ['muted']],
  ['--color-border', ['border']],
  ['--color-form-element-base-background', ['input']],
  ['--color-quarternary-on-background', ['selected']],
  ['--color-accent', ['focus-ring']],
] as const;

/** Capture host colors as values so PDF frames and owned tool windows share the same chrome. */
function hostPalette(window: Window, theme: ResolvedTheme): Readonly<Record<string, string>> {
  const fallback = PALETTES[theme];
  try {
    const style = window.getComputedStyle(window.document.documentElement);
    if (!style) return fallback;
    const dark = cssColorIsDark(style.getPropertyValue('--color-background'));
    // An explicit opposite-mode preference must not combine light and dark surfaces.
    if (dark === null || dark !== (theme === 'dark')) return fallback;
    const palette = { ...fallback };
    for (const [source, targets] of HOST_COLORS) {
      const value = style.getPropertyValue(source).trim();
      if (value) for (const target of targets) palette[`--zotero-neo-${target}`] = value;
    }
    const accent = style.getPropertyValue('--color-accent').trim();
    const onAccent = style.getPropertyValue('--color-accent-text').trim();
    if (accent && onAccent) {
      palette['--zotero-neo-accent'] = accent;
      palette['--zotero-neo-on-accent'] = onAccent;
    }
    return palette;
  } catch {
    return fallback;
  }
}

export interface ItemStateColors {
  readonly selection: string;
  readonly visual: string;
}

export function itemStateColors(theme: ResolvedTheme): ItemStateColors {
  const palette = PALETTES[theme];
  return {
    selection: palette['--zotero-neo-item-selection']!,
    visual: palette['--zotero-neo-item-visual']!,
  };
}

export function appearanceModeFromPreferences(preferences: PreferenceReader): AppearanceMode {
  const configured = preferences.get(APPEARANCE_PREFERENCE_KEY, 'auto');
  return configured === 'light' || configured === 'dark' ? configured : 'auto';
}

function channelFromHex(value: string, offset: number): number {
  return Number.parseInt(value.slice(offset, offset + 2), 16);
}

export function cssColorIsDark(value: string): boolean | null {
  const color = value.trim().toLowerCase();
  let red: number;
  let green: number;
  let blue: number;

  const shortHex = /^#([0-9a-f]{3,4})$/.exec(color)?.[1];
  if (shortHex) {
    red = Number.parseInt(shortHex[0] + shortHex[0], 16);
    green = Number.parseInt(shortHex[1] + shortHex[1], 16);
    blue = Number.parseInt(shortHex[2] + shortHex[2], 16);
  } else {
    const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(color)?.[1];
    if (hex) {
      red = channelFromHex(hex, 0);
      green = channelFromHex(hex, 2);
      blue = channelFromHex(hex, 4);
    } else {
      const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
      if (!rgb) return null;
      red = Number(rgb[1]);
      green = Number(rgb[2]);
      blue = Number(rgb[3]);
    }
  }

  if (![red, green, blue].every((channel) => Number.isFinite(channel))) return null;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.5;
}

export function resolveThemeFromSignals(
  mode: AppearanceMode,
  zoteroBackground: string,
  prefersDark: boolean,
): ResolvedTheme {
  if (mode !== 'auto') return mode;
  const hostDark = cssColorIsDark(zoteroBackground);
  if (hostDark !== null) return hostDark ? 'dark' : 'light';
  return prefersDark ? 'dark' : 'light';
}

function zoteroBackground(window: Window): string {
  try {
    const root = window.document?.documentElement;
    const getComputedStyle = window.getComputedStyle;
    if (!root || typeof getComputedStyle !== 'function') return '';
    return getComputedStyle.call(window, root)?.getPropertyValue('--color-background') ?? '';
  } catch {
    return '';
  }
}

function prefersDark(window: Window): boolean {
  try {
    const matchMedia = window.matchMedia;
    if (typeof matchMedia !== 'function') return false;
    return matchMedia.call(window, '(prefers-color-scheme: dark)')?.matches ?? false;
  } catch {
    return false;
  }
}

export function resolveTheme(window: Window, preferences: PreferenceReader): ResolvedTheme {
  return resolveThemeFromSignals(
    appearanceModeFromPreferences(preferences),
    zoteroBackground(window),
    prefersDark(window),
  );
}

export function applyTheme(
  root: ThemeRoot,
  theme: ResolvedTheme,
  palette: Readonly<Record<string, string>> = PALETTES[theme],
): void {
  if (root.getAttribute('data-zotero-neo-theme') !== theme)
    root.setAttribute('data-zotero-neo-theme', theme);
  if (root.style.colorScheme !== theme) root.style.colorScheme = theme;
  for (const [name, value] of Object.entries(palette)) {
    if (root.style.getPropertyValue(name).trim() !== value) root.style.setProperty(name, value);
  }
}
/** Owns live host colors and light/dark updates, including roots in embedded documents. */
export class ThemeManager {
  readonly #window: Window;
  readonly #preferences: ThemePreferenceSource;
  readonly #roots = new Set<ThemeRoot>();
  readonly #listeners = new Set<(theme: ResolvedTheme) => void>();
  readonly #media: MediaQueryList | null;
  readonly #mediaListener = (): void => this.refresh();
  readonly #observer: MutationObserver | null;
  readonly #preferenceCleanup: (() => void) | null;
  #theme: ResolvedTheme;
  #palette: Readonly<Record<string, string>>;
  #disposed = false;

  constructor(window: Window, preferences: ThemePreferenceSource) {
    this.#window = window;
    this.#preferences = preferences;
    this.#theme = resolveTheme(window, preferences);
    this.#palette = hostPalette(window, this.#theme);
    this.#media = this.createMediaQuery();
    try {
      this.#media?.addEventListener('change', this.#mediaListener);
    } catch {
      // Media-query events are optional; explicit preference changes still refresh roots.
    }
    this.#observer = this.createRootObserver();
    this.#preferenceCleanup = this.createPreferenceObserver();
  }

  add(root: ThemeRoot): () => void {
    if (this.#disposed) return () => undefined;
    this.#roots.add(root);
    applyTheme(root, this.#theme, this.#palette);
    return () => this.#roots.delete(root);
  }

  observe(listener: (theme: ResolvedTheme) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  refresh(): void {
    if (this.#disposed) return;
    const nextTheme = resolveTheme(this.#window, this.#preferences);
    const changed = nextTheme !== this.#theme;
    this.#theme = nextTheme;
    this.#palette = hostPalette(this.#window, this.#theme);
    for (const root of this.#roots) applyTheme(root, this.#theme, this.#palette);
    if (changed) {
      for (const listener of this.#listeners) {
        try {
          listener(this.#theme);
        } catch {}
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#media?.removeEventListener('change', this.#mediaListener);
    } catch {}
    try {
      this.#observer?.disconnect();
    } catch {}
    try {
      this.#preferenceCleanup?.();
    } catch {}
    this.#roots.clear();
    this.#listeners.clear();
  }

  get theme(): ResolvedTheme {
    return this.#theme;
  }

  private createPreferenceObserver(): (() => void) | null {
    try {
      return this.#preferences.observe?.(APPEARANCE_PREFERENCE_KEY, this.#mediaListener) ?? null;
    } catch {
      return null;
    }
  }

  private createMediaQuery(): MediaQueryList | null {
    try {
      return this.#window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return null;
    }
  }

  private createRootObserver(): MutationObserver | null {
    try {
      const Observer = this.#window.MutationObserver;
      const observer = new Observer(this.#mediaListener);
      observer.observe(this.#window.document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'],
      });
      return observer;
    } catch {
      return null;
    }
  }
}
