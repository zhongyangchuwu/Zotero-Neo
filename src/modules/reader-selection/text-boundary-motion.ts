import type { Pointer } from '../../reader/types';
import {
  buildMappedTextIndex,
  mappedTextContains,
  type MappedTextIndex,
  type SourceTextSegment,
} from './token-boundaries';

/** Common paper abbreviations supplement Intl boundaries; this is deliberately not a full NLP tokenizer. */
function sentenceOffsets(text: string, direction: 'forward' | 'backward'): number[] {
  if (typeof Intl.Segmenter !== 'function') return [];
  const result: { start: number; end: number }[] = [];
  for (const sentence of new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)) {
    const length = sentence.segment.trimEnd().length;
    if (!length) continue;
    const previous = result.at(-1);
    const prefix = previous && text.slice(previous.start, previous.end);
    if (
      previous &&
      prefix &&
      /\b(?:(?:Fig|Figs|Eq|Eqs|Sec|Secs|Tab|Ref|Refs|Dr|Prof|Mr|Mrs|Ms)\.|e\.g\.|i\.e\.)$/iu.test(
        prefix,
      )
    )
      previous.end = sentence.index + length;
    else result.push({ start: sentence.index, end: sentence.index + length });
  }
  return result.map((s) => (direction === 'forward' ? s.end : s.start));
}

/** Resolve boundaries only to real source endpoints, including paragraphs matched across spans, columns or pages. */
export function indexedStructuralTextPosition(
  paragraphs: readonly MappedTextIndex[],
  focus: Pointer,
  direction: 'forward' | 'backward',
  granularity: 'sentence' | 'paragraph',
  currentParagraph?: number,
): Pointer | null {
  const current =
    currentParagraph ?? paragraphs.findIndex((index) => mappedTextContains(index, focus));
  if (current < 0) return null;
  const step = direction === 'forward' ? 1 : -1;
  for (let block = current; block >= 0 && block < paragraphs.length; block += step) {
    const index = paragraphs[block]!;
    if (!index.text.trim()) continue;
    const offsets =
      granularity === 'paragraph'
        ? [direction === 'forward' ? index.text.length : 0]
        : sentenceOffsets(index.text, direction);
    const candidates = offsets
      .map((at) => (direction === 'forward' ? index.ends[at - 1]! : index.pointers[at]!))
      .filter(Boolean);
    if (direction === 'backward') candidates.reverse();
    const nodes = [...new Set(index.pointers.map((p) => p.textNode))];
    for (const target of candidates) {
      if (block !== current) return target;
      const sourceOrder = nodes.indexOf(focus.textNode),
        targetOrder = nodes.indexOf(target.textNode);
      const comparison =
        targetOrder === sourceOrder ? target.offset - focus.offset : targetOrder - sourceOrder;
      if (comparison * step > 0) return target;
    }
  }
  return null;
}

/** Native HTML paragraph fallback keeps the same endpoint policy without guessing PDF paragraph layout. */
export function structuralTextPosition(
  paragraphs: readonly (readonly SourceTextSegment[])[],
  focus: Pointer,
  direction: 'forward' | 'backward',
  granularity: 'sentence' | 'paragraph',
): Pointer | null {
  return indexedStructuralTextPosition(
    paragraphs.map(buildMappedTextIndex),
    focus,
    direction,
    granularity,
    paragraphs.findIndex((parts) => parts.some((part) => part.textNode === focus.textNode)),
  );
}
