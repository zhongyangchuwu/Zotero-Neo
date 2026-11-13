// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReaderObjectExcerpts,
  type ReaderObjectExcerptHost,
} from '../../src/modules/reader-excerpts/object-excerpts';
import type { SourceNoteReceipt } from '../../src/core/source-note';
import type {
  SearchDialogReactCommand,
  SearchDialogReactModel,
} from '../../src/ui/search-dialog-react-model';
import { mountSearchDialogReactView } from '../../src/ui/react/surfaces/search-dialog';

const io = vi.hoisted(() => ({
  read: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  owner: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('../../src/reader/document-cache', () => ({ readReaderDocument: io.read }));
vi.mock('../../src/toolkit/reader', () => ({
  readerWindow: io.owner,
  readerRegionPreview: io.preview,
}));
vi.mock('../../src/toolkit/main', () => ({
  sourceNoteImageMarkup: (_itemID: number, _location: unknown, image: string) =>
    `<img src="${image}">`,
  sourcePDFLink: (itemID: number, pageIndex: number) =>
    `zotero://open-pdf/library/items/${itemID}?page=${pageIndex + 1}`,
}));
vi.mock('../../src/operations/source-note', () => ({ createSourceNote: io.save }));
vi.mock('../../src/platform/note-relations', () => ({
  sourceNoteIdentity: (value: string) => value,
}));
vi.mock('../../src/platform/clipboard', () => ({ copyRichClipboard: io.copy }));
vi.mock('../../src/platform/native-ui', () => {
  return {
    mountNativeReactView(options: {
      root: HTMLElement;
      model: SearchDialogReactModel;
      dispatch: (command: SearchDialogReactCommand) => void;
    }) {
      return {
        ...mountSearchDialogReactView(options.root, options.model, options.dispatch),
        ready: Promise.resolve(),
      };
    },
  };
});

const controllers: ReaderObjectExcerpts[] = [];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  // jsdom has no layout/scrolling host; list selection still needs the browser capability
  // before SearchDialog can continue into its actual preview pipeline.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.close();
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});
const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup() {
  io.owner.mockReturnValue(window);
  const snapshot = {
    parsed: {
      sourceFingerprint: 'pdf-v1',
      regions: [
        {
          id: 'equation',
          kind: 'formula',
          rect: [0, 0, 30, 30],
          pageIndex: 0,
          text: 'x + y',
          format: 'latex',
          flow: 'auxiliary',
          anchorPrecision: 'region',
        },
      ],
    },
    isCurrent: vi.fn(async () => true),
  };
  io.read.mockResolvedValue(snapshot);
  io.preview.mockResolvedValue({ dataURL: 'data:image/png;base64,a' });
  const receipt: SourceNoteReceipt = { itemID: 10, key: 'NOTE', reused: false };
  io.save.mockResolvedValue(receipt);
  const openNote = vi.fn(async () => true);
  const pdfWindow = { document: { activeElement: null }, focus: vi.fn() } as unknown as Parameters<
    ReaderObjectExcerpts['open']
  >[0];
  const retired = new Set<unknown>();
  const host: ReaderObjectExcerptHost = {
    reader: { itemID: 7 },
    preferences: {} as ReaderObjectExcerptHost['preferences'],
    target: () => ({
      attachment: { itemID: 7, libraryID: 1, key: 'PDF', title: 'Paper' },
      parent: null,
    }),
    captureView: (source) => {
      const document = source.document;
      return () => !retired.has(source) && source.document === document;
    },
    isCurrent: () => true,
    openNote,
    text: (key) => key,
    themeRoot: () => () => {},
    showStatus: vi.fn(),
    debug: vi.fn(),
  };
  const excerpts = new ReaderObjectExcerpts(host);
  controllers.push(excerpts);
  const button = (label: string): HTMLButtonElement =>
    (Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (node) => node.textContent === label,
    )!;
  return {
    excerpts,
    pdfWindow,
    button,
    openNote,
    receipt,
    snapshot,
    retire: () => retired.add(pdfWindow),
  };
}

describe('Reader object excerpt save receipts', () => {
  it('keeps previews passive and saving in place, then opens only the explicitly saved note', async () => {
    const ui = setup();
    ui.excerpts.open(ui.pdfWindow);
    await vi.waitFor(() => {
      const preview = document.querySelector('.neo-search-preview');
      expect(preview?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,a');
      expect(preview?.textContent).toContain('x + y');
    });
    expect(io.preview).toHaveBeenCalled();
    expect(io.save).not.toHaveBeenCalled();
    expect(ui.openNote).not.toHaveBeenCalled();
    expect(ui.button('openNote').disabled).toBe(true);
    ui.button('save').click();
    await flush();
    expect(document.documentElement.textContent).toContain('created:');
    expect(ui.button('save')).toBeDefined();
    expect(ui.button('openNote').disabled).toBe(false);
    expect(ui.openNote).not.toHaveBeenCalled();
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
    ui.button('openNote').click();
    await flush();
    expect(ui.openNote).toHaveBeenCalledWith(ui.receipt, ui.pdfWindow);
    expect(ui.button('save')).toBeUndefined();
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it('uses the same content identity across repeated saves and reopening, reporting reuse', async () => {
    const ui = setup();
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    const first = io.save.mock.calls[0]![1];
    expect(first.identity).toBeTruthy();
    expect(first.html).toContain('neo-image:0');
    expect(first.html).toContain('zotero://open-pdf/');
    io.save.mockResolvedValue({ ...ui.receipt, reused: true });
    ui.button('save').click();
    await flush();
    expect(document.documentElement.textContent).toContain('reused:');
    ui.excerpts.close();
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    expect(io.save.mock.calls.map((call) => call[1].identity)).toEqual([
      first.identity,
      first.identity,
      first.identity,
    ]);
    expect(ui.openNote).not.toHaveBeenCalled();
  });

  it('reports a save failure without claiming success or enabling note opening', async () => {
    const ui = setup();
    io.save.mockRejectedValue(new Error('read-only'));
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    expect(document.documentElement.textContent).toContain('saveFailed');
    expect(ui.button('openNote').disabled).toBe(true);
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it('reports a disappeared note without closing the source or stealing focus', async () => {
    const ui = setup();
    ui.openNote.mockResolvedValue(false);
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    ui.button('openNote').click();
    await flush();
    expect(document.documentElement.textContent).toContain('noteUnavailable');
    expect(ui.button('save')).toBeDefined();
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it('does not let a late explicit open close a newer excerpt dialog', async () => {
    const ui = setup();
    const pending = Promise.withResolvers<boolean>();
    ui.openNote.mockReturnValue(pending.promise);
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    ui.button('openNote').click();
    const newer = {
      document: { activeElement: null },
      focus: vi.fn(),
    } as unknown as typeof ui.pdfWindow;
    ui.excerpts.open(newer);
    await flush();
    pending.resolve(true);
    await flush();
    expect(ui.button('save')).toBeDefined();
    expect(newer.focus).not.toHaveBeenCalled();
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it('keeps an admitted save receipt from affecting a replaced view', async () => {
    const ui = setup();
    const pending = Promise.withResolvers<SourceNoteReceipt>();
    io.save.mockReturnValue(pending.promise);
    ui.excerpts.open(ui.pdfWindow);
    await flush();
    ui.button('save').click();
    await flush();
    ui.retire();
    ui.excerpts.close();
    pending.resolve(ui.receipt);
    await flush();
    expect(ui.button('openNote')).toBeUndefined();
    expect(ui.openNote).not.toHaveBeenCalled();
    expect(ui.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'restores focus on cancellation only while the captured source remains valid (retired=%s)',
    async (retired) => {
      const ui = setup();
      ui.excerpts.open(ui.pdfWindow);
      await flush();
      if (retired) ui.retire();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(ui.button('save')).toBeUndefined();
      expect(ui.pdfWindow.focus).toHaveBeenCalledTimes(retired ? 0 : 1);
      expect(io.save).not.toHaveBeenCalled();
      expect(ui.openNote).not.toHaveBeenCalled();
    },
  );
});
