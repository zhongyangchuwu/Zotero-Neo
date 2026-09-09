import { resolveBindings, type BindingMap } from '../input/bindings';

export const PREFERENCE_PREFIX = 'extensions.zotero-neo' as const;

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

export interface PreferenceReader {
  has?(key: string): boolean;
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
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
