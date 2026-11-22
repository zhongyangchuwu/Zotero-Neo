export const ZOTERO_BASES_PLUGIN_ID = 'zotero-bases@zhongyangchuwu.github.io';

interface ZoteroBasesApi {
  readonly version: 1;
  open(options?: { window?: Window; mode?: 'default' | 'tab' | 'window' }): Promise<void>;
}

/** Read only the optional companion plugin's versioned public API. */
export function zoteroBasesApi(): ZoteroBasesApi | null {
  try {
    const host = Zotero as typeof Zotero & {
      readonly ZoteroBases?: { readonly api?: ZoteroBasesApi };
    };
    const api = host.ZoteroBases?.api;
    return api?.version === 1 && typeof api.open === 'function' ? api : null;
  } catch {
    // The optional provider may be unloading while Zotero still exposes its global.
    return null;
  }
}
