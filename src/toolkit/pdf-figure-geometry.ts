import type { DocumentRect } from '../document-analysis/contracts';
import type { LocalFigureText } from '../document-analysis/local-figures';
import { record } from '../document-analysis/contracts';

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const EMPTY_CLIP: DocumentRect = [0, 0, 0, 0];

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

function intersect(a: DocumentRect, b: DocumentRect): DocumentRect {
  const left = Math.max(a[0], b[0]);
  const bottom = Math.max(a[1], b[1]);
  const right = Math.min(a[2], b[2]);
  const top = Math.min(a[3], b[3]);
  return left === a[0] && bottom === a[1] && right === a[2] && top === a[3]
    ? a
    : [left, bottom, right, top];
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

/** Observe painted bounds within native clipping regions; clipping paths are not figure evidence. */
export function pdfFigureGraphics(
  value: unknown,
  ops: Readonly<Record<string, number>>,
): readonly DocumentRect[] {
  const list = record(value);
  if (!Array.isArray(list?.fnArray) || !Array.isArray(list.argsArray))
    throw new Error('PDF graphics unavailable');
  let matrix = IDENTITY;
  let lineWidth = 1;
  let clip: DocumentRect | null = null;
  let pending: readonly number[] | null = null;
  let pendingClip = false;
  const stack: { matrix: Matrix; lineWidth: number; clip: DocumentRect | null }[] = [];
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
  const clipTo = (bounds: readonly number[], transform = matrix): void => {
    if (bounds.length !== 4) return;
    const rect =
      bounds[0] === bounds[2] || bounds[1] === bounds[3]
        ? EMPTY_CLIP
        : transformed(bounds, transform);
    clip = clip ? intersect(clip, rect) : rect;
  };
  const consumePath = (bounds: readonly number[] | null, empty = false): void => {
    if (pendingClip) {
      if (bounds) clipTo(bounds);
      else if (empty) clip = EMPTY_CLIP;
    }
    pending = null;
    pendingClip = false;
  };
  const add = (bounds: readonly number[], stroke: boolean): void => {
    if (bounds.length !== 4 || !bounds.every(Number.isFinite)) return;
    if (clip && (clip[2] <= clip[0] || clip[3] <= clip[1])) return;
    const scale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    const rect = transformed(
      bounds,
      matrix,
      stroke ? Math.max(0.1, (lineWidth * scale) / 2) : 0.05,
    );
    const visible = clip ? intersect(rect, clip) : rect;
    if (visible.every(Number.isFinite) && visible[2] > visible[0] && visible[3] > visible[1])
      result.push(visible);
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
    if (op === ops.save || op === ops.beginGroup) {
      stack.push({ matrix, lineWidth, clip });
      if (op === ops.beginGroup) {
        const group = record(args[0]);
        const bounds = numbers(group?.bbox);
        const next = numbers(group?.matrix);
        // PDF.js transforms the group's clip, not its content CTM; Form operators own that.
        if (bounds) clipTo(bounds, next?.length === 6 ? multiply(matrix, next) : matrix);
      }
    } else if (op === ops.restore || op === ops.endGroup) {
      const state = stack.pop();
      if (state) ({ matrix, lineWidth, clip } = state);
    } else if (op === ops.transform) {
      const next = numbers(args);
      if (next?.length === 6) matrix = multiply(matrix, next);
    } else if (op === ops.setLineWidth && typeof args[0] === 'number')
      lineWidth = Math.abs(args[0]);
    else if (op === ops.paintFormXObjectBegin) {
      stack.push({ matrix, lineWidth, clip });
      const next = numbers(args[0]);
      if (next?.length === 6) matrix = multiply(matrix, next);
      const bounds = numbers(args[1]);
      if (bounds) clipTo(bounds);
    } else if (op === ops.paintFormXObjectEnd) {
      const state = stack.pop();
      if (state) ({ matrix, lineWidth, clip } = state);
    } else if (op === ops.constructPath) {
      // Zotero's installed PDF.js uses either a separate paint op (older builds),
      // or [paintOp, pathBuffers, bounds]. Both expose the untransformed path bounds.
      const bounds = numbers(args[2]);
      if (typeof args[0] === 'number') {
        if (bounds && painted.has(args[0]))
          add(bounds, args[0] !== ops.fill && args[0] !== ops.eoFill);
        consumePath(
          bounds,
          args[2] === null && Array.isArray(args[1]) && args[1].length === 1 && args[1][0] === null,
        );
      } else pending = bounds;
    } else if (op === ops.clip || op === ops.eoClip) pendingClip = true;
    else if (painted.has(op as number)) {
      if (pending) add(pending, op !== ops.fill && op !== ops.eoFill);
      consumePath(pending);
    } else if (op === ops.endPath) consumePath(pending);
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
