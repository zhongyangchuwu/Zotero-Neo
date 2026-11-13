import type { PreferenceStore } from '../../core/preference-store';
import { modulePreferenceKey } from '../../core/module-runtime';
import { translateForZoteroPresent } from '../../platform/translate-for-zotero-v248';
import { hasTranslateForZoteroConfiguration } from '../../platform/translate-for-zotero-settings-v248';

/** Preserve prior translation use without treating a new profile as installation consent. */
export function migrateTranslationModulePreference(preferences: PreferenceStore): void {
  const key = modulePreferenceKey('translation');
  if (preferences.has(key)) return;
  preferences.set(key, translateForZoteroPresent() || hasTranslateForZoteroConfiguration());
}
