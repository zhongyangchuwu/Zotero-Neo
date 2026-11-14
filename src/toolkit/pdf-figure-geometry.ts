import type { DocumentRect } from '../document-analysis/contracts';
import type { LocalFigureText } from '../document-analysis/local-figures';
import { record } from '../document-analysis/contracts';

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function numbers(value: unknown): readonly number[] | null {
  if (!value || typeof value !== 'object' || !('length' in value)) return null;
  const result = Array.from(value as ArrayLike<unknown>);
  return result.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (result as number[])
    : null;
}
function multiply(a: Matrix, b: readonly number[]): Matrix {
  return [
    a[0] * b[0]! + a[2] * b[1]!,
    a[1] * b[0]! + a[3] * b[1]!,
    a[0] * b[2]! + a[2] * b[3]!,
    a[1] * b[2]! + a[3] * b[3]!,
    a[0] * b[4]! + a[2] * b[5]! + a[4],
    a[1] * b[4]! + a[3] * b[5]! + a[5],
  ];
}
function transformed(rect: readonly number[], matrix: Matrix, padding = 0): DocumentRect {
  const xs: number[] = [],
    ys: number[] = [];
  for (const x of [rect[0]!, rect[2]!])
    for (const y of [rect[1]!, rect[3]!]) {
      xs.push(matrix[0] * x + matrix[2] * y + matrix[4]);
      ys.push(matrix[1] * x + matrix[3] * y + matrix[5]);
    }
  return [
    Math.min(...xs) - padding,
    Math.min(...ys) - padding,
    Math.max(...xs) + padding,
    Math.max(...ys) + padding,
  ];
}

/** Project PDF.js font metrics and text transforms without applying the display viewport or rotation. */
export function pdfFigureText(value: unknown): readonly LocalFigureText[] {
  const content = record(value);
  const styles = record(content?.styles);
  if (!Array.isArray(content?.items)) throw new Error('PDF text content unavailable');
  const result: LocalFigureText[] = [];
  for (const value of content.items) {
    const item = record(value);
    if (typeof item?.str !== 'string' || !item.str.trim()) continue;
    const matrix = numbers(item.transform);
    const width = item.width;
    if (!matrix || matrix.length !== 6 || typeof width !== 'number' || !Number.isFinite(width))
      continue;
    const fontSize = Math.hypot(matrix[2]!, matrix[3]!);
    const horizontal = Math.hypot(matrix[0]!, matrix[1]!);
    if (fontSize <= 0 || horizontal <= 0 || width <= 0) continue;
    const style = record(styles?.[String(item.fontName)]);
    const ascent = typeof style?.ascent === 'number' ? style.ascent : 0.8;
    const descent = typeof style?.descent === 'number' ? style.descent : -0.2;
    const basis: Matrix = [
      matrix[0]! / horizontal,
      matrix[1]! / horizontal,
      matrix[2]! / fontSize,
      matrix[3]! / fontSize,
      matrix[4]!,
      matrix[5]!,
    ];
    const rect = transformed([0, fontSize * descent, width, fontSize * ascent], basis);
    if (rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1])
      result.push({ text: item.str, rect, fontSize, hasEOL: item.hasEOL === true });
  }
  return result;
}

/** Observe painted graphics only. A clipping path is not visual evidence for a figure body. */
export function pdfFigureGraphics(
  value: unknown,
  ops: Readonly<Record<string, number>>,
): readonly DocumentRect[] {
  const list = record(value);
  if (!Array.isArray(list?.fnArray) || !Array.isArray(list.argsArray))
    throw new Error('PDF graphics unavailable');
  let matrix = IDENTITY;
  let lineWidth = 1;
  let pending: readonly number[] | null = null;
  const stack: { matrix: Matrix; lineWidth: number }[] = [];
  const result: DocumentRect[] = [];
  const painted = new Set(
    [
      'stroke',
      'closeStroke',
      'fill',
      'eoFill',
      'fillStroke',
      'eoFillStroke',
      'closeFillStroke',
      'closeEOFillStroke',
    ].map((name) => ops[name]),
  );
  const add = (bounds: readonly number[], stroke: boolean): void => {
    if (bounds.length !== 4 || !bounds.every(Number.isFinite)) return;
    const scale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    const rect = transformed(
      bounds,
      matrix,
      stroke ? Math.max(0.1, (lineWidth * scale) / 2) : 0.05,
    );
    if (rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1]) result.push(rect);
  };
  const addImage = (next: readonly number[]): void => {
    if (next.length !== 6) return;
    const original = matrix;
    matrix = multiply(matrix, next);
    add([0, 0, 1, 1], false);
    matrix = original;
  };
  for (let index = 0; index < list.fnArray.length; index++) {
    const op = list.fnArray[index];
    const args: readonly unknown[] = Array.isArray(list.argsArray[index])
      ? list.argsArray[index]
      : [];
    if (op === ops.save || op === ops.beginGroup) stack.push({ matrix, lineWidth });
    else if (op === ops.restore || op === ops.endGroup) {
      const state = stack.pop();
      if (state) ({ matrix, lineWidth } = state);
    } else if (op === ops.transform) {
      const next = numbers(args);
      if (next?.length === 6) matrix = multiply(matrix, next);
    } else if (op === ops.setLineWidth && typeof args[0] === 'number')
      lineWidth = Math.abs(args[0]);
    else if (op === ops.paintFormXObjectBegin) {
      stack.push({ matrix, lineWidth });
      const next = numbers(args[0]);
      if (next?.length === 6) matrix = multiply(matrix, next);
    } else if (op === ops.paintFormXObjectEnd) {
      const state = stack.pop();
      if (state) ({ matrix, lineWidth } = state);
    } else if (op === ops.constructPath) {
      // Zotero's installed PDF.js uses either a separate paint op (older builds),
      // or [paintOp, pathBuffers, bounds]. Both expose the untransformed path bounds.
      const bounds = numbers(args[2]);
      if (typeof args[0] === 'number') {
        if (bounds && painted.has(args[0]))
          add(bounds, args[0] !== ops.fill && args[0] !== ops.eoFill);
        pending = null;
      } else pending = bounds;
    } else if (painted.has(op as number)) {
      if (pending) add(pending, op !== ops.fill && op !== ops.eoFill);
      pending = null;
    } else if (op === ops.endPath) pending = null;
    else if (
      op === ops.paintImageXObject ||
      op === ops.paintInlineImageXObject ||
      op === ops.paintImageMaskXObject ||
      op === ops.paintSolidColorImageMask
    ) {
      // PDF images occupy the unit square under the current transform, not their pixel dimensions.
      add([0, 0, 1, 1], false);
    } else if (op === ops.paintImageXObjectRepeat || op === ops.paintImageMaskXObjectRepeat) {
      const mask = op === ops.paintImageMaskXObjectRepeat;
      const positions = numbers(args[mask ? 5 : 3]);
      const scaleX = args[1];
      const scaleY = args[mask ? 4 : 2];
      const skewX = mask ? (args[2] ?? 0) : 0;
      const skewY = mask ? (args[3] ?? 0) : 0;
      if (
        positions &&
        typeof scaleX === 'number' &&
        typeof scaleY === 'number' &&
        typeof skewX === 'number' &&
        typeof skewY === 'number'
      )
        for (let at = 0; at + 1 < positions.length; at += 2)
          addImage([scaleX, skewX, skewY, scaleY, positions[at]!, positions[at + 1]!]);
    } else if (op === ops.paintInlineImageXObjectGroup || op === ops.paintImageMaskXObjectGroup) {
      const images = args[op === ops.paintImageMaskXObjectGroup ? 0 : 1];
      if (!Array.isArray(images)) continue;
      for (const image of images) {
        const next = numbers(record(image)?.transform);
        if (next) addImage(next);
      }
    }
  }
  return result;
}
