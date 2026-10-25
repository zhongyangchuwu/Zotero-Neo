import { arxivMatches } from './arxiv';
import { doiMatches } from './doi';
import { httpMatches, urlSources } from './http';
import type { IdentifierMatch } from './types';

export type { IdentifierMatch } from './types';

/**
 * Recognize every source occurrence without Unicode/whitespace normalization.
 * Resolver URLs take precedence over HTTP and shield their inner bare IDs;
 * unsupported URL schemes shield inner IDs without becoming candidates.
 * No host APIs, I/O, or follow/copy policy.
 */
export function recognizeIdentifiers(text: string): readonly IdentifierMatch[] {
  const urls = urlSources(text);
  const candidates = [
    ...doiMatches(text, urls),
    ...arxivMatches(text, urls),
    ...httpMatches(urls),
  ].sort(
    (left, right) =>
      left.start - right.start || Number(left.kind === 'http') - Number(right.kind === 'http'),
  );
  const matches: IdentifierMatch[] = [];
  let urlIndex = 0;
  for (const candidate of candidates) {
    while (urlIndex < urls.length && urls[urlIndex].end <= candidate.start) urlIndex++;
    const url = urls[urlIndex];
    if (
      url &&
      url.start < candidate.end &&
      (candidate.start !== url.start || candidate.end !== url.end)
    ) {
      continue;
    }
    const previous = matches[matches.length - 1];
    if (previous?.start === candidate.start && previous.end === candidate.end) continue;
    matches.push(candidate);
  }
  return matches;
}
