import type { Pointer } from '../../reader/types';

export interface SourceTextSegment {
  readonly textNode: Text;
  readonly text: string;
}

export interface TokenTextRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}

export interface TokenTextSegment extends SourceTextSegment {
  readonly rect?: TokenTextRect;
}

/** Source endpoints are kept per normalized UTF-16 unit, not inferred from matched text length. */
export interface MappedTextIndex {
  readonly text: string;
  readonly pointers: readonly Pointer[];
  readonly ends: readonly Pointer[];
}

export function mappedTextContains(index: MappedTextIndex, pointer: Pointer): boolean {
  const first = index.pointers.find((p) => p.textNode === pointer.textNode);
  const last = index.ends.findLast((p) => p.textNode === pointer.textNode);
  return !!first && !!last && pointer.offset >= first.offset && pointer.offset <= last.offset;
}

export interface TokenTextIndex extends MappedTextIndex {
  readonly tokenBreaks?: readonly number[];
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
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
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
        boundaries.push({
          start: part.index,
          end: part.index + part.segment.length,
          kind: 'symbol',
        });
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

/** Visual gaps separate PDF words without inserting characters into the literal search index. */
function separatePdfSpans(previous: TokenTextRect, next: TokenTextRect): boolean {
  const overlap = Math.max(
    0,
    Math.min(previous.bottom, next.bottom) - Math.max(previous.top, next.top),
  );
  const height = Math.max(1, Math.min(previous.height, next.height));
  if (overlap < height * 0.35) return true;
  if (next.left - previous.right > Math.max(2, height * 0.25)) return true;
  return next.left < previous.left - Math.max(2, height * 0.3);
}

/** Builds an ephemeral source map shared by Flash and local token motions. */
export function buildTokenTextIndex(segments: readonly TokenTextSegment[]): TokenTextIndex {
  const index = buildMappedTextIndex(segments);
  const firstOffsets = new Map<Text, number>();
  index.pointers.forEach((pointer, offset) => {
    if (!firstOffsets.has(pointer.textNode)) firstOffsets.set(pointer.textNode, offset);
  });
  const tokenBreaks: number[] = [];
  for (let position = 1; position < segments.length; position += 1) {
    const previous = segments[position - 1]!;
    const current = segments[position]!;
    if (!previous.rect || !current.rect || !separatePdfSpans(previous.rect, current.rect)) continue;
    const boundary = firstOffsets.get(current.textNode);
    if (boundary !== undefined && boundary > 0 && boundary < index.text.length)
      tokenBreaks.push(boundary);
  }
  return tokenBreaks.length ? { ...index, tokenBreaks } : index;
}

/** Splits linguistic tokens at genuine visual PDF span boundaries. */
export function indexedTokenBoundaries(index: TokenTextIndex): TokenBoundary[] {
  return tokenBoundaries(index.text).flatMap((token) => {
    const parts: TokenBoundary[] = [];
    let start = token.start;
    for (const boundary of index.tokenBreaks ?? []) {
      if (boundary <= start || boundary >= token.end) continue;
      parts.push({ ...token, start, end: boundary });
      start = boundary;
    }
    parts.push({ ...token, start, end: token.end });
    return parts;
  });
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
