import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  type LocalFigurePage,
  type LocalFigureText,
  type LocalRuleRect,
} from '../../src/document-analysis/local-rules';

function text(value: string, rect: LocalRuleRect, fontSize = 10): LocalFigureText {
  return { text: value, rect, fontSize };
}

function page(
  chunks: readonly LocalFigureText[],
  graphics: readonly LocalRuleRect[] = [],
): LocalFigurePage {
  return { pageIndex: 0, viewBox: [0, 0, 600, 800], text: chunks, graphics };
}

function stableRegions(input: LocalFigurePage) {
  const regions = localDocumentRegions([input]);
  for (const chunks of [
    [...input.text].reverse(),
    [...input.text.slice(1), ...input.text.slice(0, 1)],
  ]) {
    expect(
      localDocumentRegions([{ ...input, text: chunks, graphics: [...input.graphics].reverse() }]),
    ).toEqual(regions);
  }
  return regions;
}

const plot: LocalRuleRect = [286.8, 402, 448, 505];
const prose = [
  'Our independent evaluation compares the estimator',
  'with a reference implementation denoted AB',
  'The remaining observations use the same protocol.',
].join(' ');

function chartBesideProse(): LocalFigurePage {
  return page(
    [
      text('Our independent evaluation compares the estimator', [50, 492, 277, 501]),
      text('with a reference implementation denoted', [50, 480, 262, 489]),
      text('AB', [265, 480.7, 277, 488.5]),
      text('The remaining observations use the same protocol.', [50, 468, 277, 477]),
      // The tick and final prose fragment have closer centers than the tick and
      // preceding prose run, despite belonging to different typographic scales.
      text('0.6', [287, 484.1, 290.6, 488.6], 3.25),
      text('0.3', [287, 462, 290.6, 466.5], 3.25),
      text('0.0', [287, 440, 290.6, 444.5], 3.25),
      text('Dataset A', [309, 402, 324, 406], 3.25),
      text('Dataset B', [369, 402, 384, 406], 3.25),
      text('Series A', [365, 493, 387, 498], 4.2),
      text('Figure 7. Validation error across datasets.', [286.8, 384, 448, 392], 9),
    ],
    [plot],
  );
}

describe('public local document text tracks', () => {
  it('associates a painted chart without absorbing the neighboring prose fragment', () => {
    const regions = stableRegions(chartBesideProse());
    const images = regions.filter((region) => region.kind === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.rect).toEqual(plot);
    expect(images[0]?.text).toContain('0.6');
    expect(images[0]?.text).not.toContain('AB');
    const caption = regions.find((region) => region.kind === 'caption');
    expect(caption?.sourceObject).toBeDefined();
    expect(images[0]?.sourceObject).toEqual(caption?.sourceObject);
    expect(regions.filter((region) => region.flow === 'body')).toEqual([
      expect.objectContaining({ kind: 'text', text: prose, rect: [50, 468, 277, 501] }),
    ]);
  });

  it('keeps independently sized text separate without inventing an unpainted chart', () => {
    const input = chartBesideProse();
    const regions = stableRegions({ ...input, graphics: [] });
    expect(regions.filter((region) => region.kind === 'image' || region.kind === 'table')).toEqual(
      [],
    );
    expect(regions).toContainEqual(
      expect.objectContaining({ flow: 'body', text: prose, rect: [50, 468, 277, 501] }),
    );
    expect(regions).toContainEqual(
      expect.objectContaining({ flow: 'body', text: '0.6', rect: [287, 484.1, 290.6, 488.6] }),
    );
  });

  it.each([
    { side: 'left', rect: [36, 603, 40, 607] as LocalRuleRect },
    { side: 'right', rect: [290, 603, 294, 607] as LocalRuleRect },
  ])('separates a detached small label on the $side of a shared visual row', ({ rect }) => {
    const sentence = 'The body sentence retains its own independent geometry.';
    const regions = stableRegions(
      page([text(sentence, [50, 600, 280, 610]), text('0.8', rect, 3.25)]),
    );
    expect(regions.map((region) => [region.kind, region.flow, region.text, region.rect])).toEqual([
      ['text', 'body', sentence, [50, 600, 280, 610]],
      ['text', 'body', '0.8', rect],
    ]);
  });

  it('keeps caption subscripts beside their base instead of a distant plot-label track', () => {
    const regions = stableRegions(
      page(
        [
          text('Figure 1: A model with observations', [307, 611, 535, 619], 9),
          text('12', [250, 600.5, 256, 606.5], 6),
          text('and local observations x', [307, 600, 403, 608], 9),
          text('1:', [403, 599.5, 409, 605.5], 6),
          text('n', [409, 599.5, 414, 605.5], 6),
          text('. The parameter is fixed.', [414.5, 600, 543, 608], 9),
        ],
        [[310, 630, 500, 710]],
      ),
    );
    const caption = regions.find((region) => region.kind === 'caption');
    expect(caption?.rect).toEqual([307, 599.5, 543, 619]);
    expect(caption?.text?.replace(/\s+/gu, ' ')).toBe(
      'Figure 1: A model with observations and local observations x1:n. The parameter is fixed.',
    );
  });

  it.each([5, 6.5])(
    'preserves adjacent %s-point superscripts and subscripts in an equation',
    (size) => {
      const regions = stableRegions(
        page([
          text('A familiar equation is', [50, 600, 150, 608]),
          text('x', [154, 600, 162, 608]),
          text('2', [162, 602.5, 165, 608.5], size),
          text('+ y', [169, 600, 188, 608]),
          text('i', [188, 599.5, 191, 605.5], size),
          text('= 1.', [195, 600, 214, 608]),
        ]),
      );
      expect(regions).toEqual([
        expect.objectContaining({
          kind: 'text',
          flow: 'body',
          text: 'A familiar equation is x2 + yi = 1.',
          rect: [50, 599.5, 214, 608.5],
        }),
      ]);
    },
  );

  it('retains small kerning overlaps and ordinary inline typography changes', () => {
    const regions = stableRegions(
      page([
        text('Inter', [50, 500, 75, 510]),
        text('leaved', [74, 500, 104, 510], 9.5),
        text('words preserve the original reading order.', [108, 500, 310, 510]),
      ]),
    );
    expect(regions).toEqual([
      expect.objectContaining({
        kind: 'text',
        flow: 'body',
        text: 'Interleaved words preserve the original reading order.',
        rect: [50, 500, 310, 510],
      }),
    ]);
  });

  it('retains both overlapping streams without lending a prefix to the overprinted sentence', () => {
    const first = 'The first native stream describes an independent experiment.';
    const second = 'The overprinted stream reports its own unrelated observation.';
    const regions = stableRegions(
      page([
        text('The first ', [50, 500, 95, 510]),
        text('native stream describes an independent experiment.', [99, 500, 280, 510]),
        text(second, [96, 499, 270, 509], 8.7),
      ]),
    );
    expect(regions.map((region) => [region.kind, region.flow, region.text, region.rect])).toEqual([
      ['text', 'body', first, [50, 500, 280, 510]],
      ['text', 'body', second, [96, 499, 270, 509]],
    ]);
  });
});
