import { hasSourceStart, sourceEnd } from './source';
import type { IdentifierMatch } from './types';

export type UrlSource = {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  /** Null for unsupported schemes or missing HTTP authority. */
  readonly host: string | null;
  readonly path: string;
};

/** Unsupported schemes are retained only to shield their embedded identifiers. */
export function urlSources(text: string): readonly UrlSource[] {
  const sources: UrlSource[] = [];
  // Literal angle brackets occur inside legacy DOI suffixes (SICI syntax).
  const urls = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"]+/g;
  let match: RegExpExecArray | null;
  while ((match = urls.exec(text))) {
    const start = match.index;
    if (!hasSourceStart(text, start)) continue;
    const end = sourceEnd(text, start, start + match[0].length);
    const raw = text.slice(start, end);
    const http = /^https?:\/\/([^/?#]+)([^?#]*)(?:[?#].*)?$/i.exec(raw);
    sources.push({
      start,
      end,
      raw,
      host: http ? http[1].toLowerCase() : null,
      path: http?.[2] ?? '',
    });
  }
  return sources;
}

export function httpMatches(urls: readonly UrlSource[]): readonly IdentifierMatch[] {
  return urls
    .filter((url) => url.host !== null)
    .map(({ start, end, raw }) => ({
      kind: 'http',
      start,
      end,
      raw,
      value: raw,
    }));
}
