import type { PdfWindow, Pointer } from './types';

interface RectLike {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface TextSpanGeometry {
  readonly pointer: Pointer;
  readonly rect: RectLike;
}

interface TextLineGeometry {
  readonly spans: TextSpanGeometry[];
}

export interface VerticalTextMotion {
  readonly pointer: Pointer;
  readonly preferredX: number;
}

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

function validRect(rect: RectLike): boolean {
  return (
    [rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(
      Number.isFinite,
    ) && rect.height > 0
  );
}

function verticalOverlap(left: RectLike, right: RectLike): number {
  return Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function sameVisualLine(left: RectLike, right: RectLike): boolean {
  const minimumHeight = Math.max(1, Math.min(left.height, right.height));
  const overlap = verticalOverlap(left, right);
  if (overlap >= minimumHeight * 0.3) return true;
  const leftCenter = (left.top + left.bottom) / 2;
  const rightCenter = (right.top + right.bottom) / 2;
  return Math.abs(leftCenter - rightCenter) <= Math.max(2, minimumHeight * 0.25);
}

function caretRect(pdfWindow: PdfWindow, pointer: Pointer): RectLike | null {
  try {
    const range = pdfWindow.document.createRange();
    range.setStart(pointer.textNode, Math.min(pointer.offset, pointer.textNode.length));
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return validRect(rect) ? rect : null;
  } catch {
    return null;
  }
}

function textLines(pdfWindow: PdfWindow): TextLineGeometry[] {
  const spans = Array.from(pdfWindow.document.querySelectorAll('.textLayer span')) as HTMLElement[];
  const lines: TextLineGeometry[] = [];
  for (const span of spans) {
    const textNode = span.firstChild;
    if (!isTextNode(textNode) || !textNode.length || !textNode.isConnected) continue;
    const rect = span.getBoundingClientRect();
    if (!validRect(rect)) continue;
    const geometry: TextSpanGeometry = {
      pointer: { textNode, offset: 0 },
      rect,
    };
    const current = lines.at(-1);
    if (current?.spans.some((entry) => sameVisualLine(entry.rect, rect)))
      current.spans.push(geometry);
    else lines.push({ spans: [geometry] });
  }
  return lines;
}

function lineBounds(line: TextLineGeometry): { readonly left: number; readonly right: number } {
  return {
    left: Math.min(...line.spans.map((span) => span.rect.left)),
    right: Math.max(...line.spans.map((span) => span.rect.right)),
  };
}

function targetPreferredX(
  currentLine: TextLineGeometry,
  targetLine: TextLineGeometry,
  currentX: number,
): number {
  const current = lineBounds(currentLine);
  const target = lineBounds(targetLine);
  const horizontallyDisjoint = target.left > current.right || current.left > target.right;
  if (!horizontallyDisjoint) return currentX;

  const currentWidth = Math.max(0, current.right - current.left);
  const targetWidth = Math.max(0, target.right - target.left);
  const offset = Math.min(currentWidth, Math.max(0, currentX - current.left));
  return target.left + Math.min(offset, targetWidth);
}

function nearestCaret(
  pdfWindow: PdfWindow,
  line: TextLineGeometry,
  preferredX: number,
): Pointer | null {
  let best: { readonly pointer: Pointer; readonly distance: number } | null = null;
  for (const span of line.spans) {
    for (let offset = 0; offset <= span.pointer.textNode.length; offset += 1) {
      const pointer = { textNode: span.pointer.textNode, offset };
      const rect = caretRect(pdfWindow, pointer);
      if (!rect) continue;
      const distance = Math.abs(rect.left - preferredX);
      if (!best || distance < best.distance) best = { pointer, distance };
    }
  }
  return best?.pointer ?? null;
}

/**
 * Resolves one vertical caret step from PDF.js text-layer geometry while preserving
 * the text layer's DOM reading order across columns and pages.
 */
export function verticalTextPosition(
  pdfWindow: PdfWindow,
  pointer: Pointer,
  direction: -1 | 1,
  preferredX: number | null,
): VerticalTextMotion | null {
  const lines = textLines(pdfWindow);
  const lineIndex = lines.findIndex((line) =>
    line.spans.some((entry) => entry.pointer.textNode === pointer.textNode),
  );
  if (lineIndex < 0) return null;
  const currentLine = lines[lineIndex]!;
  const targetLine = lines[lineIndex + direction];
  if (!targetLine) return null;

  const currentSpan = currentLine.spans.find(
    (entry) => entry.pointer.textNode === pointer.textNode,
  );
  const currentRect = caretRect(pdfWindow, pointer) ?? currentSpan?.rect ?? null;
  if (!currentRect) return null;
  const sourceX = preferredX ?? currentRect.left;
  const targetX = targetPreferredX(currentLine, targetLine, sourceX);
  const target = nearestCaret(pdfWindow, targetLine, targetX);
  return target ? { pointer: target, preferredX: targetX } : null;
}
