import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentFixture, type DialogElement } from '../fixtures/dialog-dom';
import type {
  ReaderReferenceDocument,
  ReaderReferenceSnapshot,
} from '../../src/toolkit/reader/reference-contracts';
import type { ReferenceReaderPort } from '../../src/references/reader-port';

const host = vi.hoisted(() => ({
  read: vi.fn(),
  lookup: vi.fn(),
  hasKey: vi.fn(),
  setKey: vi.fn(),
  dispose: vi.fn(),
  find: vi.fn(),
  add: vi.fn(),
  open: vi.fn(),
}));
vi.mock('../../src/toolkit/reader', () => ({
  readReaderReferenceDocument: host.read,
  readerMainWindow: () => ({}),
}));
vi.mock('../../src/toolkit/main', () => ({
  launchMainURL: vi.fn(),
  mainItemOpening: () => ({ viewAttachment: host.open }),
}));
vi.mock('../../src/references/metadata', () => ({
  createReferenceMetadataService: () => ({
    lookup: host.lookup,
    hasSemanticScholarKey: host.hasKey,
    setSemanticScholarKey: host.setKey,
    dispose: host.dispose,
  }),
}));
vi.mock('../../src/operations/references', () => ({
  findReferenceItems: host.find,
  addReferencePaper: host.add,
}));
import { ReferenceController } from '../../src/references/controller';

const snapshot: ReaderReferenceDocument = {
  attachmentID: 7,
  sourceID: 'version-1',
  bibliographyCoverage: 'complete',
  entries: [
    {
      id: 'a',
      label: '[1]',
      text: 'Original reference',
      doi: null,
      arxivID: null,
      location: { pageIndex: 8, rects: [[0, 0, 1, 1]], nextPageRects: [[2, 3, 4, 5]] },
    },
  ],
  occurrences: [
    {
      id: 'o',
      referenceIDs: ['a'],
      text: '[1]',
      context: 'Context from page two',
      location: { pageIndex: 1, rects: [[0, 0, 1, 1]], nextPageRects: [[5, 6, 7, 8]] },
    },
  ],
};
const source = (document = snapshot): ReaderReferenceSnapshot => ({
  document,
  isCurrent: () => true,
  validate: async () => true,
});
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

function setup() {
  const document = new DocumentFixture();
  const listeners = new Map<string, EventListener>();
  const window = {
    document,
    addEventListener: (name: string, fn: EventListener) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  } as unknown as Window;
  let current = true;
  const jump = vi.fn(() => true);
  const restoreFocus = vi.fn();
  const port: ReferenceReaderPort = {
    reader: { itemID: 7 },
    captureView: () => ({ window, isCurrent: () => current, jump, restoreFocus }),
    language: () => 'en',
    themeRoot: () => () => {},
    showStatus: vi.fn(),
  };
  const controller = new ReferenceController(port);
  const button = (label: string): DialogElement =>
    document.nodes.find(
      (node) => node.isConnected && node.tagName === 'button' && node.textContent === label,
    )!;
  return {
    document,
    window,
    controller,
    button,
    jump,
    restoreFocus,
    retire: () => {
      current = false;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Zotero', { Items: { get: () => ({ libraryID: 4 }) } });
  host.read.mockResolvedValue(source());
  host.find.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('reference panel', () => {
  it('keeps local browsing offline and jumps the captured view to every recognized mention', async () => {
    const ui = setup();
    ui.controller.open();
    await flush();
    expect(host.lookup).not.toHaveBeenCalled();
    expect(host.hasKey).not.toHaveBeenCalled();
    ui.button('Page 2: Context from page two').emit('click');
    await flush();
    expect(ui.jump).toHaveBeenCalledWith(snapshot.occurrences[0]!.location);
    ui.button('Jump to bibliography').emit('click');
    await flush();
    expect(ui.jump).toHaveBeenCalledWith(snapshot.entries[0]!.location);
    ui.controller.dispose();
  });

  it('does not resurrect a closed panel after analysis completes', async () => {
    let resolve!: (value: ReaderReferenceSnapshot) => void;
    host.read.mockReturnValue(
      new Promise<ReaderReferenceSnapshot>((done) => {
        resolve = done;
      }),
    );
    const ui = setup();
    ui.controller.open();
    ui.controller.close();
    resolve(source());
    await flush();
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('requires an explicit candidate choice and ignores a response after view retirement', async () => {
    const nativeAbortController = AbortController;
    vi.stubGlobal('AbortController', undefined);
    vi.stubGlobal('Components', {
      utils: {
        importGlobalProperties: (properties: string[]) => {
          if (properties.includes('AbortController'))
            vi.stubGlobal('AbortController', nativeAbortController);
        },
      },
    });
    let resolve!: (value: unknown) => void;
    host.lookup.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('Query metadata').emit('click');
    await flush();
    expect(host.lookup).toHaveBeenCalledOnce();
    ui.retire();
    resolve({ kind: 'candidates', papers: [{ title: 'Candidate', authors: [], year: null }] });
    await flush();
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it('shows candidates without adopting one until the user chooses', async () => {
    const paper = {
      source: 'semantic-scholar',
      sourceID: 'id',
      title: 'Chosen paper',
      authors: ['Author'],
      year: 2020,
      venue: 'Original publication venue',
      abstract: 'Original source abstract',
      doi: '10.1234/record-identity',
      arxivID: '1706.03762v7',
      url: null,
      pdfURL: null,
      referenceCount: 3,
      citationCount: 5,
      retrievedAt: '2026-01-01',
    };
    host.lookup.mockResolvedValue({ kind: 'candidates', papers: [paper] });
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('Query metadata').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).not.toContain('Original source abstract');
    expect(ui.document.documentElement.textContent).not.toContain('Add to Zotero');
    ui.button('Chosen paper — Author 2020').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Original source abstract');
    expect(ui.document.documentElement.textContent).toContain(paper.venue);
    expect(ui.document.documentElement.textContent).toContain(paper.doi);
    expect(ui.document.documentElement.textContent).toContain(paper.arxivID);
    expect(ui.document.documentElement.textContent).toContain('Add to Zotero');
    expect(host.add).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('shows a rate limit without adding a record or retrying', async () => {
    host.lookup.mockRejectedValue(new Error('Reference service rate limited (429)'));
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('Query metadata').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('429');
    expect(host.lookup).toHaveBeenCalledOnce();
    expect(host.add).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('keeps partial coverage visible and does not claim an unrecognized mention is absent', async () => {
    host.read.mockResolvedValue(
      source({ ...snapshot, bibliographyCoverage: 'partial', occurrences: [] }),
    );
    host.lookup.mockRejectedValue(new Error('Reference service rate limited (429)'));
    const ui = setup();
    ui.controller.open();
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Bibliography is partial');
    expect(ui.document.documentElement.textContent).toContain(
      'does not establish that the reference is uncited',
    );
    ui.button('Query metadata').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Bibliography is partial');
    expect(ui.document.documentElement.textContent).toContain('429');
    ui.controller.dispose();
  });

  it('restores focus only for an explicit close of a current view', async () => {
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('Close').emit('click');
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    ui.controller.open();
    await flush();
    ui.retire();
    ui.button('Close').emit('click');
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    ui.controller.dispose();
  });

  it('retires pending work when another pane becomes active', async () => {
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.controller.activateView({} as Window);
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('retains connected dialog focus when bibliography and candidate selections change', async () => {
    host.lookup.mockResolvedValue({
      kind: 'candidates',
      papers: [
        {
          source: 'arxiv',
          sourceID: '1706.03762',
          title: 'Chosen original',
          authors: [],
          year: 2017,
          venue: null,
          abstract: 'Original abstract',
          doi: null,
          arxivID: '1706.03762',
          url: null,
          pdfURL: null,
          referenceCount: null,
          citationCount: null,
          retrievedAt: '2026-01-01',
        },
      ],
    });
    const ui = setup();
    ui.controller.open();
    await flush();
    const row = ui.button('[1] Original reference');
    row.focus();
    row.emit('click');
    await flush();
    expect(ui.document.activeElement).toBe(row);
    expect(row.isConnected).toBe(true);
    expect(ui.controller.isInputFocused(ui.window)).toBe(true);
    expect(ui.controller.isInputFocused({ document: ui.document } as unknown as Window)).toBe(
      false,
    );
    ui.button('Query metadata').emit('click');
    await flush();
    const candidate = ui.button('Chosen original —  2017');
    candidate.focus();
    candidate.emit('click');
    await flush();
    expect(ui.document.activeElement?.isConnected).toBe(true);
    expect(ui.controller.isInputFocused(ui.window)).toBe(true);
    expect(ui.document.documentElement.textContent).toContain('Original abstract');
    ui.controller.dispose();
  });

  it('honors rapid bibliography selections in invocation order during source validation', async () => {
    host.read.mockResolvedValue(
      source({
        ...snapshot,
        entries: [
          ...snapshot.entries,
          { ...snapshot.entries[0]!, id: 'b', label: '[2]', text: 'Second reference' },
        ],
      }),
    );
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('[1] Original reference').emit('click');
    const last = ui.button('[2] Second reference');
    last.focus();
    last.emit('click');
    await flush();
    expect(ui.document.find('h3').textContent).toBe('[2]');
    expect(ui.document.activeElement).toBe(last);
    expect(last.isConnected).toBe(true);
    ui.controller.dispose();
  });

  it('rejects old coordinates after the published PDF identity retires', async () => {
    let current = true;
    host.read.mockResolvedValue({ ...source(), isCurrent: () => current });
    const ui = setup();
    ui.controller.open();
    await flush();
    current = false;
    ui.button('Jump to bibliography').emit('click');
    await flush();
    expect(ui.jump).not.toHaveBeenCalled();
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('retires a published file revision before pending metadata can appear', async () => {
    let current = true;
    host.read.mockResolvedValue({ ...source(), validate: async () => current });
    let resolve!: (value: unknown) => void;
    host.lookup.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const ui = setup();
    ui.controller.open();
    await flush();
    ui.button('Query metadata').emit('click');
    await flush();
    current = false;
    resolve({
      kind: 'candidates',
      papers: [{ title: 'Old source result', authors: [], year: null }],
    });
    await flush();
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    expect(ui.jump).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it.each([
    ['Query metadata', 'lookup'],
    ['Find local matches', 'find'],
  ] as const)('does not submit edited text from a pending %s action', async (label, method) => {
    const validate = vi.fn(async () => true);
    host.read.mockResolvedValue({ ...source(), validate });
    host.lookup.mockResolvedValue({ kind: 'not-found' });
    const ui = setup();
    ui.controller.open();
    await flush();
    const pending = Promise.withResolvers<boolean>();
    validate.mockReturnValueOnce(pending.promise);
    ui.button(label).emit('click');
    await flush();
    const input = ui.document.nodes.find(
      (node) => node.attributes.get('aria-label') === 'Reference search query',
    )!;
    input.value = 'Edited but not submitted';
    input.emit('input');
    pending.resolve(true);
    await flush();
    expect(host[method]).not.toHaveBeenCalled();
    ui.button(label).emit('click');
    await flush();
    expect(host[method]).toHaveBeenCalledOnce();
    expect(host[method].mock.calls[0]?.[0]).toEqual({ text: 'Edited but not submitted' });
    ui.controller.dispose();
  });

  it('saves and forgets a key only on explicit actions', async () => {
    host.setKey.mockResolvedValue(undefined);
    const ui = setup();
    ui.controller.open();
    await flush();
    expect(host.hasKey).not.toHaveBeenCalled();
    expect(host.setKey).not.toHaveBeenCalled();
    const input = ui.document.nodes.find(
      (node) => node.attributes.get('aria-label') === 'Semantic Scholar API key',
    )!;
    input.value = 'example-key';
    ui.button('Save key').emit('click');
    await flush();
    expect(host.setKey).toHaveBeenCalledWith('example-key');
    expect(input.value).toBe('');
    ui.button('Forget key').emit('click');
    await flush();
    expect(host.setKey).toHaveBeenLastCalledWith(null);
    ui.controller.dispose();
  });

  it('leaves IME-owned Escape alone and closes only after composition ends', async () => {
    const ui = setup();
    ui.controller.open();
    await flush();
    const root = ui.document.nodes.find((node) => node.attributes.get('role') === 'dialog')!;
    const prevented = vi.fn();
    const stopped = vi.fn();
    root.emit('compositionstart');
    for (const listener of root.listeners.get('keydown') ?? [])
      listener({
        key: 'Escape',
        keyCode: 229,
        isComposing: false,
        preventDefault: prevented,
        stopPropagation: stopped,
      });
    expect(prevented).not.toHaveBeenCalled();
    expect(ui.document.documentElement.children).toHaveLength(1);
    root.emit('compositionend');
    for (const listener of root.listeners.get('keydown') ?? [])
      listener({
        key: 'Escape',
        keyCode: 27,
        isComposing: false,
        preventDefault: prevented,
        stopPropagation: stopped,
      });
    expect(prevented).toHaveBeenCalledOnce();
    expect(ui.document.documentElement.children).toHaveLength(0);
    ui.controller.dispose();
  });
});
