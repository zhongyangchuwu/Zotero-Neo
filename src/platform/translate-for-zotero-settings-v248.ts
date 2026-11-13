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

/** Capture retained user keys before provider startup writes defaults; apply only after a new install. */
export function captureTranslateForZotero248Initialization(language: 'en' | 'zh-CN'): () => void {
  const auto = `${PREFIX}.enableAuto`;
  const target = `${PREFIX}.targetLanguage`;
  const initializeAuto = !Services.prefs.prefHasUserValue(auto);
  const initializeTarget = !Services.prefs.prefHasUserValue(target);
  return () => {
    if (initializeAuto) Zotero.Prefs.set(auto, true, true);
    if (initializeTarget) Zotero.Prefs.set(target, language === 'zh-CN' ? 'zh-CN' : 'en-US', true);
  };
}
