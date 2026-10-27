import type { UrlSource } from './http';
import { hasSourceStart } from './source';
import type { IdentifierMatch } from './types';

const ARXIV = /^(?:\d{4}\.\d{4,5}|[A-Za-z][A-Za-z-]*(?:\.[A-Za-z]{2})?\/\d{7})(?:v\d+)?$/;

export function arxivMatches(text: string, urls: readonly UrlSource[]): readonly IdentifierMatch[] {
  const matches: IdentifierMatch[] = [];
  const ids = /[A-Za-z][A-Za-z-]*(?:\.[A-Za-z]{2})?\/\d{7}(?:v\d+)?|\d{4}\.\d{4,5}(?:v\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = ids.exec(text))) {
    const start = match.index;
    const raw = match[0];
    const end = start + raw.length;
    if (!hasSourceStart(text, start)) continue;
    // Reject a valid-looking prefix of a longer number or word.
    if (text[end] && /[\p{L}\p{N}_\/-]/u.test(text[end])) continue;
    matches.push({ kind: 'arxiv', start, end, raw, value: raw });
  }
  for (const url of urls) {
    if (
      url.host !== 'arxiv.org' &&
      url.host !== 'www.arxiv.org' &&
      url.host !== 'export.arxiv.org'
    ) {
      continue;
    }
    const path = /^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/.exec(url.path);
    if (path && ARXIV.test(path[1])) {
      matches.push({ kind: 'arxiv', start: url.start, end: url.end, raw: url.raw, value: path[1] });
    }
  }
  return matches;
}
