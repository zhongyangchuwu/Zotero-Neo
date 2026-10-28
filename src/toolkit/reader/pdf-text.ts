import { CleanupFailure } from '../../core/cleanup';
import { isDeadObject } from '../../platform/cross-compartment';
import type { Pointer } from '../../reader/types';

export interface PdfTextRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
export interface PdfTextSpan {
  readonly textNode: Text;
  readonly text: string;
  readonly rect: PdfTextRect;
}

/** Reads native text-layer spans in host DOM reading order, retaining source glyph identity. */
export function pdfTextSpans(window: Window): readonly PdfTextSpan[] {
  const result: PdfTextSpan[] = [];
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

export function firstPdfTextPosition(window: Window): Pointer | null {
  const text = window.document.querySelector('.textLayer span')?.firstChild;
  return text?.nodeType === 3 ? { textNode: text as Text, offset: 0 } : null;
}

/** Acquires one exact-view style lease; an old release cannot remove a replacement's marker. */
export function decoratePdfSelection(window: Window): () => void {
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
      ':root[data-zv-select-active] .textLayer ::selection { background-color: rgb(66, 133, 244); }';
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
