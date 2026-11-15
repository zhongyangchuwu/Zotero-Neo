import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  resolveLocalRuleProfile,
  type LocalFigurePage,
  type LocalFigureText,
  type LocalRuleOptions,
  type LocalRuleRect,
} from '../../src/document-analysis/local-rules';

function text(value: string, rect: LocalRuleRect, fontSize = 10): LocalFigureText {
  return { text: value, rect, fontSize };
}

function ruledAlgorithms(sharedDefinition = true): LocalFigurePage {
  const chunks: LocalFigureText[] = [
    text('Algorithm 3: Forward procedure', [60, 632, 250, 642]),
    text('Algorithm 4: Reverse procedure', [320, 632, 540, 642]),
    text(
      sharedDefinition
        ? 'In both algorithms, the response is defined by the following expression.'
        : 'This independent paragraph explains a separate measurement procedure.',
      [50, 440, 260, 449],
      9,
    ),
    text('Q(h,w) = ∑ y h(x) w', [80, 410, 235, 419], 9),
    text(
      'This shared definition supplies the response of each observation.',
      [50, 378, 260, 387],
      9,
    ),
    text('Figure 2: The paired iterative procedures.', [50, 350, 550, 360]),
    text('The next paragraph describes an independent experiment.', [50, 300, 550, 310]),
    text('Its aligned continuation remains ordinary document prose.', [50, 288, 550, 298]),
  ];
  for (let index = 0; index < 7; index++) {
    const bottom = 612 - index * 20;
    chunks.push(
      text(`${index + 1}: update the current forward state`, [60, bottom, 250, bottom + 10]),
    );
  }
  for (let index = 0; index < 11; index++) {
    const bottom = 612 - index * 20;
    chunks.push(
      text(`${index + 1}: update the current reverse state`, [320, bottom, 540, bottom + 10]),
    );
  }
  return {
    pageIndex: 0,
    viewBox: [0, 0, 600, 800],
    text: chunks,
    graphics: [
      [50, 649.6, 260, 650],
      [50, 625, 260, 625.4],
      [50, 470, 260, 470.4],
      [310, 649.6, 550, 650],
      [310, 625, 550, 625.4],
      [310, 390, 550, 390.4],
    ],
  };
}

function extract(input: LocalFigurePage, options: LocalRuleOptions = {}) {
  return localDocumentRegions([input], resolveLocalRuleProfile(options));
}

function bodies(input: LocalFigurePage, options: LocalRuleOptions = {}) {
  return extract(input, options).filter((region) => region.kind === 'image');
}

describe('authored algorithms assembled from independent horizontal rules', () => {
  it('retains both instruction panels and their bounded shared mathematical definition', () => {
    const input = ruledAlgorithms();
    const regions = extract(input);
    const images = regions.filter((region) => region.kind === 'image');
    expect(images).toHaveLength(2);
    expect(new Set(images.map((region) => region.sourceObject?.id)).size).toBe(1);
    expect(images.find((region) => region.rect[0] === 50)?.rect).toEqual([50, 378, 260, 650]);
    expect(images.find((region) => region.rect[0] === 310)?.text).toContain('11: update');
    expect(images.find((region) => region.rect[0] === 50)?.text).toContain('shared definition');
    expect(
      regions.some((region) => region.flow === 'body' && region.text.includes('shared definition')),
    ).toBe(false);
    expect(
      regions.some((region) => region.flow === 'body' && region.text.includes('next paragraph')),
    ).toBe(true);
    expect(
      extract({
        ...input,
        text: [...input.text].reverse(),
        graphics: [...input.graphics].reverse(),
      }),
    ).toEqual(regions);
  });

  it('does not turn unrelated intervening prose into an algorithm definition', () => {
    const input = ruledAlgorithms(false);
    expect(bodies(input)).toEqual([]);
    expect(
      extract(input).some(
        (region) => region.flow === 'body' && region.text.includes('independent paragraph'),
      ),
    ).toBe(true);
  });

  it('respects disabled rule contributions instead of fabricating an unpainted enclosure', () => {
    const input = ruledAlgorithms();
    expect(bodies(input, { rules: { graphicLabels: { enabled: false } } })).toEqual([]);
    expect(bodies(input, { rules: { ruledTables: { enabled: false } } })).toEqual([]);
  });
});
