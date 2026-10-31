import type { Pointer, PdfWindow } from '../../reader/types';
import { readerTextSpans, type ReaderTextSpan } from '../../toolkit/reader';
import {
  buildTokenTextIndex,
  indexedTokenBoundaries,
  mappedTextRange,
  type TokenTextSegment,
} from './token-boundaries';

export interface SourceToken {
  readonly start: Pointer;
  readonly end: Pointer;
}

export interface DirectedTokenSelection {
  readonly anchor: Pointer;
  readonly focus: Pointer;
}

export function sameTextPointer(left: Pointer, right: Pointer): boolean {
  return left.textNode === right.textNode && left.offset === right.offset;
}

/** Returns NaN for disconnected nodes; no order is invented across replaced documents. */
export function compareTextPointers(left: Pointer, right: Pointer): number {
  if (left.textNode === right.textNode) return left.offset - right.offset;
  const position = left.textNode.compareDocumentPosition(right.textNode);
  if (position & 1) return Number.NaN;
  if (position & 4) return -1;
  if (position & 2) return 1;
  return Number.NaN;
}

/** Maps complete tokens back to source glyphs, merging units sharing one NFKC source glyph. */
export function sourceTokens(segments: readonly TokenTextSegment[]): SourceToken[] {
  const index = buildTokenTextIndex(segments);
  const tokens: SourceToken[] = [];
  for (const token of indexedTokenBoundaries(index)) {
    const range = mappedTextRange(index, token.start, token.end);
    if (!range) continue;
    const previous = tokens.at(-1);
    if (
      previous &&
      sameTextPointer(previous.start, range.start) &&
      sameTextPointer(previous.end, range.end)
    )
      continue;
    tokens.push(range);
  }
  return tokens;
}

/** Keep both endpoints and their adjacent semantic paragraphs, retaining DOM order across a distant anchor. */
export function tokenTextNeighborhood(
  spans: readonly ReaderTextSpan[],
  relevant: readonly Pointer[],
  radius = 1,
): readonly ReaderTextSpan[] {
  if (!relevant.length || spans.some((span) => !span.paragraph)) return spans;
  const paragraphs = [
    ...new Set(spans.filter((span) => span.text.trim()).map((span) => span.paragraph)),
  ];
  const selected = new Set<object | undefined>();
  for (const pointer of relevant) {
    const paragraph = spans.find((span) => span.textNode === pointer.textNode)?.paragraph;
    const index = paragraphs.indexOf(paragraph);
    if (index < 0) return spans;
    for (
      let at = Math.max(0, index - radius);
      at <= Math.min(paragraphs.length - 1, index + radius);
      at++
    )
      selected.add(paragraphs[at]);
  }
  return spans.filter((span) => selected.has(span.paragraph));
}

/** Snapshot existing source nodes only; Reading Mode never tokenizes the whole document for a local motion. */
export function readerTokens(window: PdfWindow, relevant: readonly Pointer[] = []): SourceToken[] {
  const spans = tokenTextNeighborhood(readerTextSpans(window), relevant);
  if (!spans.length || spans.some((span) => !span.paragraph)) return sourceTokens(spans);
  const tokens: SourceToken[] = [];
  let paragraph: object | undefined;
  let parts: ReaderTextSpan[] = [];
  for (const span of spans) {
    if (parts.length && span.paragraph !== paragraph) {
      tokens.push(...sourceTokens(parts));
      parts = [];
    }
    parts.push(span);
    paragraph = span.paragraph;
  }
  tokens.push(...sourceTokens(parts));
  return tokens;
}

/** Half-open endpoints choose the selected token, and whitespace never becomes its own stop. */
export function tokenAtPointer(
  tokens: readonly SourceToken[],
  pointer: Pointer,
  edge: 'start' | 'end',
): number | null {
  let previous: number | null = null;
  for (const [index, token] of tokens.entries()) {
    const start = compareTextPointers(pointer, token.start);
    const end = compareTextPointers(pointer, token.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (edge === 'start' ? start >= 0 && end < 0 : start > 0 && end <= 0) return index;
    if (start < 0 || (start === 0 && edge === 'end'))
      return edge === 'start' ? index : (previous ?? index);
    previous = index;
  }
  return previous;
}

/**
 * Keeps an intact anchor token included when a motion crosses it, so a one-token selection
 * never collapses. An adopted partial native anchor stays exact for character-level editing.
 */
function tokenSelectionResolver(
  tokens: readonly SourceToken[],
  anchor: Pointer,
  focus: Pointer,
): ((targetIndex: number) => DirectedTokenSelection | null) | null {
  const comparison = compareTextPointers(anchor, focus);
  if (!Number.isFinite(comparison)) return null;
  const forward = comparison <= 0;
  const anchorIndex = tokenAtPointer(tokens, anchor, forward ? 'start' : 'end');
  const anchorToken = anchorIndex === null ? null : tokens[anchorIndex];
  return (targetIndex) => {
    const target = tokens[targetIndex];
    if (!target) return null;
    if (
      anchorIndex !== null &&
      anchorToken &&
      sameTextPointer(anchor, forward ? anchorToken.start : anchorToken.end)
    ) {
      const backward = targetIndex < anchorIndex || (targetIndex === anchorIndex && !forward);
      return {
        anchor: backward ? anchorToken.end : anchorToken.start,
        focus: backward ? target.start : target.end,
      };
    }
    const before = compareTextPointers(target.end, anchor) <= 0;
    const after = compareTextPointers(target.start, anchor) >= 0;
    return {
      anchor,
      focus: before || (!after && !forward) ? target.start : target.end,
    };
  };
}

export function selectionToToken(
  tokens: readonly SourceToken[],
  anchor: Pointer,
  focus: Pointer,
  targetIndex: number,
): DirectedTokenSelection | null {
  return tokenSelectionResolver(tokens, anchor, focus)?.(targetIndex) ?? null;
}

/** Projects visual-line stops in linear time, resolving the fixed anchor only once. */
export function tokenSelectionChoices(
  tokens: readonly SourceToken[],
  anchor: Pointer,
  focus: Pointer,
): DirectedTokenSelection[] {
  const resolve = tokenSelectionResolver(tokens, anchor, focus);
  if (!resolve) return [];
  return tokens.flatMap((_, index) => {
    const choice = resolve(index);
    return choice ? [choice] : [];
  });
}

/** Resolves one horizontal token step without stopping at inter-token whitespace. */
export function horizontalTokenSelection(
  tokens: readonly SourceToken[],
  anchor: Pointer,
  focus: Pointer,
  direction: -1 | 1,
): DirectedTokenSelection | null {
  const comparison = compareTextPointers(anchor, focus);
  if (comparison === 0) {
    const index = tokenAtPointer(tokens, focus, direction < 0 ? 'end' : 'start');
    const token = index === null ? null : tokens[index];
    return token
      ? {
          anchor: direction < 0 ? token.end : token.start,
          focus: direction < 0 ? token.start : token.end,
        }
      : null;
  }
  const forward = comparison <= 0;
  const active = tokenAtPointer(tokens, focus, forward ? 'end' : 'start');
  if (active === null) return null;
  return selectionToToken(tokens, anchor, focus, active + direction);
}
