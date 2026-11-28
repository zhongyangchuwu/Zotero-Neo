import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderCaptionTargets } from '../../src/modules/reader-navigation/caption-targets';
import type { DocumentRegion } from '../../src/document-analysis/contracts';

const originalZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function caption(title: string, pageRects: readonly (readonly number[])[]) {
  return { type: 'caption', content: [{ text: title }], anchor: { pageRects } };
}

function region(id: string, kind: DocumentRegion['kind'], text: string): DocumentRegion {
  return {
    id,
    kind,
    text,
    pageIndex: 0,
    rect: kind === 'caption' ? [50, 390, 500, 400] : [50, 420, 500, 600],
    flow: 'auxiliary',
    format: 'text',
    anchorPrecision: 'region',
    sourceObject: { id: 'figure-1', kind: 'figure' },
  };
}

function harness(blocks: readonly unknown[]) {
  const getReader = vi.fn(async () => ({
    getTopLevelBlockCount: () => blocks.length,
    getBlocks: async () => blocks,
  }));
  Reflect.set(globalThis, 'Zotero', { SDT: { getReader } });
  const onChange = vi.fn();
  const debug = vi.fn();
  const figures = vi.fn<() => Promise<readonly DocumentRegion[]>>().mockResolvedValue([]);
  const isCurrent = vi.fn(() => true);
  const targets = new ReaderCaptionTargets(2, onChange, debug, () => true, { figures, isCurrent });
  return { targets, getReader, onChange, debug, figures, isCurrent };
}

describe('Reader caption targets', () => {
  it('shares in-flight caption loads and uses only label-backed groups from the local session', async () => {
    const test = harness([]);
    const pending = Promise.withResolvers<readonly DocumentRegion[]>();
    test.figures.mockReturnValue(pending.promise);
    expect(test.targets.entries).toEqual([]);
    expect(test.figures).not.toHaveBeenCalled();
    const loading = test.targets.load();
    expect(test.targets.load()).toBe(loading);
    expect(test.targets.state).toBe('loading');
    const body = region('plot', 'image', '');
    const title = region('label', 'caption', 'Figure 1: Overview');
    const uncaptioned = {
      ...region('unknown-plot', 'image', ''),
      sourceObject: { id: 'unlabelled', kind: 'figure' as const },
    };
    pending.resolve([body, title, uncaptioned]);
    const entries = await loading;
    expect(entries).toEqual([
      {
        kind: 'figure',
        label: '1',
        title: 'Figure 1: Overview',
        association: 'backend',
        location: { position: { pageIndex: 0, rects: [body.rect, title.rect] } },
      },
    ]);
    expect(test.targets.state).toBe('ready');
    expect(await test.targets.load()).toBe(entries);
    expect(test.figures).toHaveBeenCalledOnce();
    expect(test.getReader).not.toHaveBeenCalled();
  });

  it('corrects a previous-page bookmark to its unique genuine next-page heading', async () => {
    // Zotero 10.0.6 OpenVLA: the authored 3.2 bookmark is page 4's bottom,
    // but the actual heading is at page 5's top (zero-based indexes 3 and 4).
    const test = harness([
      {
        type: 'heading',
        content: [{ text: '3.2OpenVLA Training Procedure' }],
        anchor: { pageRects: [[4, 108, 707.95, 250.53, 716.91]] },
      },
      caption('Figure 2: Model', [[3, 108, 527.25, 504, 565.26]]),
    ]);
    const entry = {
      title: 'OpenVLA Training Procedure',
      location: { position: { pageIndex: 3, rects: [[0, 70.401, 0, 70.401]] } },
    };
    expect(test.targets.headingPosition(entry)).toBeNull();
    await test.targets.loadHeadings();
    expect(test.targets.headingPosition(entry)).toEqual({
      pageIndex: 4,
      rects: [[108, 707.95, 250.53, 716.91]],
    });
    expect(entry.location.position.pageIndex).toBe(3);
    expect(test.figures).not.toHaveBeenCalled();
    test.targets.dispose();
    expect(test.targets.headingPosition(entry)).toBeNull();
  });

  it('matches appendix ordinals and normalized text without adding absent authored headings', async () => {
    const test = harness([
      {
        type: 'heading',
        content: [{ text: 'B.3.1Franka-Tabletop and ' }, { text: 'Franka-DROID Tasks' }],
        anchor: { pageRects: [[28, 108, 707.95, 317.05, 716.91]] },
      },
      {
        type: 'heading',
        content: [{ text: 'Acknowledgments' }],
        anchor: { pageRects: [[28, 108, 200, 300, 210]] },
      },
    ]);
    await test.targets.loadHeadings();
    expect(
      test.targets.headingPosition({
        title: ' FRANKA-Tabletop\u00a0and Franka-DROID Tasks ',
        location: { position: { pageIndex: 28, rects: [[0, 725, 0, 725]] } },
      }),
    ).toEqual({ pageIndex: 28, rects: [[108, 707.95, 317.05, 716.91]] });
    expect(
      test.targets.headingPosition({
        title: 'Missing Section',
        location: { position: { pageIndex: 28, rects: [[0, 100, 0, 100]] } },
      }),
    ).toBeNull();
    expect(test.targets.entries).toEqual([]);
  });

  it('retains authored geometry for ambiguous, distant, invalid or non-heading matches', async () => {
    const block = (title: string, pageIndex: number) => ({
      type: 'heading',
      content: [{ text: title }],
      anchor: { pageRects: [[pageIndex, 108, 700, 300, 710]] },
    });
    const test = harness([
      block('1Repeated', 3),
      block('2Repeated', 4),
      block('3Distant', 5),
      block('4Before', 2),
      { ...block('5Body text', 4), type: 'paragraph' },
      { ...block('6Invalid', 4), anchor: { pageRects: [[4, 300, 700, 108, 710]] } },
      block('Unrelated Title', 4),
    ]);
    await test.targets.loadHeadings();
    for (const title of ['Repeated', 'Distant', 'Before', 'Body text', 'Invalid', 'Title']) {
      expect(
        test.targets.headingPosition({
          title,
          location: { position: { pageIndex: 3, rects: [[0, 70, 0, 70]] } },
        }),
      ).toBeNull();
    }
  });

  it('does not expose a late result after the loaded PDF source retires', async () => {
    const test = harness([]);
    const pending = Promise.withResolvers<readonly DocumentRegion[]>();
    test.figures.mockReturnValue(pending.promise);
    const loading = test.targets.load();
    await Promise.resolve();
    test.isCurrent.mockReturnValue(false);
    pending.resolve([region('late', 'caption', 'Figure 1: Stale')]);
    expect(await loading).toEqual([]);
    expect(test.targets.entries).toEqual([]);
    expect(test.targets.state).toBe('unavailable');
    expect(test.getReader).not.toHaveBeenCalled();
  });
});
