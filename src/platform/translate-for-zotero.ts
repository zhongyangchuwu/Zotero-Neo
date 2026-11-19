interface TranslateForZoteroApi {
  translate(
    text: string,
    options: { readonly pluginID: string; readonly itemID?: number },
  ): Promise<{ readonly result?: string; readonly status?: string }>;
}

/** The manual action uses only the provider's public API, not its versioned private runtime. */
export function translateForZoteroApi(): TranslateForZoteroApi | null {
  try {
    const host = Zotero as typeof Zotero & {
      readonly PDFTranslate?: { readonly api?: TranslateForZoteroApi };
    };
    const api = host.PDFTranslate?.api;
    return typeof api?.translate === 'function' ? api : null;
  } catch {
    // The optional provider may be unloading while Zotero still exposes its global.
    return null;
  }
}
