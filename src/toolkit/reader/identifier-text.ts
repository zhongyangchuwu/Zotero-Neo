import type { PdfTextRect } from './pdf-text';
import { visibleWindow } from './visibility';

export interface PdfIdentifierTextChunk {
  readonly text: string;
  rects(start: number, end: number): readonly PdfTextRect[];
}

interface TextSpan {
  readonly element: HTMLElement;
  readonly textNode: Text;
  readonly text: string;
  readonly rect: PdfTextRect;
  readonly container: Element;
  readonly textLayer: Element;
  readonly page: Element | null;
}

interface TextInterval {
  readonly start: number;
  readonly end: number;
  readonly span: TextSpan;
}

function validRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > rect.left &&
    rect.bottom > rect.top
  );
}

function intersectsViewport(window: Window, rect: DOMRect): boolean {
  const width = window.innerWidth || window.document.documentElement.clientWidth;
  const height = window.innerHeight || window.document.documentElement.clientHeight;
  return rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
}

function visibleElement(window: Window, element: HTMLElement): boolean {
  try {
    const style = window.getComputedStyle(element);
    return (
      !!style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse'
    );
  } catch {
    return false;
  }
}

function visibleRect(window: Window, rect: DOMRect): boolean {
  return validRect(rect) && intersectsViewport(window, rect);
}

function readSpan(window: Window, element: HTMLElement): TextSpan | null {
  try {
    const textNode = element.firstChild;
    if (
      textNode?.nodeType !== 3 ||
      !(textNode as Text).data.length ||
      !element.isConnected ||
      !(textNode as Text).isConnected ||
      (textNode as Text).parentNode !== element
    )
      return null;

    const textLayer = element.closest('.textLayer');
    const container = element.parentElement;
    if (!textLayer || !container || !visibleElement(window, element)) return null;
    const rect = element.getBoundingClientRect();
    if (!visibleRect(window, rect)) return null;
    const text = (textNode as Text).data;
    return {
      element,
      textNode: textNode as Text,
      text,
      rect,
      container,
      textLayer,
      page: textLayer.closest('.page'),
    };
  } catch {
    return null;
  }
}

function verticalOverlap(left: PdfTextRect, right: PdfTextRect): number {
  return Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function sameLine(left: PdfTextRect, right: PdfTextRect): boolean {
  const minimumHeight = Math.min(left.height, right.height);
  const overlap = verticalOverlap(left, right);
  if (overlap >= minimumHeight * 0.3) return true;
  const leftCenter = (left.top + left.bottom) / 2;
  const rightCenter = (right.top + right.bottom) / 2;
  return Math.abs(leftCenter - rightCenter) <= Math.max(2, minimumHeight * 0.25);
}

function horizontalGap(left: PdfTextRect, right: PdfTextRect): number {
  if (right.left >= left.right) return right.left - left.right;
  if (left.left >= right.right) return left.left - right.right;
  return 0;
}

function joinsLine(left: TextSpan, right: TextSpan): boolean {
  if (
    left.container !== right.container ||
    left.textLayer !== right.textLayer ||
    left.page !== right.page ||
    !sameLine(left.rect, right.rect)
  )
    return false;
  const lineHeight = Math.min(left.rect.height, right.rect.height);
  // PDF overprint layers and reverse DOM order are not lexical continuations.
  if (right.rect.left < left.rect.right - Math.min(1, lineHeight * 0.1)) return false;
  return horizontalGap(left.rect, right.rect) <= Math.max(4, Math.min(18, lineHeight * 0.8));
}

function sameSource(span: TextSpan): boolean {
  try {
    return (
      span.element.isConnected &&
      span.textNode.isConnected &&
      span.element.firstChild === span.textNode &&
      span.textNode.parentNode === span.element &&
      span.textNode.data === span.text &&
      span.element.closest('.textLayer') === span.textLayer &&
      span.element.parentElement === span.container &&
      span.textLayer.closest('.page') === span.page
    );
  } catch {
    return false;
  }
}

function currentSpanVisible(window: Window, span: TextSpan): boolean {
  try {
    return (
      visibleElement(window, span.element) &&
      visibleRect(window, span.element.getBoundingClientRect())
    );
  } catch {
    return false;
  }
}

function createChunk(window: Window, spans: readonly TextSpan[]): PdfIdentifierTextChunk {
  let text = '';
  const intervals: TextInterval[] = [];
  for (const span of spans) {
    const previous = intervals.at(-1);
    if (previous) {
      const gap = horizontalGap(previous.span.rect, span.rect);
      const threshold = Math.max(1, Math.min(previous.span.rect.height, span.rect.height) * 0.2);
      if (gap > threshold && !/\s$/u.test(previous.span.text) && !/^\s/u.test(span.text))
        text += ' ';
    }
    const start = text.length;
    text += span.text;
    intervals.push({ start, end: text.length, span });
  }

  return {
    text,
    rects(start: number, end: number): readonly PdfTextRect[] {
      if (
        !visibleWindow(window) ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > text.length
      )
        return [];

      const selected: {
        readonly interval: TextInterval;
        readonly start: number;
        readonly end: number;
      }[] = [];
      for (const interval of intervals) {
        const rangeStart = Math.max(start, interval.start);
        const rangeEnd = Math.min(end, interval.end);
        if (rangeStart < rangeEnd) {
          if (!sameSource(interval.span) || !currentSpanVisible(window, interval.span)) return [];
          selected.push({
            interval,
            start: rangeStart - interval.start,
            end: rangeEnd - interval.start,
          });
        }
      }
      if (!selected.length) return [];

      const result: PdfTextRect[] = [];
      try {
        for (const part of selected) {
          const range = window.document.createRange();
          range.setStart(part.interval.span.textNode, part.start);
          range.setEnd(part.interval.span.textNode, part.end);
          const rects = range.getClientRects();
          if (!rects) return [];
          for (let index = 0; index < rects.length; index += 1) {
            const rect = rects[index]!;
            if (visibleRect(window, rect))
              result.push({
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              });
          }
        }
      } catch {
        return [];
      }
      return result;
    },
  };
}

/** Reads visible PDF.js text as independent same-line runs with source-preserving offsets. */
export function visiblePdfTextChunks(window: Window): readonly PdfIdentifierTextChunk[] {
  if (!visibleWindow(window)) return [];
  const chunks: PdfIdentifierTextChunk[] = [];
  let line: TextSpan[] = [];
  const flush = () => {
    if (line.length) chunks.push(createChunk(window, line));
    line = [];
  };

  let elements: NodeListOf<Element>;
  try {
    elements = window.document.querySelectorAll('.textLayer span');
  } catch {
    return [];
  }
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (!element) {
      flush();
      continue;
    }
    const span = readSpan(window, element as HTMLElement);
    if (!span) {
      flush();
      continue;
    }
    const previous = line.at(-1);
    if (previous && !joinsLine(previous, span)) flush();
    line.push(span);
  }
  flush();
  return chunks;
}
