export interface TranslateForZoteroTextTask {
  readonly id: string;
  readonly type: string;
  readonly raw: string;
  readonly itemId?: number;
  readonly status: string;
  readonly result: string;
}

interface TranslateRuntime {
  readonly api?: { readonly getVersion?: () => string };
  readonly data?: {
    readonly popup?: { readonly currentPopup?: Element };
    readonly translate?: { readonly queue?: readonly TranslateForZoteroTextTask[] };
  };
}

interface ZoteroTranslateRuntime {
  readonly PDFTranslate?: TranslateRuntime;
}
export function translateForZoteroPresent(): boolean {
  const zotero = Zotero as unknown as ZoteroTranslateRuntime;
  return !!zotero.PDFTranslate;
}

/** Read-only access to the explicitly supported private plugin runtime. */
export function translateForZotero248(): TranslateRuntime | null {
  // The optional plugin global is absent from Zotero's host declarations.
  const zotero = Zotero as unknown as ZoteroTranslateRuntime;
  const runtime = zotero.PDFTranslate;
  try {
    if (
      !runtime ||
      runtime.api?.getVersion?.() !== '2.4.8' ||
      !Array.isArray(runtime.data?.translate?.queue)
    )
      return null;
    return runtime;
  } catch {
    return null;
  }
}
