import type { ItemAttributeDefinition, ItemAttributeState } from './types';

const CONTROL = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

/** Only case and explicit ASCII separators are interchangeable. */
export function normalizeAttributeKey(key: string): string {
  if (
    typeof key !== 'string' ||
    CONTROL.test(key) ||
    !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(key.trim())
  )
    throw new Error('Attribute key must be a nonempty one-line name');
  const normalized = key.trim().toLowerCase().replace(/[ _-]/g, '');
  if (normalized.startsWith('zvmarks')) throw new Error('Neo-managed Extra keys cannot be edited');
  return normalized;
}

type Match = {
  readonly start: number;
  readonly end: number;
  readonly contentEnd: number;
  readonly prefix: string;
  readonly suffix: string;
  readonly value: string;
};

function matchingLines(extra: string, key: string): Match[] {
  const normalized = normalizeAttributeKey(key);
  const matches: Match[] = [];
  const lines = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (const line of extra.matchAll(lines)) {
    if (!line[0]) continue;
    const content = line[1]!;
    const colon = content.indexOf(':');
    if (colon < 0) continue;
    let candidate: string;
    try {
      candidate = normalizeAttributeKey(content.slice(0, colon).trim());
    } catch {
      continue;
    }
    if (candidate !== normalized) continue;
    const rest = content.slice(colon + 1);
    const leading = rest.match(/^[ \t]*/u)![0];
    const value = CONTROL.test(rest.replace(/^[ \t]*|[ \t]*$/gu, '')) ? rest : rest.trim();
    const trailing = value ? rest.match(/[ \t]*$/u)![0] : '';
    const start = line.index!;
    matches.push({
      start,
      end: start + line[0].length,
      contentEnd: start + content.length,
      prefix: content.slice(0, colon + 1) + leading,
      suffix: trailing,
      value,
    });
  }
  return matches;
}

export function readAttributeValue(extra: string, key: string): ItemAttributeState {
  const matches = matchingLines(extra, key);
  if (matches.length > 1 || (matches[0] && CONTROL.test(matches[0].value)))
    return { value: null, ambiguous: true };
  return { value: matches[0]?.value || null, ambiguous: false };
}

function oneLineValue(input: string | null): string | null {
  if (input === null) return null;
  if (typeof input !== 'string' || CONTROL.test(input))
    throw new Error('Attribute value must be one line without control characters');
  return input.trim() || null;
}

export function normalizeAttributeValue(
  definition: ItemAttributeDefinition,
  input: string | null,
): string | null {
  normalizeAttributeKey(definition.key);
  const value = oneLineValue(input);
  if (definition.type !== 'text' && definition.type !== 'number')
    throw new Error('Unsupported attribute type');
  if (value === null || definition.type === 'text') return value;
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value) ||
    !Number.isFinite(Number(value))
  )
    throw new Error('Attribute number must be finite decimal notation');
  // Keep the entered decimal text, including precision beyond IEEE-754 integers.
  return value;
}

/**
 * Remove a middle/first line with its following separator. A final line without
 * a following separator owns its preceding separator, so append/clear roundtrips.
 */
export function replaceAttributeValue(extra: string, key: string, value: string | null): string {
  const normalized = oneLineValue(value);
  const matches = matchingLines(extra, key);
  if (matches.length > 1 || (matches[0] && CONTROL.test(matches[0].value)))
    throw new Error('Attribute has ambiguous Extra lines');
  const match = matches[0];
  if (!match) {
    if (normalized === null) return extra;
    const newline = extra.match(/\r\n|\r|\n/u)?.[0] ?? '\n';
    const separator = extra && !/[\r\n]$/u.test(extra) ? newline : '';
    return `${extra}${separator}${key.trim()}: ${normalized}`;
  }
  if (normalized !== null && normalized === match.value) return extra;
  if (normalized === null) {
    let start = match.start;
    if (match.end === match.contentEnd && start > 0)
      start -= extra.slice(0, start).endsWith('\r\n') ? 2 : 1;
    return extra.slice(0, start) + extra.slice(match.end);
  }
  return (
    extra.slice(0, match.start) +
    match.prefix +
    normalized +
    match.suffix +
    extra.slice(match.contentEnd)
  );
}
