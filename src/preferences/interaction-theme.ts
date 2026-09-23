import type { PreferenceReader } from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  findCustomInteractionTheme,
  parseCustomInteractionThemes,
} from '../main/interaction-appearance';

const XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const BUILT_INS = ['primer-neutral', 'soft-academic', 'yazi-like'] as const;

/** Reports the actual persisted choice rather than projecting every custom ID to Primer. */
export function legacyInteractionThemeSelection(preferences: PreferenceReader): {
  value: string;
  customLabel: string | null;
} {
  const id = preferences.get(
    INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    DEFAULT_INTERACTION_COLOR_PRESET,
  );
  if (BUILT_INS.some((builtIn) => builtIn === id)) return { value: id, customLabel: null };
  const custom = findCustomInteractionTheme(
    parseCustomInteractionThemes(preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '')),
    id,
  );
  return custom
    ? { value: id, customLabel: `Custom: ${custom.name}` }
    : { value: DEFAULT_INTERACTION_COLOR_PRESET, customLabel: null };
}

/** Keeps a temporary custom menu item current while retaining built-in commands. */
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
    if (!BUILT_INS.some((id) => id === select.value)) return;
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
