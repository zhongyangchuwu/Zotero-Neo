import { single as fuzzysortSingle } from '../../../vendor/fuzzysort/fuzzysort.js';

/** Shared fuzzy score used by Picker and tag-path completion. Higher is better. */
export function fuzzyMatchScore(value: string, query: string): number | null {
  const needle = query.trim();
  if (!needle) return 0;
  return fuzzysortSingle(needle, value)?.score ?? null;
}
