import type { PreferenceStore } from '../../core/preference-store';
import { modulePreferenceKey } from '../../core/module-runtime';
import { translateForZoteroPresent } from '../../platform/translate-for-zotero-v248';
import { hasTranslateForZoteroConfiguration } from '../../platform/translate-for-zotero-settings-v248';
import { mainPluginInstalled } from '../../toolkit';
import { TRANSLATE_PLUGIN_ID } from './dependency';

/** Preserve prior translation use without treating a new profile as installation consent. */
export async function migrateTranslationModulePreference(
  preferences: PreferenceStore,
): Promise<void> {
  const key = modulePreferenceKey('translation');
  if (preferences.has(key)) return;
  const enabled =
    translateForZoteroPresent() ||
    hasTranslateForZoteroConfiguration() ||
    (await mainPluginInstalled(TRANSLATE_PLUGIN_ID));
  if (!preferences.has(key)) preferences.set(key, enabled);
}
