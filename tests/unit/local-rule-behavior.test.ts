import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  localFigureRegions,
  localVisibleRegions,
  resolveLocalRuleProfile,
  type LocalFigurePage,
  type LocalFigureText,
  type LocalRuleDiagnostic,
  type LocalRuleOptions,
  type LocalRuleRect,
  type LocalRuleRegion,
} from '../../src/document-analysis/local-rules';

function text(value: string, rect: LocalRuleRect, fontSize = 10): LocalFigureText {
  return { text: value, rect, fontSize };
}

function page(
  text: readonly LocalFigureText[],
  graphics: readonly LocalRuleRect[] = [],
): LocalFigurePage {
  return { pageIndex: 0, viewBox: [0, 0, 600, 800], text, graphics };
}

function bodies(regions: readonly LocalRuleRegion[]): readonly LocalRuleRegion[] {
  return regions.filter((region) => region.kind === 'image' || region.kind === 'table');
}

function extract(
  input: LocalFigurePage,
  options: LocalRuleOptions = {},
): readonly LocalRuleRegion[] {
  return localFigureRegions([input], resolveLocalRuleProfile(options));
}

function cells(rows = 3, columns = 2): LocalFigurePage {
  const chunks = [text('Table 1: Measurements.', [50, 600, 280, 610])];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      chunks.push(
        text(`${row + 1}.${column + 1}`, [
          60 + column * 70,
          570 - row * 12,
          80 + column * 70,
          580 - row * 12,
        ]),
      );
    }
  }
  return page(chunks);
}

const panels = page(
  [text('Figure 1: Paired observations.', [50, 370, 550, 380])],
  [
    [50, 400, 250, 480],
    [350, 400, 550, 480],
  ],
);

const noOptionalRules: LocalRuleOptions = {
  rules: {
    unruledTables: { enabled: false },
    graphicLabels: { enabled: false },
    ruledTables: { enabled: false },
    compoundPanels: { enabled: false },
  },
};

describe('local rule profiles act on evidence and geometry', () => {
  it('requires the configured repeated rows and columns, without inventing painted evidence', () => {
    const input = cells();
    expect(bodies(extract(input)).map((region) => region.rect)).toEqual([[60, 546, 150, 580]]);
    expect(bodies(extract(input, { rules: { unruledTables: { enabled: false } } }))).toEqual([]);
    expect(bodies(extract(input, { rules: { unruledTables: { minRows: 4 } } }))).toEqual([]);
    expect(bodies(extract(input, { rules: { unruledTables: { minColumns: 3 } } }))).toEqual([]);
    expect(
      bodies(extract(cells(4, 3), { rules: { unruledTables: { minRows: 4, minColumns: 3 } } })),
    ).toHaveLength(1);
  });

  it('does not make table-owned cells depend on the optional graphic label rule', () => {
    const ordinary = extract(cells());
    expect(extract(cells(), { rules: { graphicLabels: { enabled: false } } })).toEqual(ordinary);
    expect(bodies(ordinary)[0]?.text).toContain('3.2');
  });

  it('controls detached label expansion without hiding the painted body', () => {
    const input = page(
      [
        text('Figure 1: Measurements.', [50, 370, 250, 380]),
        text('axis', [235, 430, 260, 440], 12),
      ],
      [[50, 400, 230, 480]],
    );
    expect(bodies(extract(input))[0]?.rect).toEqual([50, 400, 260, 480]);
    for (const graphicLabels of [{ enabled: false }, { maxGapEm: 0.3 }, { maxFontSizeEm: 1.1 }]) {
      expect(bodies(extract(input, { rules: { graphicLabels } }))[0]?.rect).toEqual([
        50, 400, 230, 480,
      ]);
      expect(bodies(extract(input, { rules: { graphicLabels } }))[0]?.text).not.toContain('axis');
    }
  });

  it('makes disconnected ruled-table links optional and applies endpoint tolerance', () => {
    const input = page(
      [
        text('Table 1: Values.', [50, 600, 280, 610]),
        text('11', [60, 566, 80, 576]),
        text('22', [60, 550, 80, 560]),
      ],
      [
        [50, 585, 280, 586],
        [51.5, 540, 281.5, 541],
      ],
    );
    const withoutCells = { rules: { unruledTables: { enabled: false } } } as const;
    expect(bodies(extract(input, withoutCells)).map((region) => region.rect)).toEqual([
      [50, 540, 281.5, 586],
    ]);
    expect(
      bodies(extract(input, { rules: { ...withoutCells.rules, ruledTables: { enabled: false } } })),
    ).toEqual([]);
    expect(
      bodies(
        extract(input, {
          rules: { ...withoutCells.rules, ruledTables: { endpointToleranceEm: 0.1 } },
        }),
      ),
    ).toEqual([]);
    expect(
      bodies(
        extract(input, {
          rules: { ...withoutCells.rules, ruledTables: { endpointToleranceEm: 0.15 } },
        }),
      ),
    ).toHaveLength(1);
  });

  it('retains competing panels instead of choosing one when panel joins are disabled', () => {
    expect(bodies(extract(panels))).toHaveLength(2);
    expect(bodies(extract(panels, { rules: { compoundPanels: { enabled: false } } }))).toEqual([]);
    expect(
      extract(panels, { rules: { compoundPanels: { enabled: false } } })[0]?.sourceObject,
    ).toBeUndefined();
  });

  it('uses panel gap and vertical overlap independently', () => {
    const stacked = page(
      [text('Figure 1: Rows.', [50, 370, 250, 380])],
      [
        [50, 435, 250, 455],
        [50, 400, 250, 420],
      ],
    );
    expect(bodies(extract(stacked))).toHaveLength(2);
    expect(bodies(extract(stacked, { rules: { compoundPanels: { maxGapEm: 1.4 } } }))).toEqual([]);
    const offset = page(
      [text('Figure 1: Columns.', [50, 370, 550, 380])],
      [
        [50, 400, 250, 480],
        [350, 440, 550, 520],
      ],
    );
    expect(bodies(extract(offset))).toHaveLength(2);
    expect(
      bodies(extract(offset, { rules: { compoundPanels: { minOverlapRatio: 0.6 } } })),
    ).toEqual([]);
  });

  it('applies caption distance and minimum body geometry without losing the caption', () => {
    const input = page(
      [text('Figure 1: A small body.', [50, 370, 250, 380])],
      [[50, 415, 90, 445]],
    );
    expect(bodies(extract(input))).toHaveLength(1);
    for (const association of [{ maxDistanceLines: 2 }, { minWidthEm: 5 }, { minHeightEm: 4 }]) {
      const regions = extract(input, { association });
      expect(bodies(regions)).toEqual([]);
      expect(regions).toHaveLength(1);
      expect(regions[0]?.text).toBe('Figure 1: A small body.');
      expect(regions[0]?.sourceObject).toBeUndefined();
    }
  });

  it('keeps prose and caption barriers mandatory even when all optional rules are disabled', () => {
    const input = page(
      [
        text('Figure 1: Observations.', [50, 300, 280, 310]),
        text('The preceding experiment measures the same quantity', [50, 334, 280, 344]),
        text('with a different protocol and an independent sample.', [50, 320, 280, 330]),
      ],
      [[50, 360, 280, 450]],
    );
    const regions = localDocumentRegions([input], resolveLocalRuleProfile(noOptionalRules));
    expect(bodies(regions)).toEqual([]);
    expect(regions.filter((region) => region.flow === 'body').map((region) => region.text)).toEqual(
      [
        'The preceding experiment measures the same quantity with a different protocol and an independent sample.',
      ],
    );
    const captionBarrier = page(
      [
        text('Figure 1: First.', [50, 300, 280, 310]),
        text('Figure 2: Intervening caption.', [50, 330, 280, 340]),
      ],
      [[50, 350, 280, 450]],
    );
    const separated = extract(captionBarrier, noOptionalRules);
    expect(
      separated.find((region) => region.text === 'Figure 1: First.')?.sourceObject,
    ).toBeUndefined();
    expect(bodies(separated)).toHaveLength(1);
  });

  it('excludes an isolated centered folio inside the bottom margin, not an in-flow number', () => {
    const prose = text('The final body line remains available to a reader.', [108, 70, 490, 79]);
    const folio = text('2', [297.5, 40, 302.5, 50]);
    const exclusions = (input: LocalFigurePage) =>
      localVisibleRegions(input).filter((region) => region.flow === 'excluded');

    expect(exclusions(page([prose, folio]))).toMatchObject([{ text: '2', rect: folio.rect }]);
    expect(exclusions(page([prose, text('2', [297.5, 57, 302.5, 67])]))).toEqual([]);
  });

  it('never gives a shared body to competing captions when optional rules are disabled', () => {
    const input = page(
      [
        text('Figure 1: Above.', [50, 510, 280, 520]),
        text('Figure 2: Below.', [50, 370, 280, 380]),
      ],
      [[50, 400, 280, 490]],
    );
    expect(bodies(extract(input, noOptionalRules))).toEqual([]);
    expect(extract(input, noOptionalRules).every((region) => !region.sourceObject)).toBe(true);
  });

  it('keeps invalid coordinates invalid under permissive profiles', () => {
    const input = page(
      [text('Figure 1: Evidence required.', [50, 370, 280, 380])],
      [
        [50, 400, Number.NaN, 480],
        [50, 400, 50, 480],
        [50, 480, 280, 400],
      ],
    );
    expect(
      bodies(
        extract(input, {
          association: { minWidthEm: 0.01, minHeightEm: 0.01, maxDistanceLines: 100 },
        }),
      ),
    ).toEqual([]);
  });
});

describe('local rule diagnostics preserve conservative uncertainty', () => {
  it('reports candidates and accepted evidence without changing complete output or input', () => {
    const input = cells();
    const before = JSON.stringify(input);
    const events: LocalRuleDiagnostic[] = [];
    const traced = localDocumentRegions([input], undefined, (event) => events.push(event));
    expect(traced).toEqual(localDocumentRegions([input]));
    expect(JSON.stringify(input)).toBe(before);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageIndex: 0,
          ruleId: 'unruledTables',
          outcome: 'candidate',
          reason: 'repeated-cell-grid',
        }),
        expect.objectContaining({
          ruleId: 'unruledTables',
          outcome: 'accepted',
          reason: 'caption-bounded-cells',
        }),
        expect.objectContaining({
          ruleId: 'captionAssociation',
          outcome: 'accepted',
          reason: 'uncontested-body',
          captionId: 'local:0:caption:0',
        }),
      ]),
    );
    expect(traced.every((region) => !('diagnostics' in region))).toBe(true);
  });

  it('distinguishes missing ruled-table evidence from a prose barrier and shared ownership', () => {
    const missing: LocalRuleDiagnostic[] = [];
    localFigureRegions(
      [
        page(
          [text('Table 1: Unknown.', [50, 370, 280, 380])],
          [
            [50, 400, 280, 401],
            [50, 430, 280, 431],
          ],
        ),
      ],
      undefined,
      (event) => missing.push(event),
    );
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'ruledTables',
          outcome: 'rejected',
          reason: 'missing-intervening-cells',
        }),
      ]),
    );

    const blocked: LocalRuleDiagnostic[] = [];
    localFigureRegions(
      [
        page(
          [
            text('Figure 1: Observations.', [50, 300, 280, 310]),
            text('The preceding experiment measures the same quantity', [50, 334, 280, 344]),
            text('with a different protocol and an independent sample.', [50, 320, 280, 330]),
          ],
          [[50, 360, 280, 450]],
        ),
      ],
      undefined,
      (event) => blocked.push(event),
    );
    expect(blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'captionAssociation',
          outcome: 'rejected',
          reason: 'prose-or-caption-barrier',
        }),
      ]),
    );

    const conflict: LocalRuleDiagnostic[] = [];
    localFigureRegions(
      [
        page(
          [
            text('Figure 1: Above.', [50, 510, 280, 520]),
            text('Figure 2: Below.', [50, 370, 280, 380]),
          ],
          [[50, 400, 280, 490]],
        ),
      ],
      resolveLocalRuleProfile(noOptionalRules),
      (event) => conflict.push(event),
    );
    expect(conflict).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'ownership',
          outcome: 'ambiguous',
          reason: 'shared-body-ownership',
          candidateIds: ['graphic:0:0'],
        }),
      ]),
    );
  });

  it('reports competing bands when disabled joins leave multiple plausible panels', () => {
    const events: LocalRuleDiagnostic[] = [];
    const result = localFigureRegions(
      [panels],
      resolveLocalRuleProfile({ rules: { compoundPanels: { enabled: false } } }),
      (event) => events.push(event),
    );
    expect(bodies(result)).toEqual([]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'captionAssociation',
          outcome: 'ambiguous',
          reason: 'competing-bands',
          candidateIds: ['graphic:0:0', 'graphic:0:1'],
        }),
      ]),
    );
    expect(
      events.some((event) => event.ruleId === 'compoundPanels' && event.outcome === 'accepted'),
    ).toBe(false);
  });

  it('is deterministic under input permutation, including competing-band diagnostics', () => {
    const profile = resolveLocalRuleProfile({ rules: { compoundPanels: { enabled: false } } });
    const first: LocalRuleDiagnostic[] = [];
    const second: LocalRuleDiagnostic[] = [];
    const original = localDocumentRegions([panels], profile, (event) => first.push(event));
    expect(
      localDocumentRegions(
        [{ ...panels, graphics: [...panels.graphics].reverse(), text: [...panels.text].reverse() }],
        profile,
        (event) => second.push(event),
      ),
    ).toEqual(original);
    expect(second).toEqual(first);
  });
});

describe('permissive profiles retain mandatory safety bounds', () => {
  it('keeps intervening prose when padded labels would expand a valid plot across it', () => {
    const input = page(
      [
        text('Figure 1: A valid plot.', [50, 370, 280, 380]),
        text('Label', [50, 540, 80, 550]),
        text(
          'This ordinary document prose must stay outside the plotted object.',
          [50, 514, 280, 524],
        ),
        text(
          'The following paragraph line remains selectable as document text.',
          [50, 500, 280, 510],
        ),
      ],
      [[50, 400, 280, 480]],
    );
    const regions = localDocumentRegions(
      [input],
      resolveLocalRuleProfile({ rules: { graphicLabels: { maxGapEm: 10 } } }),
    );
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]!.rect[3]).toBeLessThanOrEqual(500);
    expect(
      regions
        .filter((region) => region.flow === 'body')
        .map((region) => region.text)
        .join(' '),
    ).toContain('ordinary document prose');
    expect(
      regions
        .filter((region) => region.flow === 'body')
        .map((region) => region.text)
        .join(' '),
    ).toContain('Label');
  });

  it('does not use an oversized wrapped panel label to enlarge the image', () => {
    const continuation = [50, 372, 150, 382] as const;
    const input = page(
      [
        text('Figure 1: A panel.', [50, 340, 280, 350]),
        text('(a) Seed', [50, 385, 110, 395]),
        text('Oversized continuation', continuation, 10.5),
        text(
          'This ordinary body sentence fixes the native text scale at ten points.',
          [350, 700, 590, 710],
        ),
      ],
      [[50, 400, 280, 480]],
    );
    const events: LocalRuleDiagnostic[] = [];
    const regions = localFigureRegions(
      [input],
      resolveLocalRuleProfile({ rules: { graphicLabels: { maxFontSizeEm: 1 } } }),
      (event) => events.push(event),
    );
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]!.rect[1]).toBeGreaterThanOrEqual(385);
    expect(
      events.filter((event) => event.ruleId === 'graphicLabels' && event.outcome === 'accepted'),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ rect: continuation })]));
  });
});
