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

/** Native text selection is transparent; this reversible decoration only colors Neo's range. */
export function decoratePdfSelection(window: Window): void {
  const document = window.document;
  let style = document.querySelector<HTMLStyleElement>('style[data-zv-select-selection]');
  if (!style) {
    style = document.createElement('style');
    style.dataset.zvSelectSelection = '1';
    style.textContent =
      ':root[data-zv-select-active] .textLayer ::selection { background-color: rgb(66, 133, 244); }';
    document.documentElement.appendChild(style);
  }
  document.documentElement.setAttribute('data-zv-select-active', '');
}
