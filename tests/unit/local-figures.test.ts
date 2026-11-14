import { describe, expect, it } from 'vitest';
import { documentCaptionIdentity } from '../../src/document-analysis/caption-identity';
import type { DocumentRect, DocumentRegion } from '../../src/document-analysis/contracts';
import {
  localDocumentRegions,
  localFigureRegions,
  type LocalFigurePage,
  type LocalFigureText,
} from '../../src/document-analysis/local-figures';

function text(content: string, rect: DocumentRect, fontSize = 10): LocalFigureText {
  return { text: content, rect, fontSize };
}

function page(
  texts: readonly LocalFigureText[],
  graphics: readonly DocumentRect[],
): LocalFigurePage {
  return { pageIndex: 0, viewBox: [0, 0, 600, 800], text: texts, graphics };
}

function bodies(regions: readonly DocumentRegion[]): readonly DocumentRegion[] {
  return regions.filter((r) => r.kind === 'image' || r.kind === 'table');
}

function caption(regions: readonly DocumentRegion[], label: string): DocumentRegion {
  const found = regions.find(
    (r) => r.kind === 'caption' && documentCaptionIdentity(r.text)?.label === label,
  );
  expect(found).toBeDefined();
  return found!;
}

const composite = page(
  [
    text(
      'Figure 2: (a) Reference observations and (b) reconstructed observations.',
      [50, 390, 550, 400],
    ),
    text('(a)', [60, 600, 80, 610], 9),
    text('(b)', [380, 600, 400, 610], 9),
  ],
  [
    [50, 420, 210, 620],
    [370, 420, 550, 620],
  ],
);

describe('local digital-PDF figure regions', () => {
  it('retains every widely separated panel and its contained labels under one caption', () => {
    const regions = localFigureRegions([composite]);
    const cap = caption(regions, '2');
    expect(bodies(regions).map((r) => r.rect)).toEqual(composite.graphics);
    expect(bodies(regions).map((r) => r.text)).toEqual(['(a)', '(b)']);
    expect(cap.sourceObject?.kind).toBe('figure');
    expect(bodies(regions).every((r) => r.sourceObject?.id === cap.sourceObject?.id)).toBe(true);
    // The whitespace separating the panels is not turned into an image rectangle.
    expect(bodies(regions)).toHaveLength(2);
  });

  it('retains farther rows of a connected multi-panel layout, not just the nearest row', () => {
    const graphics: readonly DocumentRect[] = [
      [50, 500, 250, 580],
      [50, 405, 250, 485],
    ];
    const regions = localFigureRegions([
      page([text('Figure 3: (a) Original. (b) Transformed.', [50, 370, 250, 380])], graphics),
    ]);
    expect(bodies(regions).map((r) => r.rect)).toEqual(graphics);
    expect(new Set(regions.map((r) => r.sourceObject?.id)).size).toBe(1);
  });

  it('keeps adjacent tables separate with one caption above and the other below', () => {
    const left: DocumentRect = [50, 500, 280, 620];
    const right: DocumentRect = [320, 490, 550, 610];
    const regions = localFigureRegions([
      page(
        [
          text('Table IV: Reference results.', [50, 635, 280, 645]),
          text('Table V: Alternative results.', [320, 460, 550, 470]),
          text('Method', [60, 590, 105, 600]),
          text('Score', [200, 590, 235, 600]),
          text('Baseline', [330, 580, 380, 590]),
          text('0.97', [500, 580, 525, 590]),
        ],
        [left, right],
      ),
    ]);
    const first = caption(regions, 'IV');
    const second = caption(regions, 'V');
    expect(first.sourceObject).toBeDefined();
    expect(second.sourceObject).toBeDefined();
    expect(first.sourceObject?.id).not.toBe(second.sourceObject?.id);
    expect(bodies(regions).map((r) => [r.kind, r.rect, r.sourceObject?.id])).toEqual([
      ['table', left, first.sourceObject?.id],
      ['table', right, second.sourceObject?.id],
    ]);
  });

  it('assembles a table from disconnected vector rules and actual intervening cells', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Table A.1: Measurements.', [50, 630, 280, 640]),
          text('Method', [60, 590, 100, 600]),
          text('Score', [200, 590, 235, 600]),
          text('First', [60, 560, 90, 570]),
          text('0.91', [200, 560, 225, 570]),
          text('Second', [60, 540, 100, 550]),
          text('0.97', [200, 540, 225, 550]),
        ],
        [
          [50, 610, 280, 611],
          [50, 580, 280, 581],
          [50, 525, 280, 526],
        ],
      ),
    ]);
    const cap = caption(regions, 'A.1');
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]).toMatchObject({
      kind: 'table',
      rect: [50, 525, 280, 611],
      sourceObject: cap.sourceObject,
    });
    expect(bodies(regions)[0]?.text).toContain('0.97');
  });

  it('rejects an isolated rule without enough visual area or intervening table cells', () => {
    const regions = localFigureRegions([
      page(
        [text('Table 1: Results.', [50, 370, 280, 380])],
        [
          [50, 400, 280, 401],
          [50, 430, 280, 431],
        ],
      ),
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(caption(regions, '1').sourceObject).toBeUndefined();
  });

  it('uses paragraph typography and geometry to block a wrong neighboring figure', () => {
    const correct: DocumentRect = [50, 180, 280, 280];
    const regions = localFigureRegions([
      page(
        [
          text('Figure 4: Local visual evidence.', [50, 300, 280, 310]),
          text('The preceding experiment measures the same quantity', [50, 334, 280, 344]),
          text('with a different protocol and an independent sample.', [50, 320, 280, 330]),
        ],
        [[50, 360, 280, 450], correct],
      ),
    ]);
    expect(bodies(regions).map((r) => r.rect)).toEqual([correct]);
    expect(bodies(regions)[0]?.sourceObject).toEqual(caption(regions, '4').sourceObject);
  });

  it('does not treat a graphic enclosing ordinary paragraphs as a figure', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Figure 5: The reported experiment.', [50, 300, 280, 310]),
          text('The preceding experiment measures the same quantity', [60, 400, 270, 410]),
          text('with a different protocol and an independent sample.', [60, 386, 270, 396]),
        ],
        [[50, 340, 280, 450]],
      ),
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(caption(regions, '5').sourceObject).toBeUndefined();
  });

  it('assembles wrapped captions from mixed PDF text chunks and preserves their full geometry', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Table', [50, 580, 76, 590]),
          text('IV', [80, 580, 90, 590]),
          text(':', [91, 580, 94, 590]),
          { ...text('Results', [98, 580, 140, 590]), hasEOL: true },
          text('on the held-out evaluation samples.', [50, 566, 270, 576]),
        ],
        [[50, 600, 280, 690]],
      ),
    ]);
    const cap = caption(regions, 'IV');
    expect(cap.text).toBe('Table IV: Results\non the held-out evaluation samples.');
    expect(cap.rect).toEqual([50, 566, 270, 590]);
    expect(bodies(regions).map((r) => r.rect)).toEqual([[50, 600, 280, 690]]);
    expect(bodies(regions)[0]?.sourceObject).toEqual(cap.sourceObject);
  });

  it('keeps caption-only results when both directions have plausible bodies', () => {
    const regions = localFigureRegions([
      page(
        [text('Figure 6: Ambiguous placement.', [50, 400, 280, 410])],
        [
          [50, 430, 280, 530],
          [50, 280, 280, 380],
        ],
      ),
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(caption(regions, '6').sourceObject).toBeUndefined();
  });

  it('does not arbitrarily choose between disconnected nearby vertical bands', () => {
    const regions = localFigureRegions([
      page(
        [text('Figure 7: Ambiguous placement.', [50, 310, 280, 320])],
        [
          [50, 330, 280, 350],
          [50, 375, 280, 395],
        ],
      ),
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(caption(regions, '7').sourceObject).toBeUndefined();
  });

  it('drops all conflicting memberships instead of assigning one body to two captions', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Figure 8: First interpretation.', [50, 370, 280, 380]),
          text('Figure 9: Second interpretation.', [50, 520, 280, 530]),
        ],
        [[50, 400, 280, 500]],
      ),
    ]);
    expect(regions.filter((r) => r.kind === 'caption')).toHaveLength(2);
    expect(bodies(regions)).toEqual([]);
    expect(regions.every((r) => r.sourceObject === undefined)).toBe(true);
  });

  it('never fabricates a body from caption text, plot-like labels, or a page-sized blob', () => {
    for (const graphics of [
      [],
      [[0, 0, 600, 800]],
      [[10, 10, 590, 790]],
    ] as readonly DocumentRect[][]) {
      const regions = localFigureRegions([
        page(
          [
            text('Figure S1: An unresolved object.', [50, 300, 280, 310]),
            text('(a)', [60, 400, 80, 410], 9),
            text('Frequency', [80, 350, 140, 360], 9),
          ],
          graphics,
        ),
      ]);
      expect(bodies(regions)).toEqual([]);
      expect(caption(regions, 'S1').sourceObject).toBeUndefined();
    }
  });

  it('does not promote page-sized bounds assembled from individually narrow strokes', () => {
    const regions = localFigureRegions([
      page(
        [text('Figure 10: An unresolved object.', [50, 50, 550, 60])],
        [
          [0, 100, 600, 101],
          [0, 101, 1, 790],
          [599, 101, 600, 790],
          [0, 789, 600, 790],
        ],
      ),
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(caption(regions, '10').sourceObject).toBeUndefined();
  });

  it('ignores ordinary prose mentions without a real caption identity', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Figure shows the measurements and their uncertainty.', [50, 300, 400, 310]),
          text('Table mix is not a numbered caption.', [50, 280, 400, 290]),
        ],
        [[50, 350, 400, 500]],
      ),
    ]);
    expect(regions).toEqual([]);
  });

  it('keeps ids, membership and geometry invariant to source ordering and document scale', () => {
    const expected = localFigureRegions([composite]);
    expect(
      localFigureRegions([
        {
          ...composite,
          text: [...composite.text].reverse(),
          graphics: [...composite.graphics].reverse(),
        },
      ]),
    ).toEqual(expected);
    for (const factor of [0.5, 3]) {
      const transform = (r: DocumentRect): DocumentRect => [
        r[0] * factor + 17,
        r[1] * factor - 20,
        r[2] * factor + 17,
        r[3] * factor - 20,
      ];
      const scaled = localFigureRegions([
        {
          ...composite,
          viewBox: transform(composite.viewBox),
          graphics: composite.graphics.map(transform),
          text: composite.text.map((chunk) => ({
            ...chunk,
            rect: transform(chunk.rect),
            fontSize: chunk.fontSize * factor,
          })),
        },
      ]);
      expect(scaled).toEqual(expected.map((r) => ({ ...r, rect: transform(r.rect) })));
    }
    const secondPage = { ...composite, pageIndex: 3 };
    expect(localFigureRegions([secondPage, composite])).toEqual(
      localFigureRegions([composite, secondPage]),
    );
  });

  it('does not mutate frozen text, graphics, or page inputs', () => {
    const input = Object.freeze({
      ...composite,
      viewBox: Object.freeze([...composite.viewBox]) as DocumentRect,
      text: Object.freeze(
        composite.text.map((chunk) =>
          Object.freeze({ ...chunk, rect: Object.freeze([...chunk.rect]) as DocumentRect }),
        ),
      ),
      graphics: Object.freeze(composite.graphics.map((r) => Object.freeze([...r]) as DocumentRect)),
    });
    const before = JSON.stringify(input);
    const regions = localFigureRegions(Object.freeze([input]));
    expect(bodies(regions)).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('authored local caption labels', () => {
  it.each([
    ['Table IV: Results', 'table', 'IV'],
    ['TABLE XXIX. Results', 'table', 'XXIX'],
    ['Table S1: Supplementary results', 'table', 'S1'],
    ['Table A1: Appendix results', 'table', 'A1'],
    ['Table A.1: Appendix results', 'table', 'A.1'],
    ['Figure S1: Supplementary panels', 'figure', 'S1'],
    ['Figure A.1(a): Appendix panel', 'figure', 'A.1(a)'],
    ['Fig. 12b. Second panel', 'figure', '12b'],
    ['Figure 2 (c): Third panel', 'figure', '2(c)'],
    ['Figure 1.2: Decimal numbering', 'figure', '1.2'],
    ['图十二：测量结果', 'figure', '十二'],
    ['表二：结果', 'table', '二'],
  ])('recognizes %s without changing the shared identity shape', (title, kind, label) => {
    expect(documentCaptionIdentity(title)).toEqual({ kind, label });
  });

  it.each([
    'Figure shows the results',
    'Table shows the results',
    'Figure 1abc',
    'Table mix: prose',
    'Table CIVIL: prose',
    'Table IIII: invalid Roman label',
  ])('does not label ordinary or malformed text: %s', (title) => {
    expect(documentCaptionIdentity(title)).toBeNull();
  });
});

describe('local document paragraphs', () => {
  it('assembles visual lines and paragraphs from shuffled text chunks with stable local block identities', () => {
    const input = page(
      [
        text('A second paragraph starts after a blank line.', [50, 646, 280, 656]),
        text('experiments.', [170, 686, 235, 696]),
        text('This paragraph combines', [50, 700, 175, 710]),
        text('separate PDF chunks', [180, 700, 280, 710]),
        text('and continues across', [50, 686, 165, 696]),
      ],
      [],
    );
    const regions = localDocumentRegions([input]);
    expect(regions.map((r) => [r.kind, r.text, r.rect, r.flow])).toEqual([
      [
        'text',
        'This paragraph combines separate PDF chunks and continues across experiments.',
        [50, 686, 280, 710],
        'body',
      ],
      ['text', 'A second paragraph starts after a blank line.', [50, 646, 280, 656], 'body'],
    ]);
    expect(regions.map((r) => r.sourceBlock)).toEqual([
      { id: 'local:0:paragraph:0', order: 0 },
      { id: 'local:0:paragraph:1', order: 1 },
    ]);
    expect(localDocumentRegions([{ ...input, text: [...input.text].reverse() }])).toEqual(regions);
  });

  it('keeps independently wrapped columns in separate paragraph geometry', () => {
    const regions = localDocumentRegions([
      page(
        [
          text('The left column begins an independent discussion', [50, 700, 280, 710]),
          text('The right column contains a different argument', [340, 700, 550, 710]),
          text('and continues within the left column.', [50, 686, 280, 696]),
          text('which stays entirely in the right column.', [340, 686, 550, 696]),
        ],
        [],
      ),
    ]);
    expect(regions.map((r) => [r.text, r.rect])).toEqual([
      [
        'The left column begins an independent discussion and continues within the left column.',
        [50, 686, 280, 710],
      ],
      [
        'The right column contains a different argument which stays entirely in the right column.',
        [340, 686, 550, 710],
      ],
    ]);
  });

  it('preserves actual figure members without duplicating captions or diagram labels as prose', () => {
    const input = {
      ...composite,
      text: [
        ...composite.text,
        text(
          'The surrounding paragraph describes a reproducible experimental protocol',
          [50, 720, 550, 730],
        ),
        text(
          'and reports the resulting measurements in the following composite figure.',
          [50, 706, 550, 716],
        ),
      ],
    };
    const regions = localDocumentRegions([input]);
    const prose = regions.filter((r) => r.flow === 'body');
    expect(prose.map((r) => r.text)).toEqual([
      'The surrounding paragraph describes a reproducible experimental protocol and reports the resulting measurements in the following composite figure.',
    ]);
    expect(prose[0]?.rect).toEqual([50, 706, 550, 730]);
    expect(regions.filter((r) => r.flow !== 'body')).toEqual(localFigureRegions([input]));
    expect(bodies(regions)).toHaveLength(2);
  });

  it('excludes labels inside an uncaptioned diagram but retains prose inside a background border', () => {
    const regions = localDocumentRegions([
      page(
        [
          text('Input', [60, 500, 90, 510]),
          text('Output', [200, 450, 240, 460]),
          text('A bordered paragraph is still ordinary document prose', [60, 700, 290, 710]),
          text('when its aligned lines provide body typography evidence.', [60, 686, 290, 696]),
        ],
        [
          [50, 420, 280, 550],
          [50, 675, 300, 720],
        ],
      ),
    ]);
    expect(regions.map((r) => r.text)).toEqual([
      'A bordered paragraph is still ordinary document prose when its aligned lines provide body typography evidence.',
    ]);
    expect(regions[0]?.rect).toEqual([60, 686, 290, 710]);
    expect(regions[0]?.flow).toBe('body');
  });

  it('uses larger type or isolated section numbering for headings, not every short line', () => {
    const regions = localDocumentRegions([
      page(
        [
          text('A Digital Document', [50, 750, 300, 764], 14),
          text('1 Introduction', [50, 710, 180, 720]),
          text(
            'This section describes an ordinary paragraph with enough textual evidence',
            [50, 686, 550, 696],
          ),
          text(
            'to establish the document typography independently of the section titles.',
            [50, 672, 550, 682],
          ),
          text('A short unnumbered line', [50, 630, 180, 640]),
        ],
        [],
      ),
    ]);
    expect(regions.map((r) => [r.kind, r.text])).toEqual([
      ['heading', 'A Digital Document'],
      ['heading', '1 Introduction'],
      [
        'text',
        'This section describes an ordinary paragraph with enough textual evidence to establish the document typography independently of the section titles.',
      ],
      ['text', 'A short unnumbered line'],
    ]);
    expect(regions.every((r) => r.flow === 'body' && r.sourceBlock?.id.startsWith('local:'))).toBe(
      true,
    );
  });
});

describe('hosted PDF geometry regressions', () => {
  it('separates same-baseline captions across a narrow gutter and stops wrapping at table rules', () => {
    // An 18-point gutter is smaller than 2.5 text ems. A missing left-column EOL is genuine
    // PDF extraction geometry, not permission to join the independently authored captions.
    const chunks: LocalFigureText[] = [
      text('Table 2.', [55.44, 706.408, 87.947, 714.379]),
      text('Measured accuracy for the first estimator.', [91.03, 706.01, 289.43, 714.98]),
      text('Repeated estimates use independent trials.', [55.44, 695.05, 289.43, 704.02]),
      text('Additional runs retain the same protocol.', [55.44, 684.09, 289.43, 693.06]),
      text('Durations are reported in seconds.', [55.44, 673.14, 230, 682.1]),
      text('Table 3.', [307.44, 706.408, 339.947, 714.379]),
      {
        ...text('Measured accuracy for the second estimator.', [343.03, 706.01, 541.43, 714.98]),
        hasEOL: true,
      },
      {
        ...text('Each estimate uses a separate validation run.', [307.44, 695.05, 541.43, 704.02]),
        hasEOL: true,
      },
      text('Method', [61.42, 657.79, 92.63, 666.76]),
      text('Error Rate', [179.3, 657.79, 223.14, 666.76]),
      text('Duration', [237.16, 657.79, 295.64, 666.76]),
      text('(%)', [193.8, 647.83, 208.63, 656.79]),
      text('(seconds)', [247.66, 647.83, 285.13, 656.79]),
      text('Method', [328.4, 679.46, 359.61, 688.43]),
      text('First sample', [422.07, 679.46, 451.07, 688.43]),
      text('Second sample', [479.68, 679.46, 513.3, 688.43]),
    ];
    for (const y of [637.47, 627.51, 617.54, 606.49, 596.53, 585.88, 575.92]) {
      chunks.push(
        text('Random local estimator', [61.42, y, 164.78, y + 8.96]),
        text('11.15 ± 0.77', [178.95, y, 223.47, y + 8.96]),
        text('2.55', [261.29, y, 277.66, y + 8.96]),
      );
    }
    for (const y of [669.1, 659.13, 649.17, 639.21, 629.25, 619.29, 608.24, 598.27]) {
      chunks.push(
        text('Local estimator', [328.4, y, 400.63, y + 8.96]),
        text('21.35 ± 2.08', [414.31, y, 458.83, y + 8.96]),
        text('11.91 ± 0.62', [474.23, y, 518.75, y + 8.96]),
      );
    }
    const input = page(chunks, [
      [55.237, 667.008, 301.838, 667.413],
      [55.237, 646.687, 301.838, 647.092],
      [55.237, 616.393, 301.838, 616.798],
      [55.237, 574.777, 301.838, 575.182],
      [322.223, 688.67, 526.657, 689.075],
      [322.223, 678.312, 526.657, 678.717],
      [322.223, 618.139, 526.657, 618.544],
      [322.223, 597.131, 526.657, 597.536],
    ]);
    const regions = localFigureRegions([input]);
    const first = caption(regions, '2');
    const second = caption(regions, '3');
    expect(regions.filter((r) => r.kind === 'caption')).toHaveLength(2);
    expect(first.text).not.toContain('Table 3');
    expect(first.text).not.toContain('Method');
    expect(first.rect).toEqual([55.44, 673.14, 289.43, 714.98]);
    expect(second.rect).toEqual([307.44, 695.05, 541.43, 714.98]);
    expect(first.sourceObject).toBeDefined();
    expect(second.sourceObject).toBeDefined();
    expect(first.sourceObject?.id).not.toBe(second.sourceObject?.id);
    expect(bodies(regions).map((r) => [r.rect, r.sourceObject])).toEqual([
      [[55.237, 574.777, 301.838, 667.413], first.sourceObject],
      [[322.223, 597.131, 526.657, 689.075], second.sourceObject],
    ]);
    expect(bodies(regions)[0]?.text).toContain('11.15 ± 0.77');
    expect(bodies(regions)[1]?.text).toContain('21.35 ± 2.08');
  });

  it('separates slightly offset adjacent figure captions without dropping compound panels', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Figure 7.', [55.115, 319.774, 88.824, 327.844], 9),
          text('Two independently measured panels.', [90, 319.774, 289.12, 327.844], 9),
          text('Their common scale permits direct comparison.', [55.44, 308.73, 289.55, 316.8], 9),
          text('Figure 8.', [307.115, 320.134, 340.824, 328.204], 9),
          text('An independent reference diagram.', [342, 320.134, 541.33, 328.204], 9),
          text('This diagram uses a different measurement.', [307.44, 309.09, 541.43, 317.16], 9),
        ],
        [
          [56.88, 345, 145, 517],
          [210, 345, 289.44, 517],
          [308.88, 345, 541.44, 517],
        ],
      ),
    ]);
    const first = caption(regions, '7');
    const second = caption(regions, '8');
    expect(regions.filter((r) => r.kind === 'caption')).toHaveLength(2);
    expect(first.text).not.toContain('Figure 8');
    expect(second.text).not.toContain('Figure 7');
    expect(
      bodies(regions)
        .filter((r) => r.sourceObject?.id === first.sourceObject?.id)
        .map((r) => r.rect),
    ).toEqual([
      [56.88, 345, 145, 517],
      [210, 345, 289.44, 517],
    ]);
    expect(
      bodies(regions)
        .filter((r) => r.sourceObject?.id === second.sourceObject?.id)
        .map((r) => r.rect),
    ).toEqual([[308.88, 345, 541.44, 517]]);
  });

  it.each(['Fig. 2(c),', 'Table 2,'])(
    'keeps a paragraph-continuing %s reference in body text',
    (reference) => {
      const input = page(
        [
          {
            ...text(
              'The discussion concerns a sparse connected representation.',
              [307.44, 388.94, 541.43, 398.9],
            ),
            hasEOL: true,
          },
          {
            ...text(
              'Further comparisons use the same connected neighborhood.',
              [307.44, 376.99, 541.43, 386.95],
            ),
            hasEOL: true,
          },
          {
            ...text(
              `${reference} is part of this argument rather than a new object.`,
              [307.44, 365.024, 541.43, 374.987],
            ),
            hasEOL: true,
          },
          {
            ...text(
              'The paragraph continues on the next normal baseline.',
              [307.44, 353.07, 541.43, 363.03],
            ),
            hasEOL: true,
          },
        ],
        [],
      );
      expect(localFigureRegions([input])).toEqual([]);
      const regions = localDocumentRegions([input]);
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({
        kind: 'text',
        flow: 'body',
        rect: [307.44, 353.07, 541.43, 398.9],
      });
      expect(regions[0]?.text).toContain(reference);
      expect(regions[0]?.text).toContain('The paragraph continues');
    },
  );

  it.each(['Figure 4 shows', 'Fig. 4 illustrates', 'Table IV summarizes'])(
    'keeps a paragraph-starting %s reference in body text even beside a plausible graphic',
    (lead) => {
      const input = page(
        [
          text(`${lead} the estimated results for all experimental groups.`, [50, 500, 280, 510]),
          text(
            'The repeated measurements use independent samples in each trial.',
            [50, 488, 280, 498],
          ),
          text(
            'Their uncertainty is evaluated with the same sampling protocol.',
            [50, 476, 280, 486],
          ),
        ],
        [[50, 540, 280, 640]],
      );
      expect(localFigureRegions([input])).toEqual([]);
      const regions = localDocumentRegions([input]);
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({
        kind: 'text',
        flow: 'body',
        rect: [50, 476, 280, 510],
      });
      expect(regions[0]?.text).toContain(lead);
      expect(regions[0]?.text).toContain('Their uncertainty');
    },
  );

  it.each(['Figure 4. Shows', 'Table IV: Summarizes'])(
    'preserves a punctuated %s caption with the same typography as body text',
    (lead) => {
      const regions = localFigureRegions([
        page(
          [
            text(`${lead} the estimated results for all experimental groups.`, [50, 500, 280, 510]),
            text(
              'The repeated measurements use independent samples in each trial.',
              [50, 488, 280, 498],
            ),
          ],
          [[50, 540, 280, 640]],
        ),
      ]);
      expect(bodies(regions)).toHaveLength(1);
      expect(regions.find((r) => r.kind === 'caption')?.text).toContain(lead);
      expect(bodies(regions)[0]?.sourceObject).toEqual(
        regions.find((r) => r.kind === 'caption')?.sourceObject,
      );
    },
  );

  it.each([9, 9.09])(
    'stops a %s-point wrapped caption at the larger body-text typography',
    (captionSize) => {
      const input = page(
        [
          text('Figure 5. Independent measurements.', [50, 500, 280, 509], captionSize),
          text('Repeated estimates share the same scale.', [50, 489, 280, 498], 9),
          text(
            'The following discussion concerns the complete experimental protocol.',
            [50, 477, 280, 487],
          ),
          text(
            'Its next aligned line must remain ordinary document body text.',
            [50, 465, 280, 475],
          ),
        ],
        [[50, 530, 280, 640]],
      );
      const regions = localDocumentRegions([input]);
      const cap = caption(regions, '5');
      expect(cap.rect).toEqual([50, 489, 280, 509]);
      expect(cap.text).toBe(
        'Figure 5. Independent measurements.\nRepeated estimates share the same scale.',
      );
      expect(bodies(regions)).toHaveLength(1);
      expect(bodies(regions)[0]?.sourceObject).toEqual(cap.sourceObject);
      expect(regions.filter((r) => r.flow === 'body').map((r) => r.text)).toEqual([
        'The following discussion concerns the complete experimental protocol. Its next aligned line must remain ordinary document body text.',
      ]);
    },
  );

  it('uses persistent column starts rather than a fixed gutter width to assemble prose', () => {
    const regions = localDocumentRegions([
      page(
        [
          text('The left column starts an independent discussion', [55.44, 700, 289.43, 710]),
          text('The right column introduces a different experiment', [307.44, 700, 541.43, 710]),
          text('and continues on the next visual baseline', [55.44, 688, 289.43, 698]),
          text('whose observations must remain in this column', [307.44, 688, 541.43, 698]),
          text('before completing its original argument.', [55.44, 676, 289.43, 686]),
          text('without interleaving the neighboring paragraph.', [307.44, 676, 541.43, 686]),
        ],
        [],
      ),
    ]);
    expect(regions.map((r) => r.rect)).toEqual([
      [55.44, 676, 289.43, 710],
      [307.44, 676, 541.43, 710],
    ]);
    expect(regions[0]?.text).not.toContain('right column');
    expect(regions[1]?.text).not.toContain('left column');
    expect(regions.every((r) => r.flow === 'body')).toBe(true);
  });
});

describe('painted structures and neighboring object ownership', () => {
  it('keeps diagram labels out of caption wrapping and resolves stacked figures from an uncontested anchor', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Figure 1: Two related panels.', [50, 460, 280, 470]),
          text('600', [65, 450, 85, 458], 9),
          text('Figure 2: An independent diagram.', [50, 300, 280, 310]),
        ],
        [
          [50, 500, 140, 620],
          [210, 500, 280, 620],
          [50, 330, 280, 459],
        ],
      ),
    ]);
    const first = caption(regions, '1');
    const second = caption(regions, '2');
    expect(first.rect).toEqual([50, 460, 280, 470]);
    expect(first.text).not.toContain('600');
    expect(
      bodies(regions)
        .filter((r) => r.sourceObject?.id === first.sourceObject?.id)
        .map((r) => r.rect),
    ).toEqual([
      [50, 500, 140, 620],
      [210, 500, 280, 620],
    ]);
    expect(
      bodies(regions)
        .filter((r) => r.sourceObject?.id === second.sourceObject?.id)
        .map((r) => r.rect),
    ).toEqual([[50, 330, 280, 459]]);
    expect(
      bodies(regions).find((r) => r.sourceObject?.id === second.sourceObject?.id)?.text,
    ).toContain('600');
  });

  it('does not extend a table into a nearly touching figure with its own caption on the opposite side', () => {
    const regions = localFigureRegions([
      page(
        [
          text('Table 1: Independent measurements.', [50, 675, 280, 685]),
          text('Figure 2: Independent observations.', [50, 390, 280, 400]),
        ],
        [
          [50, 575, 280, 667],
          [50, 419, 280, 571],
        ],
      ),
    ]);
    expect(bodies(regions).map((r) => [r.kind, r.rect, r.sourceObject?.id])).toEqual([
      ['table', [50, 575, 280, 667], caption(regions, '1').sourceObject?.id],
      ['image', [50, 419, 280, 571], caption(regions, '2').sourceObject?.id],
    ]);
    expect(caption(regions, '1').sourceObject).toBeDefined();
    expect(caption(regions, '2').sourceObject).toBeDefined();
  });

  it.each([0.3, 4.4])(
    'assembles a text-heavy hierarchy with %s-point connector hulls',
    (stemWidth) => {
      const input = page(
        [
          text('Ordinary surrounding prose establishes the body typography.', [50, 700, 280, 710]),
          text(
            'Its next aligned line remains separate from the diagram below.',
            [50, 688, 280, 698],
          ),
          text('Root', [50, 542, 72, 550], 7.5),
          text('Branch Alpha', [80, 536, 150, 544], 7.5),
          text('Leaf One', [156, 536, 210, 544], 7.5),
          text('Leaf Two', [156, 500, 210, 508], 7.5),
          text('Branch Beta', [80, 412, 144, 420], 7.5),
          text('Figure 1: A hierarchy with textual nodes.', [50, 380, 280, 390]),
        ],
        [
          [74, 410, 74 + stemWidth, 550],
          [74, 540, 80, 540.3],
          [74, 415, 80, 415.3],
          [150, 420, 150 + stemWidth, 540],
          [150, 539.8, 156, 540.2],
        ],
      );
      const regions = localDocumentRegions([input]);
      expect(bodies(regions)).toHaveLength(1);
      expect(bodies(regions)[0]?.rect).toEqual([50, 410, 210, 550]);
      expect(bodies(regions)[0]?.text).toContain('Branch Alpha');
      expect(bodies(regions)[0]?.text).toContain('Leaf Two');
      expect(bodies(regions)[0]?.sourceObject).toEqual(caption(regions, '1').sourceObject);
      expect(regions.filter((r) => r.flow === 'body').map((r) => r.text)).toEqual([
        'Ordinary surrounding prose establishes the body typography. Its next aligned line remains separate from the diagram below.',
      ]);
    },
  );

  it.each(['above', 'below'])(
    'uses repeated lexical cell columns around a single rule with a caption %s',
    (orientation) => {
      const chunks = [
        text('A vocabulary header describes the independent groups of words.', [60, 504, 280, 514]),
        text('Ordinary surrounding prose must remain outside the table.', [50, 350, 290, 360]),
        text('The neighboring paragraph continues on its normal baseline.', [50, 338, 290, 348]),
        text(
          'Table 1: Grouped vocabulary examples.',
          orientation === 'above' ? [50, 540, 290, 550] : [50, 420, 290, 430],
        ),
      ];
      for (const y of [476, 464, 452]) {
        chunks.push(
          text('alpha', [60, y, 85, y + 10]),
          text('beta', [140, y, 165, y + 10]),
          text('gamma', [220, y, 260, y + 10]),
        );
      }
      const regions = localDocumentRegions([page(chunks, [[50, 496, 290, 496.4]])]);
      expect(bodies(regions)).toHaveLength(1);
      expect(bodies(regions)[0]).toMatchObject({
        kind: 'table',
        rect: [50, 452, 290, 514],
        sourceObject: caption(regions, '1').sourceObject,
      });
      expect(bodies(regions)[0]?.text).toContain('A vocabulary header describes');
      expect(bodies(regions)[0]?.text).toContain('gamma');
      expect(regions.filter((r) => r.flow === 'body').map((r) => r.text)).toEqual([
        'Ordinary surrounding prose must remain outside the table. The neighboring paragraph continues on its normal baseline.',
      ]);
    },
  );
});
