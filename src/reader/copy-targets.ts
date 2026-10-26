import { readerVisibleAnnotations } from '../toolkit/reader';
import type { ReaderRuntime, ReaderViewRuntime } from '../toolkit/reader';
import { identifierCopyData, identifierHintTargets } from './identifier-targets';
import type { ReaderHintTarget } from './target-hints';
import type { PdfWindow } from './types';

type IdentifierCopy = NonNullable<ReturnType<typeof identifierCopyData>>;
export type ReaderCopyTarget =
  | IdentifierCopy
  | {
      readonly kind: 'annotation-text' | 'annotation-comment';
      readonly text: string;
    };

/** Annotation roles are independent copy intents, never geometry-deduplicated against identifiers. */
export function readerCopyTargets(
  reader: ReaderRuntime,
  view: ReaderViewRuntime,
  window: PdfWindow,
  text: (key: string) => string,
): readonly ReaderHintTarget<ReaderCopyTarget>[] {
  const result: ReaderHintTarget<ReaderCopyTarget>[] = [];
  for (const target of identifierHintTargets(view, window, 'copy')) {
    const value = identifierCopyData(target.value);
    if (value) result.push({ ...target, value, caption: text(`reader.hints.${value.kind}`) });
  }
  for (const annotation of readerVisibleAnnotations(reader, view, window)) {
    const append = (kind: 'annotation-text' | 'annotation-comment', value: string): void => {
      if (!value.trim()) return;
      result.push({
        value: { kind, text: value },
        rect: annotation.rect,
        currentRect: annotation.currentRect,
        group: `annotation:${annotation.key}`,
        caption: text(`reader.hints.${kind}`),
      });
    };
    append('annotation-text', annotation.text);
    append('annotation-comment', annotation.comment);
  }
  return result.sort(
    (first, second) => first.rect[1]! - second.rect[1]! || first.rect[0]! - second.rect[0]!,
  );
}
