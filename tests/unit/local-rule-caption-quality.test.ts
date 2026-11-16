import { describe, expect, it } from 'vitest';
import {
  localDocumentRegions,
  localFigureRegions,
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

describe('source-backed local caption quality', () => {
  it.each([
    { lead: 'Table 1 contains', lineHeight: 9, baseline: 11 },
    { lead: 'Fig. 2 also illustrates', lineHeight: 10, baseline: 12 },
    { lead: 'Figure 2 summarizes', lineHeight: 12, baseline: 11 },
    { lead: 'Figure 4 displays', lineHeight: 9, baseline: 12 },
  ])(
    'keeps the paragraph beginning "$lead" as ordinary prose',
    ({ lead, lineHeight, baseline }) => {
      // Native text boxes can overlap vertically even though their baselines are distinct.
      const sentences = [
        `${lead} the observed results and the differences between independent methods.`,
        'The following discussion explains these differences using the same experimental data.',
        'All remaining observations belong to this paragraph rather than an authored caption.',
      ];
      const input = page(
        sentences.map((sentence, row) =>
          text(sentence, [108, 500 - row * baseline, 504, 500 - row * baseline + lineHeight]),
        ),
        [[108, 545, 504, 640]],
      );
      expect(localFigureRegions([input])).toEqual([]);
      expect(localDocumentRegions([input]).map((region) => [region.kind, region.text])).toEqual([
        ['text', sentences.join(' ')],
      ]);
    },
  );

  it('keeps a standalone numbered reference at the end of an unfinished paragraph', () => {
    const sentences = [
      'The first message follows the same update rule for the complete connected structure.',
      'They are shown by the wide red arrows in',
      'Fig. 1.',
    ];
    const input = page([
      text(sentences[0]!, [55.44, 203.849, 289.44, 212.696]),
      text(sentences[1]!, [55.44, 191.894, 289.44, 200.741]),
      text(sentences[2]!, [55.44, 179.939, 83.527, 188.786]),
    ]);
    expect(localFigureRegions([input])).toEqual([]);
    expect(localDocumentRegions([input]).map((region) => region.text)).toEqual([
      sentences.join(' '),
    ]);
  });

  it.each([6, 10])('retains an isolated %s-point label-only caption', (fontSize) => {
    const input = page(
      [
        text('Ordinary prose establishes the independent body typography.', [50, 700, 280, 710]),
        text('Its next line discusses an unrelated experimental protocol.', [50, 688, 280, 698]),
        text('Fig. 1.', [50, 390, 78, 390 + fontSize], fontSize),
      ],
      [[50, 420, 280, 485]],
    );
    const regions = localFigureRegions([input]);
    expect(
      regions.filter((region) => region.kind === 'caption').map((region) => region.text),
    ).toEqual(['Fig. 1.']);
    expect(regions.some((region) => region.kind === 'image')).toBe(true);
  });

  it('does not turn a boxed label-only caption into the preceding unfinished prose', () => {
    const input = page(
      [
        text(
          'The surrounding discussion concerns a reproducible experimental protocol.',
          [50, 442, 280, 452],
        ),
        text(
          'The preceding paragraph discusses several independent observations in',
          [50, 430, 280, 440],
        ),
        text('Fig. 1.', [50, 418, 78, 428]),
      ],
      [[45, 400, 285, 429]],
    );
    expect(
      localFigureRegions([input])
        .filter((region) => region.kind === 'caption')
        .map((region) => region.text),
    ).toEqual(['Fig. 1.']);
    expect(
      localDocumentRegions([input])
        .filter((region) => region.flow === 'body')
        .map((region) => region.text),
    ).toEqual([
      'The surrounding discussion concerns a reproducible experimental protocol. The preceding paragraph discusses several independent observations in',
    ]);
  });

  it.each([
    'Table 1: Contains',
    'Fig. 2. Also illustrates',
    'Figure 2. Summarizes',
    'Figure 4. Displays',
  ])('preserves the explicitly punctuated caption "%s"', (lead) => {
    const regions = localFigureRegions([
      page(
        [
          text(`${lead} the independently measured observations.`, [50, 500, 280, 510]),
          text('Each estimate uses a separate evaluation sample.', [50, 488, 280, 498]),
        ],
        [[50, 540, 280, 620]],
      ),
    ]);
    expect(regions.find((region) => region.kind === 'caption')?.text).toBe(
      `${lead} the independently measured observations.\nEach estimate uses a separate evaluation sample.`,
    );
  });

  it('isolates a wrapped caption from the adjacent column without losing its prose', () => {
    const prose = [
      'The left column describes a separate experiment and its observations.',
      'Its argument continues independently on the next normal baseline.',
      'The final sentence remains ordinary document text in this column.',
    ];
    const caption = [
      'Figure 3. Top: A dependency parse tree.',
      'Middle: The corresponding factor graph.',
      'Bottom: An alternative representation.',
    ];
    const chunks = prose.flatMap((sentence, row) => [
      text(sentence, [50, 400 - row * 11, 280, 410 - row * 11]),
      text(caption[row]!, [300, 400 - row * 11, 540, 408 - row * 11], 9),
    ]);
    const regions = localDocumentRegions([page(chunks)]);
    expect(regions.find((region) => region.kind === 'caption')).toMatchObject({
      rect: [300, 378, 540, 408],
      text: caption.join('\n'),
    });
    expect(regions.filter((region) => region.flow === 'body').map((region) => region.text)).toEqual(
      [prose.join(' ')],
    );
  });

  it('does not interleave overlapping native text streams into a visible caption', () => {
    // The original page contains an independently clipped embedded stream. This fixture
    // deliberately retains it: line grouping must not pretend to establish visibility.
    const input = page([
      text(
        'Ordinary prose establishes the body typography for this document.',
        [50, 700, 280, 710],
      ),
      text(
        'The following line continues the independent experimental discussion.',
        [50, 688, 280, 698],
      ),
      text('Figure 3.', [307, 392, 344, 400], 9),
      text('Top:', [347, 392, 365, 400], 9),
      text('A dependency parse tree.', [371, 392, 541, 400], 9),
      text('A separate embedded sentence crosses the same baseline.', [338, 391, 508, 399], 8.2),
      text('An arc', [307, 381, 336, 389], 9),
      text('links the head to its modifier.', [340, 381, 541, 389], 9),
      text('Another embedded sentence overlaps the next caption row.', [338, 380, 508, 388], 8.2),
      text('The model includes a hard constraint factor.', [307, 370, 541, 378], 9),
      text('The embedded text continues through this row as well.', [338, 369, 508, 377], 8.2),
      text('Figure 1: An embedded caption.', [358, 668, 488, 676], 8.2),
    ]);
    const regions = localFigureRegions([input]);
    expect(
      regions.find((region) => region.kind === 'caption' && region.text.startsWith('Figure 3.')),
    ).toMatchObject({
      rect: [307, 370, 541, 400],
      text: 'Figure 3. Top: A dependency parse tree.\nAn arc links the head to its modifier.\nThe model includes a hard constraint factor.',
    });
    // Determining that this seed is clipped is the host's responsibility, not a text heuristic.
    expect(regions.some((region) => region.text === 'Figure 1: An embedded caption.')).toBe(true);
  });

  it('keeps both overlapping prose streams rather than deleting or interleaving their words', () => {
    const first = 'The first native text stream describes the independent experiment.';
    const second = 'The second native text stream reports a different observation.';
    const regions = localDocumentRegions([
      page([text(first, [50, 500, 280, 510]), text(second, [80, 500, 250, 510], 9)]),
    ]);
    expect(regions.map((region) => region.text)).toEqual([first, second]);
  });
});
