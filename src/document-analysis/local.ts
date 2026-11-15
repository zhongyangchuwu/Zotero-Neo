import {
  checkParseCurrent,
  type DocumentCacheKey,
  type DocumentParser,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';
import {
  DEFAULT_LOCAL_RULE_PROFILE,
  localDocumentRegions,
  type LocalFigurePage,
  type LocalRuleProfile,
} from './local-rules';

const localKeys = new WeakMap<LocalRuleProfile, DocumentCacheKey>();

export function localDocumentCacheKey(
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
): DocumentCacheKey {
  let key = localKeys.get(profile);
  if (!key) {
    key = {
      backend: 'local-rules',
      adapterVersion: 4,
      configuration: `pdfjs-native-text-graphics-v1:${profile.fingerprint}`,
    };
    localKeys.set(profile, key);
  }
  return key;
}

/** Source geometry is authoritative; do not attach extracted regions to another PDF revision. */
export function localParsedDocument(
  source: DocumentSource,
  pages: readonly LocalFigurePage[],
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
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
    backend: 'local-rules',
    modelRevision: null,
    durationMs: 0,
    pages: source.pages,
    regions: localDocumentRegions(pages, profile),
  };
}

/** A local parser consumes host PDF text and painted geometry, never an SDT or cloud prediction. */
export function localDocumentParser(
  extract: (signal: AbortSignal) => Promise<readonly LocalFigurePage[]>,
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
): DocumentParser {
  return {
    id: 'local-rules',
    cacheKey: localDocumentCacheKey(profile),
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      const pages = await extract(signal);
      checkParseCurrent(signal);
      return localParsedDocument(source, pages, profile);
    },
  };
}
