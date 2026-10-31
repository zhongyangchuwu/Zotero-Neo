import type { DocumentPage, DocumentRect } from './contracts';

/** Invert a backend's rotated raster coordinates into the original PDF CropBox coordinates. */
export function rasterPDFRect(
  rect: DocumentRect,
  width: number,
  height: number,
  page: DocumentPage,
): DocumentRect {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height))
    throw new Error('Invalid raster dimensions');
  if (rect[0] < 0 || rect[1] < 0 || rect[2] > width || rect[3] > height)
    throw new Error('Raster region lies outside its page');
  const [left, bottom, right, top] = page.viewBox;
  const points = [
    [rect[0], rect[1]],
    [rect[2], rect[3]],
  ].map(([x, y]) => {
    const u = x! / width,
      v = y! / height;
    const [a, b] =
      page.rotation === 90
        ? [v, u]
        : page.rotation === 180
          ? [1 - u, v]
          : page.rotation === 270
            ? [1 - v, 1 - u]
            : [u, 1 - v];
    return [left + a! * (right - left), bottom + b! * (top - bottom)];
  });
  return [
    Math.min(points[0]![0]!, points[1]![0]!),
    Math.min(points[0]![1]!, points[1]![1]!),
    Math.max(points[0]![0]!, points[1]![0]!),
    Math.max(points[0]![1]!, points[1]![1]!),
  ];
}
