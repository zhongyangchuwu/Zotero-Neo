import { single as fuzzysortSingle } from '../../vendor/fuzzysort/fuzzysort.js';

/** Shared fuzzy score for candidate surfaces. Higher is better. */
export function fuzzyMatchScore(value: string, query: string): number | null {
  const needle = query.trim();
  return needle ? (fuzzysortSingle(needle, value)?.score ?? null) : 0;
}
