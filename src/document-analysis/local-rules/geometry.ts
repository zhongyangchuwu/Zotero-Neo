import type { LocalRuleRect } from './types';

export const width = (r: LocalRuleRect): number => r[2] - r[0];
export const height = (r: LocalRuleRect): number => r[3] - r[1];
export const centerX = (r: LocalRuleRect): number => (r[0] + r[2]) / 2;
export const centerY = (r: LocalRuleRect): number => (r[1] + r[3]) / 2;
export const overlapX = (a: LocalRuleRect, b: LocalRuleRect): number =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
export const overlapY = (a: LocalRuleRect, b: LocalRuleRect): number =>
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
export const gapX = (a: LocalRuleRect, b: LocalRuleRect): number => Math.max(0, -overlapX(a, b));
export const gapY = (a: LocalRuleRect, b: LocalRuleRect): number => Math.max(0, -overlapY(a, b));
export const readingOrder = (a: LocalRuleRect, b: LocalRuleRect): number =>
  b[3] - a[3] || a[0] - b[0] || b[1] - a[1] || a[2] - b[2];
export const valid = (r: LocalRuleRect): boolean =>
  r.every(Number.isFinite) && width(r) > 0 && height(r) > 0;
export const intersects = (a: LocalRuleRect, b: LocalRuleRect): boolean =>
  overlapX(a, b) > 0 && overlapY(a, b) > 0;
export const contains = (outer: LocalRuleRect, inner: LocalRuleRect, pad = 0): boolean =>
  inner[0] >= outer[0] - pad &&
  inner[1] >= outer[1] - pad &&
  inner[2] <= outer[2] + pad &&
  inner[3] <= outer[3] + pad;

export function bounds(rects: readonly LocalRuleRect[]): LocalRuleRect {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  return [x0, y0, x1, y1];
}

export function median(values: readonly number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function corridor(a: LocalRuleRect, b: LocalRuleRect): LocalRuleRect {
  return [Math.max(a[0], b[0]), Math.min(a[3], b[3]), Math.min(a[2], b[2]), Math.max(a[1], b[1])];
}
