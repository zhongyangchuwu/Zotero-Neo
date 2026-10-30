import type { Pointer } from '../../reader/types';

export interface SourceTextSegment {
  readonly textNode: Text;
  readonly text: string;
}

/** Source endpoints are kept per normalized UTF-16 unit, not inferred from matched text length. */
export interface MappedTextIndex {
  readonly text: string;
  readonly pointers: readonly Pointer[];
  readonly ends: readonly Pointer[];
}

export interface TokenBoundary {
  readonly start: number;
  readonly end: number;
  readonly kind: 'word' | 'symbol';
}

interface Grapheme {
  readonly segment: string;
  readonly index: number;
}

function* graphemes(value: string): Iterable<Grapheme> {
  if (typeof Intl.Segmenter === 'function') {
    for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value))
      yield { segment: part.segment, index: part.index };
    return;
  }
  // Only a conservative fallback. Zotero 10's Gecko should supply Intl.Segmenter.
  let index = 0;
  for (const segment of value) {
    yield { segment, index };
    index += segment.length;
  }
}

/**
 * The PDF text layer splits glyphs across Text nodes. Normalize complete grapheme clusters
 * across nodes before storing the exact source start/end for each resulting UTF-16 unit.
 */
export function buildMappedTextIndex(segments: readonly SourceTextSegment[]): MappedTextIndex {
  const sourcePositions: Pointer[] = [];
  const parts: string[] = [];
  for (const { textNode, text } of segments) {
    parts.push(text);
    for (let offset = 0; offset < text.length; offset += 1)
      sourcePositions.push({ textNode, offset });
  }

  const output: string[] = [];
  const pointers: Pointer[] = [];
  const ends: Pointer[] = [];
  const emit = (value: string, start: Pointer, end: Pointer): void => {
    for (let offset = 0; offset < value.length; offset += 1) {
      output.push(value[offset]!);
      pointers.push(start);
      ends.push(end);
    }
  };
  let pendingWhitespace: { start: Pointer; end: Pointer } | null = null;

  for (const grapheme of graphemes(parts.join(''))) {
    const start = sourcePositions[grapheme.index];
    const last = sourcePositions[grapheme.index + grapheme.segment.length - 1];
    if (!start || !last) continue;
    const end = { textNode: last.textNode, offset: last.offset + 1 };
    for (const character of grapheme.segment.normalize('NFKC')) {
      if (/^\s$/u.test(character)) {
        if (output.length) {
          if (!pendingWhitespace) pendingWhitespace = { start, end };
          else pendingWhitespace.end = end;
        }
        continue;
      }
      if (pendingWhitespace) {
        emit(' ', pendingWhitespace.start, pendingWhitespace.end);
        pendingWhitespace = null;
      }
      emit(character, start, end);
    }
  }
  return { text: output.join(''), pointers, ends };
}

/** Converts a normalized half-open range back to an exact DOM Selection range. */
export function mappedTextRange(
  index: MappedTextIndex,
  start: number,
  end: number,
): { readonly start: Pointer; readonly end: Pointer } | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
    return null;
  const first = index.pointers[start];
  const last = index.ends[end - 1];
  return first && last ? { start: first, end: last } : null;
}

/** Local word boundaries; punctuation and symbols remain independently selectable. */
export function tokenBoundaries(text: string): TokenBoundary[] {
  const boundaries: TokenBoundary[] = [];
  if (typeof Intl.Segmenter !== 'function') {
    // Without the host segmenter, preserve every grapheme without guessing word boundaries.
    for (const part of graphemes(text)) {
      if (!/^\s+$/u.test(part.segment))
        boundaries.push({ start: part.index, end: part.index + part.segment.length, kind: 'symbol' });
    }
    return boundaries;
  }

  const words = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text);
  for (const part of words) {
    if (part.isWordLike) {
      boundaries.push({ start: part.index, end: part.index + part.segment.length, kind: 'word' });
      continue;
    }
    for (const piece of graphemes(part.segment)) {
      if (/^\s+$/u.test(piece.segment)) continue;
      const start = part.index + piece.index;
      boundaries.push({ start, end: start + piece.segment.length, kind: 'symbol' });
    }
  }
  return boundaries;
}

/** Expands a partial literal match or phrase to every intersecting complete token. */
export function tokenRangeCovering(
  tokens: readonly TokenBoundary[],
  start: number,
  end: number,
): { readonly start: number; readonly end: number } | null {
  if (end <= start) return null;
  const first = tokens.find((token) => token.end > start && token.start < end);
  if (!first) return null;
  let last = first;
  for (const token of tokens) {
    if (token.start >= end) break;
    if (token.end > start && token.start < end) last = token;
  }
  return { start: first.start, end: last.end };
}
