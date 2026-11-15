import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  resolveLocalRuleProfile,
  type LocalFigurePage,
  type LocalFigureText,
  type LocalRuleOptions,
  type LocalRuleRect,
  type LocalRuleRegion,
} from '../../src/document-analysis/local-rules';

function text(value: string, rect: LocalRuleRect, fontSize = 10): LocalFigureText {
  return { text: value, rect, fontSize };
}

function page(
  text: readonly LocalFigureText[],
  graphics: readonly LocalRuleRect[],
): LocalFigurePage {
  return { pageIndex: 0, viewBox: [0, 0, 600, 800], text, graphics };
}

function extract(
  input: LocalFigurePage,
  options: LocalRuleOptions = {},
): readonly LocalRuleRegion[] {
  return localDocumentRegions([input], resolveLocalRuleProfile(options));
}

function bodies(regions: readonly LocalRuleRegion[]): readonly LocalRuleRegion[] {
  return regions.filter((region) => region.kind === 'image' || region.kind === 'table');
}

function permuted(input: LocalFigurePage): LocalFigurePage {
  return { ...input, text: [...input.text].reverse(), graphics: [...input.graphics].reverse() };
}

const repeatedStack = page(
  [text('Table 1: Three repeated measurement panels.', [50, 300, 250, 310])],
  [
    [60, 516, 240, 596],
    [60, 418, 240, 498],
    [60, 320, 240, 400],
  ],
);

function mathematicalTable(): LocalFigurePage {
  const chunks = [
    text('Table 1: Learning backups.', [50, 600, 280, 610]),
    text('Algorithm', [60, 702, 110, 711], 9),
    text('Backup', [160, 702, 200, 711], 9),
    text('The surrounding discussion remains an ordinary document paragraph.', [50, 350, 550, 360]),
    text(
      'Its aligned continuation explains the independently measured results.',
      [50, 338, 550, 348],
    ),
  ];
  for (const y of [680, 660, 640]) {
    chunks.push(
      text('TD-Root', [60, y, 110, y + 9], 9),
      text('H(s) ← V(s)', [160, y, 265, y + 9], 9),
    );
  }
  return page(chunks, [
    [50, 700, 280, 700.4],
    [140, 635, 140.4, 711],
  ]);
}

function algorithmPanel(): LocalFigurePage {
  return page(
    [
      text('Algorithm 4: Coordinate updates', [70, 630, 250, 640]),
      text('1: initialise the weights', [70, 610, 230, 620]),
      text('2: for each observation', [70, 590, 230, 600]),
      text('3: return the estimate', [70, 570, 230, 580]),
      text(
        'Choose the best independent classifier and update all of its weights.',
        [70, 540, 270, 550],
      ),
      text('Figure 1: The iterative procedure.', [50, 420, 280, 430]),
      text(
        'The following paragraph describes a separate evaluation protocol.',
        [50, 360, 550, 370],
      ),
      text('Its next aligned line remains ordinary document prose.', [50, 348, 550, 358]),
    ],
    [[50, 450, 280, 650]],
  );
}

describe('repeated body envelopes remain caption bounded', () => {
  it('recovers three aligned panels beyond generic proximity without increasing caption distance', () => {
    const regions = extract(repeatedStack);
    expect(bodies(regions).map((region) => region.rect)).toEqual(repeatedStack.graphics);
    expect(new Set(bodies(regions).map((region) => region.sourceObject?.id)).size).toBe(1);
    expect(extract(permuted(repeatedStack))).toEqual(regions);
    expect(
      bodies(
        extract(repeatedStack, { rules: { compoundPanels: { maxRepeatedGapRatio: 0.2 } } }),
      ).map((region) => region.rect),
    ).toEqual([[60, 320, 240, 400]]);
    expect(
      bodies(extract(repeatedStack, { rules: { compoundPanels: { enabled: false } } })).map(
        (region) => region.rect,
      ),
    ).toEqual([[60, 320, 240, 400]]);
  });

  it('does not infer repetition from only two panels, unequal sizes or inconsistent gaps', () => {
    const variants: readonly (readonly LocalRuleRect[])[] = [
      repeatedStack.graphics.slice(1),
      [
        [80, 516, 220, 596],
        [60, 418, 240, 498],
        [60, 320, 240, 400],
      ],
      [
        [60, 528, 240, 608],
        [60, 418, 240, 498],
        [60, 320, 240, 400],
      ],
      [
        [60, 516, 240, 620],
        [60, 418, 240, 498],
        [60, 320, 240, 400],
      ],
    ];
    for (const graphics of variants) {
      expect(bodies(extract({ ...repeatedStack, graphics })).map((region) => region.rect)).toEqual([
        [60, 320, 240, 400],
      ]);
    }
  });

  it('does not cross intervening prose or arbitrate competing captions by distance', () => {
    const blocked = {
      ...repeatedStack,
      text: [
        ...repeatedStack.text,
        text(
          'This ordinary paragraph separates independent experimental objects.',
          [50, 403, 250, 413],
        ),
      ],
    };
    const regions = extract(blocked);
    expect(bodies(regions)).toEqual([]);
    expect(
      regions.some(
        (region) => region.flow === 'body' && region.text.includes('ordinary paragraph'),
      ),
    ).toBe(true);
    const shared = {
      ...repeatedStack,
      text: [
        ...repeatedStack.text,
        text('Table 2: Another unresolved caption.', [50, 605, 250, 615]),
      ],
    };
    expect(bodies(extract(shared))).toEqual([]);
    expect(extract(permuted(shared))).toEqual(extract(shared));
    const divided = extract({
      ...repeatedStack,
      text: [
        ...repeatedStack.text,
        text('Table 2: Intervening measurements.', [50, 503, 250, 513]),
      ],
    });
    const originalCaption = divided.find(
      (region) => region.kind === 'caption' && region.text.startsWith('Table 1'),
    )!;
    expect(
      bodies(divided)
        .filter((region) => region.sourceObject?.id === originalCaption.sourceObject?.id)
        .map((region) => region.rect),
    ).toEqual([[60, 320, 240, 400]]);
  });

  it('does not join an unequal-width neighboring object to a repeated stack', () => {
    const input = page(
      [
        text('Figure 1: Independent summary panels.', [50, 685, 280, 715]),
        text('Figure 2: Paired scatter plots.', [50, 80, 280, 110]),
      ],
      [
        [50, 470, 280, 678],
        [85, 290, 245, 455],
        [85, 122, 245, 286],
      ],
    );
    const regions = extract(input);
    const first = regions.find(
      (region) => region.kind === 'caption' && region.text.startsWith('Figure 1'),
    )!;
    const second = regions.find(
      (region) => region.kind === 'caption' && region.text.startsWith('Figure 2'),
    )!;
    expect(
      bodies(regions)
        .filter((region) => region.sourceObject?.id === first.sourceObject?.id)
        .map((region) => region.rect),
    ).toEqual([[50, 470, 280, 678]]);
    expect(
      bodies(regions)
        .filter((region) => region.sourceObject?.id === second.sourceObject?.id)
        .map((region) => region.rect),
    ).toEqual([
      [85, 290, 245, 455],
      [85, 122, 245, 286],
    ]);
    expect(first.sourceObject).toBeDefined();
    expect(second.sourceObject).toBeDefined();
    expect(first.sourceObject?.id).not.toBe(second.sourceObject?.id);
  });

  it('joins a wide native row to its tiled sibling row without stealing the preceding figure', () => {
    const input = page(
      [
        text('Figure 1: Independent upper plots.', [180, 600, 420, 610]),
        text('Figure 2: Two rows of related plots.', [50, 420, 550, 430]),
      ],
      [
        [50, 630, 550, 720],
        [50, 510, 550, 580],
        [50, 440, 190, 500],
        [210, 440, 350, 500],
        [370, 440, 550, 500],
      ],
    );
    const regions = extract(input);
    const first = regions.find(
      (region) => region.kind === 'caption' && region.text.startsWith('Figure 1'),
    )!;
    const second = regions.find(
      (region) => region.kind === 'caption' && region.text.startsWith('Figure 2'),
    )!;
    expect(
      bodies(regions)
        .filter((region) => region.sourceObject?.id === first.sourceObject?.id)
        .map((region) => region.rect),
    ).toEqual([[50, 630, 550, 720]]);
    expect(
      bodies(regions)
        .filter((region) => region.sourceObject?.id === second.sourceObject?.id)
        .map((region) => region.rect),
    ).toEqual(input.graphics.slice(1));
    expect(extract(permuted(input))).toEqual(regions);
  });
});

describe('native separators and caption-spanning operator envelopes', () => {
  it('uses native thin strokes of an L-shaped table scaffold independently of graphic labels', () => {
    const input = mathematicalTable();
    const regions = extract(input);
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]).toMatchObject({ kind: 'table', rect: [50, 635, 280, 711] });
    expect(bodies(regions)[0]?.text).toContain('TD-Root');
    expect(bodies(regions)[0]?.text).toContain('H(s)');
    expect(extract(input, { rules: { graphicLabels: { enabled: false } } })).toEqual(regions);
    expect(extract(permuted(input))).toEqual(regions);
    expect(
      regions.some(
        (region) => region.flow === 'body' && region.text.includes('surrounding discussion'),
      ),
    ).toBe(true);
  });

  it('does not use a table grid to license a scaffold extending into ordinary prose', () => {
    const input = mathematicalTable();
    const regions = extract({
      ...input,
      text: [
        ...input.text,
        text(
          'This explanatory paragraph is independent of the mathematical cells.',
          [50, 620, 280, 630],
        ),
      ],
      graphics: [
        [50, 700, 280, 700.4],
        [140, 618, 140.4, 711],
      ],
    });
    expect(bodies(regions).some((region) => region.text.includes('explanatory paragraph'))).toBe(
      false,
    );
    expect(
      regions.some(
        (region) => region.flow === 'body' && region.text.includes('explanatory paragraph'),
      ),
    ).toBe(true);
  });

  it('excludes independently headed algorithms from a neighboring measurement table on either side of its caption', () => {
    const input = mathematicalTable();
    const withAlgorithm = {
      ...input,
      text: [
        ...input.text,
        text('Algorithm 2: Tree search', [60, 550, 250, 560]),
        text('if s is terminal then', [60, 530, 250, 540]),
        text('for each child do', [60, 510, 250, 520]),
        text('return the best value', [60, 490, 250, 500]),
      ],
      graphics: [...input.graphics, [50, 400, 280, 570] as const],
    };
    for (const options of [{}, { rules: { graphicLabels: { enabled: false } } }]) {
      const regions = extract(withAlgorithm, options);
      expect(bodies(regions)).toHaveLength(1);
      expect(bodies(regions)[0]?.rect).toEqual([50, 635, 280, 711]);
      expect(bodies(regions)[0]?.text).not.toContain('Tree search');
    }
  });

  it('does not let a caption-spanning operator hull swallow the remaining valid diagram primitives', () => {
    const input = page(
      [
        text('Figure 1: A disconnected diagram.', [50, 400, 550, 410]),
        text(
          'This ordinary paragraph stays separate from the printed diagram.',
          [50, 350, 550, 360],
        ),
      ],
      [
        [40, 390, 560, 700],
        [100, 450, 260, 680],
        [340, 450, 500, 680],
      ],
    );
    const regions = extract(input);
    expect(bodies(regions).map((region) => region.rect)).toEqual([
      [100, 450, 260, 680],
      [340, 450, 500, 680],
    ]);
    expect(extract(permuted(input))).toEqual(regions);
    expect(
      regions.some(
        (region) => region.flow === 'body' && region.text.includes('ordinary paragraph'),
      ),
    ).toBe(true);
  });
});

describe('framed algorithm membership requires authored instruction evidence', () => {
  it('keeps algorithm instructions in the printed figure rather than classifying them as document prose', () => {
    const input = algorithmPanel();
    const regions = extract(input);
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]?.rect).toEqual([50, 450, 280, 650]);
    expect(bodies(regions)[0]?.text).toContain('Choose the best independent classifier');
    expect(
      regions.some((region) => region.flow === 'body' && region.text.includes('Choose the best')),
    ).toBe(false);
    expect(
      regions.some(
        (region) => region.flow === 'body' && region.text.includes('following paragraph'),
      ),
    ).toBe(true);
    expect(extract(permuted(input))).toEqual(regions);
    expect(bodies(extract(input, { rules: { graphicLabels: { enabled: false } } }))).toEqual([]);
  });

  it.each(['Experimental discussion', 'Algorithm 4: Incomplete evidence'])(
    'preserves a boxed paragraph headed %s without repeated instructions',
    (heading) => {
      const input = algorithmPanel();
      const regions = extract({
        ...input,
        text: [
          text(heading, [70, 630, 250, 640]),
          text(
            'The ordinary paragraph explains the independent sampling procedure.',
            [70, 600, 270, 610],
          ),
          text(
            'Its next normal baseline remains part of the same explanatory prose.',
            [70, 588, 270, 598],
          ),
          ...input.text.filter((chunk) => chunk.rect[3] < 450),
        ],
      });
      expect(bodies(regions)).toEqual([]);
      expect(
        regions.some(
          (region) => region.flow === 'body' && region.text.includes('ordinary paragraph'),
        ),
      ).toBe(true);
    },
  );

  it('bounds a shared small-type mathematical definition by the taller algorithm peer', () => {
    const input = page(
      [
        text('Algorithm 1: Forward updates', [60, 632, 250, 642]),
        text('1: initialise weights', [60, 612, 240, 622]),
        text('2: for each sample', [60, 592, 240, 602]),
        text('3: return the model', [60, 572, 240, 582]),
        text('Algorithm 2: Reverse updates', [320, 632, 540, 642]),
        text('1: initialise weights', [320, 612, 530, 622]),
        text('2: for each sample', [320, 592, 530, 602]),
        text('3: return the model', [320, 572, 530, 582]),
        text(
          'In both algorithms, the independent response is defined as follows.',
          [50, 440, 260, 449],
          9,
        ),
        text('Ω(h,w) = ∑ y h(x) w', [80, 410, 235, 419], 9),
        text(
          'This shared definition supplies the weighted response of each example.',
          [50, 378, 260, 387],
          9,
        ),
        text('Figure 1: Forward and reverse procedures.', [50, 350, 550, 360]),
        text(
          'The following paragraph discusses a separate evaluation protocol.',
          [50, 300, 550, 310],
        ),
        text(
          'Its next aligned baseline remains outside both algorithm panels.',
          [50, 288, 550, 298],
        ),
      ],
      [
        [50, 470, 260, 650],
        [310, 390, 550, 650],
      ],
    );
    const regions = extract(input);
    expect(bodies(regions)).toHaveLength(2);
    expect(bodies(regions).find((region) => region.rect[0] === 50)?.rect).toEqual([
      50, 378, 260, 650,
    ]);
    expect(bodies(regions).find((region) => region.rect[0] === 50)?.text).toContain(
      'shared definition',
    );
    expect(extract(permuted(input))).toEqual(regions);
    const ordinaryNote = {
      ...input,
      text: input.text.map((chunk) =>
        chunk.text.startsWith('In both algorithms')
          ? text(
              'This ordinary paragraph describes independent experimental observations.',
              chunk.rect,
            )
          : chunk,
      ),
    };
    expect(bodies(extract(ordinaryNote))).toEqual([]);
    expect(bodies(extract(input, { rules: { compoundPanels: { enabled: false } } }))).toEqual([]);
  });
});
