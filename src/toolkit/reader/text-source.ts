import { CleanupFailure } from '../../core/cleanup';
import { readerReadingMode } from './presentation';
import { isDeadObject } from '../../platform/cross-compartment';
import type { Pointer } from '../../reader/types';

export interface ReaderTextRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
export interface ReaderTextSpan {
  readonly textNode: Text;
  readonly text: string;
  readonly rect: ReaderTextRect;
  readonly paragraph?: object;
}

/** Reads displayed source text in DOM order, retaining exact source node identity for both presentations. */
export function readerTextSpans(window: Window): readonly ReaderTextSpan[] {
  const result: ReaderTextSpan[] = [];
  if (readerReadingMode(window)) {
    const root = window.document.getElementById('sdt-content')!;
    const walker = window.document.createTreeWalker(root, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      if (!textNode.length || !textNode.parentElement?.closest('[data-text-index]')) continue;
      const range = window.document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 && [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite))
        result.push({
          textNode,
          text: textNode.data,
          rect,
          paragraph:
            textNode.parentElement?.closest(
              'p,figcaption,li,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6',
            ) ?? root,
        });
    }
    return result;
  }
  for (const span of Array.from(
    window.document.querySelectorAll('.textLayer span'),
  ) as HTMLElement[]) {
    const textNode = span.firstChild;
    if (textNode?.nodeType !== 3 || !(textNode as Text).length || !textNode.isConnected) continue;
    const rect = span.getBoundingClientRect();
    if (
      ![rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(
        Number.isFinite,
      ) ||
      rect.height <= 0
    )
      continue;
    result.push({ textNode: textNode as Text, text: (textNode as Text).data, rect });
  }
  return result;
}

/** Return actual reflow paragraph groups; unstructured PDF text is not relabeled as paragraphs. */
export function readerTextParagraphs(
  window: Window,
): readonly (readonly ReaderTextSpan[])[] | null {
  if (!readerReadingMode(window)) return null;
  const paragraphs: ReaderTextSpan[][] = [];
  let previous: object | undefined;
  for (const span of readerTextSpans(window)) {
    if (span.paragraph === previous && paragraphs.length)
      paragraphs[paragraphs.length - 1]!.push(span);
    else paragraphs.push([span]);
    previous = span.paragraph;
  }
  return paragraphs;
}

export function firstReaderTextPosition(window: Window): Pointer | null {
  if (readerReadingMode(window)) {
    const first = readerTextSpans(window)[0];
    return first ? { textNode: first.textNode, offset: 0 } : null;
  }
  const text = window.document.querySelector('.textLayer span')?.firstChild;
  return text?.nodeType === 3 ? { textNode: text as Text, offset: 0 } : null;
}

/** Acquires one exact-view style lease; an old release cannot remove a replacement's marker. */
export function decorateReaderSelection(window: Window): () => void {
  const document = window.document;
  const selector = 'style[data-zv-select-selection]';
  const style = document.createElement('style');
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    if (isDeadObject(window) || isDeadObject(document) || isDeadObject(style)) return;
    const failure = new CleanupFailure();
    failure.run(() => {
      if (document.querySelector(selector) === style)
        document.documentElement.removeAttribute('data-zv-select-active');
    });
    failure.run(() => style.remove());
    failure.rethrow();
  };
  try {
    document.querySelector(selector)?.remove();
    style.dataset.zvSelectSelection = '1';
    style.textContent =
      ':root[data-zv-select-active] :is(.textLayer, #sdt-content) ::selection { background-color: rgb(66, 133, 244); }';
    document.documentElement.appendChild(style);
    document.documentElement.setAttribute('data-zv-select-active', '');
    return release;
  } catch (error) {
    const failure = new CleanupFailure();
    failure.run(() => {
      throw error;
    });
    failure.run(release);
    failure.rethrow();
    throw error;
  }
}
