import type { UrlSource } from './http';
import { hasSourceStart, sourceEnd } from './source';
import type { IdentifierMatch } from './types';

/**
 * Native cleanDOI semantics without Zotero or its logging dependency.
 * Reference: zotero/utilities@1dd38e27edf81e9d9c4161c957b7efb7f5681ac3.
 * Decoding changes only values, never original source offsets.
 */
function doiValue(raw: string): string | null {
  let value = raw;
  if (/^https?:/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // Native cleanup also keeps malformed URI escapes unchanged.
    }
  }
  const opening = value.indexOf('%3C');
  if (opening !== -1 && opening < value.indexOf('%3E')) {
    value = value.replace(/%3C/g, '<').replace(/%3E/g, '>');
  }
  const match = /10(?:\.[0-9]{4,})?\/[^\s]*[^\s.,]/.exec(value);
  if (!match) return null;
  let doi = match[0];
  const closing = doi.slice(-1);
  const bracket = closing === ')' ? '(' : closing === ']' ? '[' : closing === '}' ? '{' : null;
  if (bracket) {
    const prefix = value.slice(0, match.index);
    if (prefix.lastIndexOf(bracket) > prefix.lastIndexOf(closing)) doi = doi.slice(0, -1);
  }
  return doi;
}

export function doiMatches(text: string, urls: readonly UrlSource[]): readonly IdentifierMatch[] {
  const matches: IdentifierMatch[] = [];
  const dois = /10(?:\.[0-9]{4,})?\/[^\s"]+/g;
  let match: RegExpExecArray | null;
  while ((match = dois.exec(text))) {
    const start = match.index;
    if (!hasSourceStart(text, start)) continue;
    const end = sourceEnd(text, start, start + match[0].length);
    const raw = text.slice(start, end);
    const value = doiValue(raw);
    if (value) matches.push({ kind: 'doi', start, end, raw, value });
  }
  for (const url of urls) {
    if (url.host !== 'doi.org' && url.host !== 'dx.doi.org') continue;
    const value = doiValue(url.raw);
    if (value) matches.push({ kind: 'doi', start: url.start, end: url.end, raw: url.raw, value });
  }
  return matches;
}
