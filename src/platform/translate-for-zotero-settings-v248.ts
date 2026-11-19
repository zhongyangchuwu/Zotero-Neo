const PREFIX = 'extensions.zotero.ZoteroPDFTranslate';

/** Detect retained user settings, not the provider's registered default preferences. */
export function hasTranslateForZoteroConfiguration(): boolean {
  try {
    const prefs = Services.prefs;
    return prefs.getChildList(`${PREFIX}.`).some((key) => prefs.prefHasUserValue(key));
  } catch {
    return false;
  }
}
