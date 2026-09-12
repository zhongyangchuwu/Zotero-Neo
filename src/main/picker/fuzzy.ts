/** Dependency-free fzf-style subsequence score used by every picker scope. */
export function fuzzyMatchScore(value: string, query: string): number | null {
  const needle = query.toLowerCase().trim();
  if (!needle) return 0;
  const haystack = value.toLowerCase();
  const exact = haystack.indexOf(needle);
  let score = exact >= 0 ? 200 - exact * 2 : 0;
  let cursor = 0;
  let previous = -2;
  let run = 0;
  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index < 0) return null;
    const contiguous = index === previous + 1;
    run = contiguous ? run + 1 : 0;
    const boundary = index === 0 || /[\s_./:()\[\]{}-]/.test(haystack[index - 1] ?? '');
    score += 12 + run * 8 + (boundary ? 24 : 0) - Math.max(0, index - previous - 1) * 2;
    previous = index;
    cursor = index + 1;
  }
  return score - haystack.length / 100;
}
