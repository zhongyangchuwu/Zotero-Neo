import type { ParsedDocument } from './contracts';

export interface DocumentComparisonSummary {
  readonly nativeRegions: number;
  readonly cloudRegions: number;
  readonly nativeOnlyWords: readonly string[];
  readonly cloudOnlyWords: readonly string[];
}

function words(document: ParsedDocument): Set<string> {
  return new Set(
    document.regions
      .filter((region) => region.flow === 'body')
      .flatMap(
        (region) =>
          region.text
            .normalize('NFKC')
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) ?? [],
      ),
  );
}

/** Vocabulary differences are diagnostics, not an accuracy score or a proof of missing text. */
export function compareDocuments(
  native: ParsedDocument,
  cloud: ParsedDocument,
): DocumentComparisonSummary {
  if (native.sourceFingerprint !== cloud.sourceFingerprint)
    throw new Error('Cannot compare different PDF revisions');
  const left = words(native),
    right = words(cloud);
  return {
    nativeRegions: native.regions.length,
    cloudRegions: cloud.regions.length,
    nativeOnlyWords: [...left].filter((word) => !right.has(word)),
    cloudOnlyWords: [...right].filter((word) => !left.has(word)),
  };
}
