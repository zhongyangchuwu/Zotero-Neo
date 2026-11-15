import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  resolveLocalRuleProfile,
  type LocalFigurePage,
  type LocalFigureText,
  type LocalRuleRect,
  type LocalRuleRegion,
} from '../../src/document-analysis/local-rules';

function text(value: string, rect: LocalRuleRect, fontSize = 10): LocalFigureText {
  return { text: value, rect, fontSize };
}

function bodies(regions: readonly LocalRuleRegion[]): readonly LocalRuleRegion[] {
  return regions.filter((region) => region.kind === 'image' || region.kind === 'table');
}

const definitions = [
  'number of retained candidate observations',
  'set of independently measured outcomes',
  'distribution over the available decisions',
  'matrix of losses for each possible action',
  'confidence interval for the selected estimate',
];
const surrounding = [
  'The surrounding paragraph explains a separate experimental procedure.',
  'Its continuation remains ordinary document text rather than table content.',
];

function ruledDefinitions(orientation: 'above' | 'below' = 'above'): LocalFigurePage {
  const chunks = [
    text(
      'Table 1: Notation.',
      orientation === 'above' ? [245, 610, 355, 620] : [245, 460, 355, 470],
    ),
    text('Symbol', [90, 583, 130, 593]),
    text('Description', [190, 583, 240, 593]),
    text('Reference', [436, 583, 500, 593]),
    text(surrounding[0]!, [84, 420, 506, 430]),
    text(surrounding[1]!, [84, 408, 506, 418]),
  ];
  for (let row = 0; row < definitions.length; row++) {
    const y = 563 - row * 20;
    const words = definitions[row]!.split(' ');
    chunks.push(
      text('q', [90, y, 97, y + 10]),
      text(`${row + 1}`, [97, y - 1, 101, y + 5], 7),
      // The description and reference merge at the ordinary prose-line gap, but
      // their retained native chunks still reconstruct separate table cells.
      text(words.slice(0, 3).join(' '), [190, y, 300, y + 10]),
      text(words.slice(3).join(' '), [303, y, 425, y + 10]),
      text(`Section ${row + 1}`, [436, y, 500, y + 10]),
    );
  }
  const graphics: LocalRuleRect[] = [];
  for (let y = 480; y <= 600; y += 20) {
    graphics.push([84, y, 506.4, y + 0.4]);
    if (y < 600) {
      for (const x of [84, 180, 430, 506]) graphics.push([x, y, x + 0.4, y + 20]);
    }
  }
  return { pageIndex: 0, viewBox: [0, 0, 600, 800], text: chunks, graphics };
}

describe('native table width and repeated cell membership', () => {
  it.each(['above', 'below'] as const)(
    'uses repeated native cells beyond a short centered caption %s the table',
    (orientation) => {
      const input = ruledDefinitions(orientation);
      const regions = localDocumentRegions([input]);
      expect(bodies(regions)).toHaveLength(1);
      const body = bodies(regions)[0]!;
      expect(body).toMatchObject({ kind: 'table', rect: [84, 480, 506.4, 600.4] });
      expect(body.sourceObject).toBeDefined();
      expect(body.sourceObject).toEqual(
        regions.find((region) => region.kind === 'caption')?.sourceObject,
      );
      for (const definition of definitions) expect(body.text).toContain(definition);
      expect(body.text).toContain('Section 5');
      expect(body.text).toContain('Description');
      expect(
        regions.filter((region) => region.flow === 'body').map((region) => region.text),
      ).toEqual([surrounding.join(' ')]);
      expect(
        localDocumentRegions([
          { ...input, text: [...input.text].reverse(), graphics: [...input.graphics].reverse() },
        ]),
      ).toEqual(regions);
      expect(
        localDocumentRegions(
          [input],
          resolveLocalRuleProfile({ rules: { graphicLabels: { enabled: false } } }),
        ),
      ).toEqual(regions);
    },
  );

  it('does not widen a right-column table to a farther page-wide header', () => {
    const original = ruledDefinitions();
    const shift = (rect: LocalRuleRect): LocalRuleRect => [
      rect[0] + 230,
      rect[1],
      rect[2] + 230,
      rect[3],
    ];
    const leftProse = [
      'Independent observations remain ordinary prose.',
      'The left column explains another measurement.',
      'Its final line is unrelated to the symbol table.',
    ];
    const input: LocalFigurePage = {
      pageIndex: 0,
      viewBox: [0, 0, 900, 800],
      text: [
        ...original.text.map((chunk) => ({ ...chunk, rect: shift(chunk.rect) })),
        ...leftProse.map((value, row) => text(value, [50, 563 - row * 20, 285, 573 - row * 20])),
      ],
      graphics: [...original.graphics.map(shift), [50, 632, 850, 632.4]],
    };
    const regions = localDocumentRegions([input]);
    expect(bodies(regions)).toHaveLength(1);
    expect(bodies(regions)[0]?.rect).toEqual([314, 480, 736.4, 600.4]);
    for (const sentence of leftProse) {
      expect(
        regions.some((region) => region.flow === 'body' && region.text.includes(sentence)),
      ).toBe(true);
    }
    expect(
      localDocumentRegions([
        { ...input, text: [...input.text].reverse(), graphics: [...input.graphics].reverse() },
      ]),
    ).toEqual(regions);
  });

  it('keeps repeated-cell evidence optional and honors configured row and column requirements', () => {
    const input = ruledDefinitions();
    for (const unruledTables of [{ enabled: false }, { minRows: 8 }, { minColumns: 4 }]) {
      const regions = localDocumentRegions(
        [input],
        resolveLocalRuleProfile({ rules: { unruledTables } }),
      );
      expect(bodies(regions)).toEqual([]);
      const prose = regions.filter((region) => region.flow === 'body').map((region) => region.text);
      for (const definition of definitions) {
        expect(prose.some((paragraph) => paragraph.includes(definition))).toBe(true);
      }
    }
  });

  it('does not let a frame without repeated cells license enclosed paragraphs', () => {
    const input = ruledDefinitions();
    const paragraph = [
      'This framed discussion describes the independently measured observations.',
      'Its next sentence explains the assumptions behind the experimental protocol.',
      'The final sentence gives an ordinary narrative conclusion about the results.',
    ];
    const regions = localDocumentRegions([
      {
        ...input,
        text: [
          input.text[0]!,
          ...paragraph.map((value, row) => text(value, [90, 563 - row * 20, 500, 573 - row * 20])),
        ],
        graphics: [
          [84, 480, 506.4, 480.4],
          [84, 600, 506.4, 600.4],
          [84, 480, 84.4, 600],
          [506, 480, 506.4, 600],
        ],
      },
    ]);
    expect(bodies(regions)).toEqual([]);
    const prose = regions.filter((region) => region.flow === 'body').map((region) => region.text);
    for (const sentence of paragraph)
      expect(prose.some((value) => value.includes(sentence))).toBe(true);
  });

  it('does not mistake aligned prose columns inside native rules for repeated cells', () => {
    const input = ruledDefinitions();
    const left = 'The left paragraph reports the independently collected observations.';
    const right = 'The right paragraph discusses the separately measured outcomes.';
    const regions = localDocumentRegions([
      {
        ...input,
        text: [
          input.text[0]!,
          ...[563, 543, 523].flatMap((y) => [
            text(left, [90, y, 280, y + 10]),
            text(right, [300, y, 500, y + 10]),
          ]),
        ],
      },
    ]);
    expect(bodies(regions)).toEqual([]);
    const prose = regions.filter((region) => region.flow === 'body').map((region) => region.text);
    expect(prose.some((value) => value.includes(left))).toBe(true);
    expect(prose.some((value) => value.includes(right))).toBe(true);
  });

  it('preserves a real paragraph between the native cell grid and its caption', () => {
    const input = ruledDefinitions();
    const intervening = 'This intervening paragraph is independent of the repeated table cells.';
    const regions = localDocumentRegions([
      {
        ...input,
        text: [
          text('Table 1: Notation.', [245, 625, 355, 635]),
          ...input.text.slice(1),
          // Distinct body typography makes this prose, not an ambiguous caption continuation.
          text(intervening, [84, 609, 506, 619], 11),
        ],
      },
    ]);
    expect(bodies(regions)).toEqual([]);
    expect(
      regions.some((region) => region.flow === 'body' && region.text.includes(intervening)),
    ).toBe(true);
  });

  it('does not resolve competing captions by using the native grid width', () => {
    const input = ruledDefinitions();
    const regions = localDocumentRegions([
      { ...input, text: [...input.text, text('Table 2: Alternative.', [245, 460, 355, 470])] },
    ]);
    expect(bodies(regions)).toEqual([]);
    const captions = regions.filter((region) => region.kind === 'caption');
    expect(captions).toHaveLength(2);
    for (const caption of captions) expect(caption.sourceObject).toBeUndefined();
  });
});
