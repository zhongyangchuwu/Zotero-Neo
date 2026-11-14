import { describe, expect, it } from 'vitest';
import { pdfFigureGraphics, pdfFigureText } from '../../src/toolkit/pdf-figure-geometry';

const ops = {
  save: 10,
  restore: 11,
  transform: 12,
  setLineWidth: 2,
  constructPath: 91,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintImageMaskXObject: 83,
  paintSolidColorImageMask: 90,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintInlineImageXObjectGroup: 87,
  paintImageMaskXObjectGroup: 84,
};

describe('PDF figure source coordinates', () => {
  it('uses the transformed image unit square, not raster pixel resolution, and restores graphics state', () => {
    const graphics = (pixels: number) =>
      pdfFigureGraphics(
        {
          fnArray: [
            ops.save,
            ops.transform,
            ops.paintImageXObject,
            ops.restore,
            ops.paintImageXObject,
          ],
          argsArray: [
            [],
            [0, 2, -3, 0, 40, 50],
            ['image', pixels, pixels],
            [],
            ['image', pixels, pixels],
          ],
        },
        ops,
      );
    const result = graphics(2048);
    expect(result).toEqual(graphics(128));
    expect(result[0]![0]).toBeCloseTo(37, 0);
    expect(result[0]![1]).toBeCloseTo(50, 0);
    expect(result[0]![2]).toBeCloseTo(40, 0);
    expect(result[0]![3]).toBeCloseTo(52, 0);
    expect(result[1]![2]).toBeCloseTo(1, 0);
    expect(result[1]![3]).toBeCloseTo(1, 0);
  });

  it('retains horizontal table rules in both installed path formats but never promotes clipping paths', () => {
    const bounds = [10, 20, 110, 20];
    const old = pdfFigureGraphics(
      {
        fnArray: [ops.constructPath, ops.stroke, ops.constructPath, ops.clip, ops.endPath],
        argsArray: [[[], [], bounds], [], [[], [], [0, 0, 600, 800]], [], []],
      },
      ops,
    );
    const current = pdfFigureGraphics(
      { fnArray: [ops.constructPath], argsArray: [[ops.stroke, [[]], bounds]] },
      ops,
    );
    expect(old).toEqual(current);
    expect(old[0]![0]).toBeLessThanOrEqual(10);
    expect(old[0]![2]).toBeGreaterThanOrEqual(110);
    expect(old[0]![3] - old[0]![1]).toBeGreaterThan(0);
    expect(old[0]![3] - old[0]![1]).toBeLessThan(2);
  });

  it('projects rotated font ascent and descent in PDF space without adding a display rotation', () => {
    const text = pdfFigureText({
      styles: { font: { ascent: 0.8, descent: -0.2 } },
      items: [
        {
          str: 'Figure I',
          fontName: 'font',
          transform: [0, 10, -10, 0, 100, 200],
          width: 40,
          hasEOL: true,
        },
      ],
    });
    expect(text).toEqual([
      { text: 'Figure I', fontSize: 10, rect: [92, 200, 102, 240], hasEOL: true },
    ]);
  });

  it('keeps skewed mask repetitions in page coordinates', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [ops.transform, ops.paintImageMaskXObjectRepeat],
        argsArray: [
          [2, 0, 0, 3, 10, 20],
          [{}, 2, 1, 0.5, 3, [5, 6, 15, 16]],
        ],
      },
      ops,
    );
    expect(graphics.map((rect) => rect.map(Math.round))).toEqual([
      [20, 38, 25, 50],
      [40, 68, 45, 80],
    ]);
  });

  it('restores the parent transform after a transparency group', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [
          ops.transform,
          ops.beginGroup,
          ops.transform,
          ops.paintImageXObject,
          ops.endGroup,
          ops.paintImageXObject,
        ],
        argsArray: [[2, 0, 0, 3, 10, 20], [{}], [1, 0, 0, 1, 30, 40], ['inside'], [], ['after']],
      },
      ops,
    );
    expect(graphics.map((rect) => rect.map(Math.round))).toEqual([
      [70, 140, 72, 143],
      [10, 20, 12, 23],
    ]);
  });

  it('uses each grouped inline image or mask transform rather than atlas pixel bounds', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [ops.transform, ops.paintInlineImageXObjectGroup, ops.paintImageMaskXObjectGroup],
        argsArray: [
          [2, 0, 0, 3, 10, 20],
          [{ width: 4096, height: 2048 }, [{ transform: [0, 2, -3, 0, 30, 40], w: 512, h: 256 }]],
          [[{ transform: [4, 0, 0, 5, 2, 3], width: 128, height: 64 }]],
        ],
      },
      ops,
    );
    expect(graphics.map((rect) => rect.map(Math.round))).toEqual([
      [64, 140, 70, 146],
      [14, 29, 22, 44],
    ]);
  });

  it.each([ops.clip, ops.eoClip])(
    'clips oversized painted paths after compact endPath (%s)',
    (clip) => {
      const graphics = pdfFigureGraphics(
        {
          fnArray: [clip, ops.constructPath, ops.constructPath],
          argsArray: [
            [],
            [ops.endPath, [[]], [10, 20, 50, 60]],
            [ops.stroke, [[]], [-200, -300, 600, 800]],
          ],
        },
        ops,
      );
      expect(graphics).toEqual([[10, 20, 50, 60]]);
    },
  );

  it('keeps nested clips in page coordinates and restores the parent clip', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [
          ops.clip,
          ops.constructPath,
          ops.save,
          ops.transform,
          ops.eoClip,
          ops.constructPath,
          ops.transform,
          ops.constructPath,
          ops.restore,
          ops.constructPath,
        ],
        argsArray: [
          [],
          [ops.endPath, [[]], [0, 0, 100, 100]],
          [],
          [2, 0, 0, 2, 10, 20],
          [],
          [ops.endPath, [[]], [0, 0, 20, 20]],
          [1, 0, 0, 1, 40, 0],
          [ops.fill, [[]], [-100, -100, 100, 100]],
          [],
          [ops.fill, [[]], [-100, -100, 200, 200]],
        ],
      },
      ops,
    );
    expect(graphics).toEqual([
      [10, 20, 50, 60],
      [0, 0, 100, 100],
    ]);
  });

  it('applies a legacy clipping path only after its current paint operation', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [ops.constructPath, ops.clip, ops.fill, ops.transform, ops.paintImageXObject],
        argsArray: [[[], [], [10, 20, 50, 60]], [], [], [100, 0, 0, 100, 0, 0], ['image']],
      },
      ops,
    );
    expect(graphics).toEqual([
      [9.95, 19.95, 50.05, 60.05],
      [10, 20, 50, 60],
    ]);
  });

  it('suppresses images inside an empty clip without changing the restored parent', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [
          ops.save,
          ops.clip,
          ops.constructPath,
          ops.paintImageXObject,
          ops.restore,
          ops.paintImageXObject,
        ],
        argsArray: [[], [], [ops.endPath, [null], null], ['hidden'], [], ['visible']],
      },
      ops,
    );
    expect(graphics).toEqual([[-0.05, -0.05, 1.05, 1.05]]);
  });

  it('clips Form contents to the transformed bounding box and restores its parent', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [
          ops.paintFormXObjectBegin,
          ops.transform,
          ops.paintImageXObject,
          ops.paintFormXObjectEnd,
          ops.paintImageXObject,
        ],
        argsArray: [
          [
            [2, 0, 0, 3, 10, 20],
            [0, 0, 10, 10],
          ],
          [30, 0, 0, 30, 0, 0],
          ['inside'],
          [],
          ['after'],
        ],
      },
      ops,
    );
    expect(graphics).toEqual([
      [10, 20, 30, 50],
      [-0.05, -0.05, 1.05, 1.05],
    ]);
  });

  it('transforms a transparency group clip without applying its matrix to the content twice', () => {
    const graphics = pdfFigureGraphics(
      {
        fnArray: [
          ops.beginGroup,
          ops.transform,
          ops.paintImageXObject,
          ops.endGroup,
          ops.paintImageXObject,
        ],
        argsArray: [
          [{ matrix: [2, 0, 0, 2, 10, 20], bbox: [0, 0, 10, 10] }],
          [40, 0, 0, 15, 0, 20],
          ['inside'],
          [],
          ['after'],
        ],
      },
      ops,
    );
    expect(graphics).toEqual([
      [10, 20, 30, 35.05],
      [-0.05, -0.05, 1.05, 1.05],
    ]);
  });
});
