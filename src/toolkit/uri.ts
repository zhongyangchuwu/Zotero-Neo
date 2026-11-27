import type { MainWindow } from '../core/contracts';
import { parseAbsoluteURL } from '../platform/url';
import { mainItemOpening } from './main/host';
import { launchMainURL } from './main/plugins';

export interface SafeURI {
  readonly kind: 'external' | 'zotero';
  readonly href: string;
}

export interface TextLink {
  readonly start: number;
  readonly end: number;
  readonly uri: SafeURI;
}

// These native no-content endpoints are handled in-process by ZoteroPane.loadURI.
const ZOTERO_ACTION = /^zotero:\/\/(select|open|open-pdf)(?=\/[^/?#])/i;
const WEB_URI = /^https?:\/\/[^/\\?#]/i;

export function parseSafeURI(input: string): SafeURI | null {
  if (/[\s\\\u0000-\u001f\u007f]/u.test(input)) return null;
  const action = ZOTERO_ACTION.exec(input);
  if (!action && !WEB_URI.test(input)) return null;
  let url: URL;
  try {
    url = parseAbsoluteURL(input);
  } catch {
    return null;
  }
  if (url.username || url.password || !url.hostname) return null;
  if (action) {
    const host = action[1]!.toLowerCase();
    return { kind: 'zotero', href: `zotero://${host}${url.pathname}${url.search}${url.hash}` };
  }
  return { kind: 'external', href: url.href };
}

const LINK_START =
  /(?:\[(?<label>[^\[\]\r\n]+)\]\([ \t]*(?<angle><)?)?(?<scheme>(?:https?|zotero):\/\/)/giu;
const URL_BREAK = /[\s<>"`“”‘’。、「」『』；，！？]/u;
const TRAILING_PUNCTUATION = /[.,;:!?…'’]+$/u;

function linkEnd(text: string, start: number): number {
  const closers: string[] = [];
  let end = start;
  for (; end < text.length; end += 1) {
    const char = text[end]!;
    if (URL_BREAK.test(char)) break;
    if (char === '(') closers.push(')');
    else if (char === '[') closers.push(']');
    else if (char === '（') closers.push('）');
    else if (char === ')' || char === ']' || char === '）') {
      if (closers.at(-1) !== char) break;
      closers.pop();
    }
  }
  return end;
}

/** Returns exact UTF-16 hit ranges without rewriting the source text. */
export function extractLinks(text: string): readonly TextLink[] {
  const links: TextLink[] = [];
  const matcher = new RegExp(LINK_START);
  for (let match = matcher.exec(text); match; match = matcher.exec(text)) {
    const { label, angle, scheme } = match.groups!;
    const urlStart = matcher.lastIndex - scheme!.length;
    const tokenEnd = linkEnd(text, matcher.lastIndex);
    matcher.lastIndex = Math.max(matcher.lastIndex, tokenEnd);
    if (label === undefined && match.index && /[a-z0-9_+.\-:]/i.test(text[match.index - 1]!))
      continue;
    let cursor = tokenEnd;
    if (angle && text[cursor] === '>') cursor += 1;
    while (text[cursor] === ' ' || text[cursor] === '\t') cursor += 1;
    const markdown =
      label !== undefined && (!angle || text[tokenEnd] === '>') && text[cursor] === ')';
    const raw = text.slice(urlStart, tokenEnd);
    const value = markdown ? raw : raw.replace(TRAILING_PUNCTUATION, '');
    const uri = parseSafeURI(value);
    if (!uri) continue;
    if (markdown) {
      links.push({ start: match.index + 1, end: match.index + 1 + label.length, uri });
      matcher.lastIndex = cursor + 1;
    } else {
      links.push({ start: urlStart, end: urlStart + value.length, uri });
    }
  }
  return links;
}

/** Never sends an internal Zotero URI to the system protocol launcher. */
export function openSafeURI(uri: SafeURI, owner?: MainWindow): boolean {
  const safe = parseSafeURI(uri.href);
  if (!safe || safe.kind !== uri.kind) return false;
  if (safe.kind === 'external') return launchMainURL(safe.href);
  const window = owner ?? Zotero.getMainWindow();
  if (!window) return false;
  const { loadURI } = mainItemOpening(window);
  if (!loadURI) return false;
  loadURI(safe.href);
  return true;
}
