import {
  checkParseCurrent,
  type DocumentCacheKey,
  type DocumentParser,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';
import { localDocumentRegions, type LocalFigurePage } from './local-figures';

const LOCAL_DOCUMENT_KEY: DocumentCacheKey = {
  backend: 'local-rules',
  adapterVersion: 2,
  configuration: 'pdfjs-native-text-graphics-v1',
};

export function localDocumentCacheKey(): DocumentCacheKey {
  return LOCAL_DOCUMENT_KEY;
}

/** Source geometry is authoritative; do not attach extracted regions to another PDF revision. */
export function localParsedDocument(
  source: DocumentSource,
  pages: readonly LocalFigurePage[],
): ParsedDocument {
  if (
    pages.length !== source.pages.length ||
    pages.some(
      (page, index) =>
        page.pageIndex !== index ||
        page.viewBox.some((value, at) => value !== source.pages[index]?.viewBox[at]),
    )
  )
    throw new Error('Local PDF geometry differs from source');
  return {
    schemaVersion: 1,
    sourceFingerprint: source.fingerprint,
    backend: LOCAL_DOCUMENT_KEY.backend,
    modelRevision: null,
    durationMs: 0,
    pages: source.pages,
    regions: localDocumentRegions(pages),
  };
}

/** A local parser consumes host PDF text and painted geometry, never an SDT or cloud prediction. */
export function localDocumentParser(
  extract: (signal: AbortSignal) => Promise<readonly LocalFigurePage[]>,
): DocumentParser {
  return {
    id: LOCAL_DOCUMENT_KEY.backend,
    cacheKey: LOCAL_DOCUMENT_KEY,
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      const pages = await extract(signal);
      checkParseCurrent(signal);
      return localParsedDocument(source, pages);
    },
  };
}
