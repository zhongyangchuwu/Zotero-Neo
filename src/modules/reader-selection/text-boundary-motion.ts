import type { Pointer } from '../../reader/types';
import { buildMappedTextIndex, type SourceTextSegment } from './token-boundaries';

/** Resolve sentence/paragraph endpoints over source-mapped blocks, independent of their renderer. */
export function structuralTextPosition(
  paragraphs: readonly (readonly SourceTextSegment[])[],
  focus: Pointer,
  direction: 'forward' | 'backward',
  granularity: 'sentence' | 'paragraph',
): Pointer | null {
  const current = paragraphs.findIndex((parts) =>
    parts.some((part) => part.textNode === focus.textNode),
  );
  if (current < 0) return null;
  const step = direction === 'forward' ? 1 : -1;
  for (let block = current; block >= 0 && block < paragraphs.length; block += step) {
    const parts = paragraphs[block]!,
      index = buildMappedTextIndex(parts);
    if (!index.text.length) continue;
    const candidates =
      granularity === 'paragraph'
        ? [direction === 'forward' ? index.ends.at(-1)! : index.pointers[0]!]
        : Array.from(
            new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(index.text),
            (sentence) =>
              direction === 'forward'
                ? index.ends[sentence.index + sentence.segment.trimEnd().length - 1]!
                : index.pointers[sentence.index]!,
          );
    if (direction === 'backward') candidates.reverse();
    for (const target of candidates) {
      if (block !== current) return target;
      const sourceOrder = parts.findIndex((part) => part.textNode === focus.textNode);
      const targetOrder = parts.findIndex((part) => part.textNode === target.textNode);
      const comparison =
        targetOrder === sourceOrder ? target.offset - focus.offset : targetOrder - sourceOrder;
      if (comparison * step > 0) return target;
    }
  }
  return null;
}
