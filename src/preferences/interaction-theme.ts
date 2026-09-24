import type { PreferenceReader } from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_THEME_CATALOG,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY,
  findCustomInteractionTheme,
  interactionMarkerWidthFromPreferences,
  parseCustomInteractionThemes,
  normalizeInteractionColorPreset,
} from '../main/interaction-appearance';

const XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

/** Projects persisted aliases and custom choices onto the current Preferences menu. */
export function legacyInteractionThemeSelection(preferences: PreferenceReader): {
  value: string;
  customLabel: string | null;
} {
  const id = preferences.get(
    INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    DEFAULT_INTERACTION_COLOR_PRESET,
  );
  if (INTERACTION_THEME_CATALOG.some((entry) => entry.id === id))
    return { value: id, customLabel: null };
  const custom = findCustomInteractionTheme(
    parseCustomInteractionThemes(preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '')),
    id,
  );
  return custom
    ? { value: id, customLabel: `Custom: ${custom.name}` }
    : { value: normalizeInteractionColorPreset(id), customLabel: null };
}

/** Keeps one temporary custom item current while built-ins remain static. */
export function bindLegacyInteractionThemeSelect(
  select: Element & { value: string },
  doc: Document,
  preferences: PreferenceStore,
  onBuiltIn: (id: string) => void,
): () => void {
  const popup = select.querySelector('menupopup');
  let customItem: Element | null = null;
  const refresh = (): void => {
    const selection = legacyInteractionThemeSelection(preferences);
    customItem?.remove();
    customItem = null;
    if (selection.customLabel && popup) {
      customItem = doc.createElementNS(XUL, 'menuitem');
      customItem.setAttribute('value', selection.value);
      customItem.setAttribute('label', selection.customLabel);
      popup.append(customItem);
    }
    select.value = selection.value;
  };
  const command = (): void => {
    if (!INTERACTION_THEME_CATALOG.some((entry) => entry.id === select.value)) return;
    onBuiltIn(select.value);
    refresh();
  };
  select.addEventListener('command', command);
  const cleanups = [
    preferences.observe?.(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, refresh),
    preferences.observe?.(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, refresh),
  ];
  refresh();
  return () => {
    select.removeEventListener('command', command);
    for (const cleanup of cleanups) cleanup?.();
    customItem?.remove();
  };
}

/** Reads the new width or legacy weight; writes only explicit numeric widths. */
export function bindLegacyInteractionMarkerWidthSelect(
  select: Element & { value: string },
  preferences: PreferenceStore,
  onWidth: (width: number) => void,
): () => void {
  const refresh = (): void => {
    select.value = String(interactionMarkerWidthFromPreferences(preferences));
  };
  const command = (): void => {
    if (!/^[1-4]$/.test(select.value)) return;
    onWidth(Number(select.value));
    refresh();
  };
  select.addEventListener('command', command);
  const cleanups = [
    preferences.observe?.(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, refresh),
    preferences.observe?.(INTERACTION_MARKER_WEIGHT_PREFERENCE_KEY, refresh),
  ];
  refresh();
  return () => {
    select.removeEventListener('command', command);
    for (const cleanup of cleanups) cleanup?.();
  };
}
