/** Convert a PDF selection's first fragment to a non-emphasis native note marker. */
export function translationMarkerPosition(value: unknown): string | null {
  let position: unknown = value;
  if (typeof value === 'string') {
    try {
      position = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (
    !position ||
    typeof position !== 'object' ||
    !('pageIndex' in position) ||
    !('rects' in position)
  )
    return null;
  const pageIndex = position.pageIndex;
  const rects = position.rects;
  if (
    !Number.isInteger(pageIndex) ||
    typeof pageIndex !== 'number' ||
    pageIndex < 0 ||
    !Array.isArray(rects)
  )
    return null;
  const rect: unknown = rects[0];
  if (
    !Array.isArray(rect) ||
    rect.length !== 4 ||
    !rect.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
  )
    return null;
  const [x1, y1, x2, y2] = rect as number[];
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    x2 <= x1 ||
    y2 <= y1
  )
    return null;
  const size = 22;
  const gap = 4;
  // Leave the selected text readable when its left margin has room for the native pin.
  const markerX = x1 >= size + gap ? x1 - size - gap : x1;
  return JSON.stringify({ pageIndex, rects: [[markerX, y1, markerX + size, y1 + size]] });
}
