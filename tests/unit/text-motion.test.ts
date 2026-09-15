import { describe, expect, it } from 'vitest';

import { verticalTextPosition } from '../../src/reader/text-motion';
import type { PdfWindow, Pointer } from '../../src/reader/types';

interface TextSpec {
  readonly id: string;
  readonly value: string;
  readonly top: number;
  readonly bottom: number;
  readonly xs: readonly number[];
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createGeometryWindow(specs: readonly TextSpec[]) {
  const nodes = new Map<string, Text>();
  const geometry = new Map<Text, TextSpec>();
  const spans = specs.map((spec) => {
    if (spec.xs.length !== spec.value.length + 1)
      throw new Error(`Expected one caret x per offset for ${spec.id}`);
    const textNode = {
      nodeType: 3,
      data: spec.value,
      length: spec.value.length,
      isConnected: true,
    } as unknown as Text;
    nodes.set(spec.id, textNode);
    geometry.set(textNode, spec);
    return {
      firstChild: textNode,
      getBoundingClientRect: () =>
        rect(Math.min(...spec.xs), spec.top, Math.max(...spec.xs), spec.bottom),
    } as unknown as HTMLElement;
  });

  let rangeNode: Text | null = null;
  let rangeOffset = 0;
  const document = {
    querySelectorAll: (selector: string) => (selector === '.textLayer span' ? spans : []),
    createRange: () => ({
      setStart: (node: Text, offset: number) => {
        rangeNode = node;
        rangeOffset = offset;
      },
      collapse: () => {},
      getBoundingClientRect: () => {
        if (!rangeNode) return rect(0, 0, 0, 0);
        const spec = geometry.get(rangeNode);
        if (!spec) return rect(0, 0, 0, 0);
        const x = spec.xs[Math.min(rangeOffset, spec.xs.length - 1)] ?? spec.xs[0] ?? 0;
        return rect(x, spec.top, x + 1, spec.bottom);
      },
    }),
  };

  return {
    pdfWindow: { document } as unknown as PdfWindow,
    pointer(id: string, offset: number): Pointer {
      const textNode = nodes.get(id);
      if (!textNode) throw new Error(`Unknown text node ${id}`);
      return { textNode, offset };
    },
  };
}

describe('PDF text vertical motion', () => {
  it('moves by adjacent visual lines rather than browser line granularity', () => {
    const created = createGeometryWindow([
      { id: 'line-1', value: 'abc', top: 10, bottom: 20, xs: [10, 20, 30, 40] },
      { id: 'line-2', value: 'def', top: 30, bottom: 40, xs: [12, 22, 32, 42] },
      { id: 'far', value: 'ghi', top: 90, bottom: 100, xs: [11, 21, 31, 41] },
    ]);

    const result = verticalTextPosition(created.pdfWindow, created.pointer('line-1', 2), 1, null);

    expect(result?.pointer).toEqual(created.pointer('line-2', 2));
    expect(result?.preferredX).toBe(30);
  });

  it('keeps the original horizontal column across ragged lines', () => {
    const created = createGeometryWindow([
      { id: 'wide-1', value: 'ab', top: 10, bottom: 20, xs: [10, 70, 90] },
      { id: 'short', value: 'ab', top: 30, bottom: 40, xs: [10, 35, 50] },
      { id: 'wide-2', value: 'ab', top: 50, bottom: 60, xs: [20, 80, 100] },
    ]);

    const first = verticalTextPosition(created.pdfWindow, created.pointer('wide-1', 1), 1, null);
    expect(first?.pointer).toEqual(created.pointer('short', 2));
    expect(first?.preferredX).toBe(70);

    const second = first
      ? verticalTextPosition(created.pdfWindow, first.pointer, 1, first.preferredX)
      : null;
    expect(second?.pointer).toEqual(created.pointer('wide-2', 1));
    expect(second?.preferredX).toBe(70);
  });

  it('translates the preferred column when reading order wraps into a disjoint column', () => {
    const created = createGeometryWindow([
      { id: 'left-1', value: 'ab', top: 10, bottom: 20, xs: [10, 20, 30] },
      { id: 'left-2', value: 'ab', top: 30, bottom: 40, xs: [10, 20, 30] },
      { id: 'right-1', value: 'ab', top: 10, bottom: 20, xs: [300, 310, 320] },
      { id: 'right-2', value: 'ab', top: 30, bottom: 40, xs: [300, 310, 320] },
    ]);

    const down = verticalTextPosition(created.pdfWindow, created.pointer('left-2', 1), 1, null);
    expect(down?.pointer).toEqual(created.pointer('right-1', 1));
    expect(down?.preferredX).toBe(310);

    const up = down
      ? verticalTextPosition(created.pdfWindow, down.pointer, -1, down.preferredX)
      : null;
    expect(up?.pointer).toEqual(created.pointer('left-2', 1));
    expect(up?.preferredX).toBe(20);
  });

  it('groups same-row columns when PDF.js exposes row-major DOM order', () => {
    const created = createGeometryWindow([
      { id: 'left-1', value: 'ab', top: 10, bottom: 20, xs: [10, 20, 30] },
      { id: 'right-1', value: 'ab', top: 10, bottom: 20, xs: [300, 310, 320] },
      { id: 'left-2', value: 'ab', top: 30, bottom: 40, xs: [12, 22, 32] },
      { id: 'right-2', value: 'ab', top: 30, bottom: 40, xs: [302, 312, 322] },
    ]);

    const result = verticalTextPosition(created.pdfWindow, created.pointer('left-1', 1), 1, null);

    expect(result?.pointer).toEqual(created.pointer('left-2', 1));
  });
});
