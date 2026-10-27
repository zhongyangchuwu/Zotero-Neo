import { recognizeIdentifiers, type IdentifierMatch } from '../../identifiers';
import {
  readerLinkClientRect,
  readerVisibleLinks,
  visiblePdfTextChunks,
  type ReaderViewRuntime,
} from '../../toolkit/reader';
import type { ReaderHintTarget } from './target-hints';
import type { PdfWindow, ReaderLinkOverlay } from '../../reader/types';

export type IdentifierTarget =
  | { readonly kind: 'native'; readonly overlay: ReaderLinkOverlay }
  | { readonly kind: 'text'; readonly match: IdentifierMatch };

function overlaps(first: readonly number[], second: readonly number[]): boolean {
  const width = Math.max(0, Math.min(first[2]!, second[2]!) - Math.max(first[0]!, second[0]!));
  const height = Math.max(0, Math.min(first[3]!, second[3]!) - Math.max(first[1]!, second[1]!));
  const area = Math.min(
    (first[2]! - first[0]!) * (first[3]! - first[1]!),
    (second[2]! - second[0]!) * (second[3]! - second[1]!),
  );
  return area > 0 && width * height >= area / 2;
}

/** Preserves native destinations and each visible occurrence; never deduplicates by identifier value. */
export function identifierHintTargets(
  view: ReaderViewRuntime,
  window: PdfWindow,
  intent: 'copy' | 'follow',
): readonly ReaderHintTarget<IdentifierTarget>[] {
  const native: ReaderHintTarget<IdentifierTarget>[] = readerVisibleLinks(view, window)
    .filter(({ overlay }) => intent === 'follow' || overlay.type === 'external-link')
    .map(({ overlay, rect }) => ({
      value: { kind: 'native', overlay },
      rect,
      currentRect: () => readerLinkClientRect(view, overlay, window),
    }));
  const result = [...native];
  const textOccurrences: {
    readonly match: IdentifierMatch;
    readonly rects: readonly (readonly number[])[];
  }[] = [];
  for (const chunk of visiblePdfTextChunks(window)) {
    for (const match of recognizeIdentifiers(chunk.text)) {
      const rects = chunk
        .rects(match.start, match.end)
        .map((rect) => [rect.left, rect.top, rect.right, rect.bottom]);
      const rect = rects[0];
      if (
        !rect ||
        native.some((target) => rects.some((source) => overlaps(target.rect, source))) ||
        textOccurrences.some(
          (previous) =>
            previous.match.kind === match.kind &&
            previous.match.value === match.value &&
            previous.rects.some((prior) => rects.some((source) => overlaps(prior, source))),
        )
      )
        continue;
      textOccurrences.push({ match, rects });
      const currentRect = (): readonly number[] | null => {
        const first = chunk.rects(match.start, match.end)[0];
        return first ? [first.left, first.top, first.right, first.bottom] : null;
      };
      result.push({ value: { kind: 'text', match }, rect, currentRect });
    }
  }
  return result.sort(
    (first, second) => first.rect[1]! - second.rect[1]! || first.rect[0]! - second.rect[0]!,
  );
}

/** Copy policy is separate from recognition, including native links whose visible label is not a URL. */
export function identifierCopyData(target: IdentifierTarget): {
  readonly kind: IdentifierMatch['kind'] | 'link';
  readonly text: string;
} | null {
  if (target.kind === 'text') return { kind: target.match.kind, text: target.match.value };
  if (target.overlay.type !== 'external-link') return null;
  const url = target.overlay.url;
  const match = recognizeIdentifiers(url).find(
    (candidate) => candidate.start === 0 && candidate.end === url.length,
  );
  return match ? { kind: match.kind, text: match.value } : { kind: 'link', text: url };
}

/** Resolver URLs belong to the follow action, not to the recognizers or the copy representation. */
export function identifierOpenURL(match: IdentifierMatch): string {
  if (match.kind === 'http' || /^https?:\/\//i.test(match.raw)) return match.raw;
  const path = encodeURIComponent(match.value).replace(/%2F/gi, '/');
  return match.kind === 'doi' ? `https://doi.org/${path}` : `https://arxiv.org/abs/${path}`;
}
