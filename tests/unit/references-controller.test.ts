import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentFixture, type DialogElement } from '../fixtures/dialog-dom';
import type {
  ReaderReferenceDocument,
  ReaderReferenceSnapshot,
} from '../../src/toolkit/reader/reference-contracts';
import type {
  ReaderReferenceInteractionCallbacks,
  ReaderReferenceInteractionContext,
} from '../../src/toolkit/reader/reference-interaction-contracts';
import type { ReferenceReaderPort } from '../../src/references/reader-port';
import type { ReferenceCommand, ReferenceViewModel } from '../../src/references/react-model';

const host = vi.hoisted(() => ({
  read: vi.fn(),
  lookup: vi.fn(),
  clearCache: vi.fn(),
  dispose: vi.fn(),
  find: vi.fn(),
  add: vi.fn(),
  open: vi.fn(),
  observe: vi.fn(),
  launch: vi.fn(),
  view: null as null | {
    model: ReferenceViewModel;
    dispatch: (command: ReferenceCommand) => void;
    disposed: boolean;
  },
}));
vi.mock('../../src/toolkit/reader', () => ({
  readReaderReferenceDocument: host.read,
  readerMainWindow: () => ({}),
  observeReaderReferenceInteractions: host.observe,
}));
vi.mock('../../src/toolkit/main', () => ({
  launchMainURL: host.launch,
  mainItemOpening: () => ({ viewAttachment: host.open }),
}));
vi.mock('../../src/references/metadata', () => ({
  createReferenceMetadataService: () => ({
    lookup: host.lookup,
    clearCache: host.clearCache,
    dispose: host.dispose,
  }),
}));
vi.mock('../../src/operations/references', () => ({
  findReferenceItems: host.find,
  addReferencePaper: host.add,
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    model: ReferenceViewModel;
    dispatch: (command: ReferenceCommand) => void;
  }) => {
    const view = { model: options.model, dispatch: options.dispatch, disposed: false };
    host.view = view;
    return {
      ready: Promise.resolve(),
      update: (model: ReferenceViewModel) => {
        view.model = model;
      },
      getElement: () => null,
      dispose: () => {
        view.disposed = true;
      },
    };
  },
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
      text: 'First reference',
      doi: null,
      arxivID: null,
      location: { pageIndex: 8, rects: [[0, 0, 10, 10]] },
    },
    {
      id: 'b',
      label: '[2]',
      text: 'Second reference',
      doi: '10.1/example',
      arxivID: '2401.12345v2',
      location: { pageIndex: 8, rects: [[0, 20, 10, 30]] },
    },
    {
      id: 'c',
      label: '[5]',
      text: 'Uncited fifth reference',
      doi: null,
      arxivID: null,
      location: { pageIndex: 8, rects: [[0, 40, 10, 50]] },
    },
  ],
  occurrences: [
    {
      id: 'o',
      referenceIDs: ['b'],
      text: '[2]',
      context: 'Context from page two',
      location: { pageIndex: 1, rects: [[0, 0, 1, 1]] },
    },
  ],
};
const source = (): ReaderReferenceSnapshot => ({
  document: snapshot,
  isCurrent: () => true,
  validate: async () => true,
});
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};
const paper = {
  source: 'arxiv' as const,
  sourceID: '2401.12345v2',
  title: 'Original title',
  authors: ['Author'],
  year: 2024,
  venue: 'Journal',
  abstract: 'Original abstract text',
  doi: '10.1/example',
  arxivID: '2401.12345v2',
  url: 'https://example.com',
  pdfURL: null,
  referenceCount: null,
  citationCount: 3,
  retrievedAt: 'today',
};
const WindowURL = URL;
const windowFixture = (document = new DocumentFixture()): Window =>
  ({
    document,
    innerWidth: 800,
    innerHeight: 600,
    URL: WindowURL,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as Window;

function setup() {
  const document = new DocumentFixture();
  const window = windowFixture(document);
  let current = true;
  const jump = vi.fn(() => true);
  const restoreFocus = vi.fn();
  const captureView = vi.fn(() => ({ window, isCurrent: () => current, jump, restoreFocus }));
  const port: ReferenceReaderPort = {
    reader: { itemID: 7 },
    pluginID: 'test',
    captureView,
    language: () => 'en',
    themeRoot: () => () => {},
    showStatus: vi.fn(),
  };
  const controller = new ReferenceController(port);
  const callbacks = host.observe.mock.calls.at(-1)![2] as ReaderReferenceInteractionCallbacks;
  const button = (label: string): DialogElement =>
    document.nodes.find(
      (node) => node.isConnected && node.tagName === 'button' && node.textContent === label,
    )!;
  const context = (index = 1): ReaderReferenceInteractionContext => ({
    window: window as ReaderReferenceInteractionContext['window'],
    uiWindow: window,
    position: null,
    references: [snapshot.entries[index]!],
    anchorRect: () => [1, 2, 3, 4],
    isCurrent: () => current,
    isSourceCurrent: () => current,
    dismissPreview: vi.fn(),
  });
  const send = (
    command: Omit<ReferenceCommand, 'generation'> & { id?: string; value?: string },
  ): void => {
    const view = host.view!;
    view.dispatch({ ...command, generation: view.model.generation } as ReferenceCommand);
  };
  const openEntry = async (): Promise<void> => {
    controller.open();
    await flush();
    send({ type: 'select', id: 'b' });
  };
  return {
    document,
    window,
    controller,
    callbacks,
    send,
    button,
    context,
    captureView,
    jump,
    restoreFocus,
    openEntry,
    retire: () => {
      current = false;
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  host.view = null;
  vi.stubGlobal('Zotero', { Items: { get: () => ({ libraryID: 4 }) } });
  host.observe.mockReturnValue(() => {});
  host.read.mockResolvedValue(source());
  host.find.mockResolvedValue([]);
  host.launch.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('contextual references', () => {
  it('resolves a passive citation only after activation and jumps to its mention', async () => {
    const ui = setup();
    const mount = ui.document.createElementNS('', 'div');
    ui.document.documentElement.append(mount);
    const context = ui.context();
    const cleanup = ui.callbacks.onCitationPopup({
      context,
      mount: mount as unknown as HTMLElement,
    });
    expect(ui.captureView).not.toHaveBeenCalled();
    expect(host.read).not.toHaveBeenCalled();
    expect(host.lookup).not.toHaveBeenCalled();
    const control = ui.button('In-text mentions');
    control.listeners.get('click')![0]!({ target: control, stopPropagation: vi.fn() });
    await flush();
    expect(ui.captureView).toHaveBeenCalledWith(ui.window);
    expect(context.dismissPreview).toHaveBeenCalledOnce();
    expect(host.view!.model.scene).toBe('mentions');
    expect(host.view!.model.description).toBe(snapshot.entries[1]!.text);
    ui.send({ type: 'occurrence', id: '0' });
    await flush();
    expect(ui.jump).toHaveBeenCalledWith(snapshot.occurrences[0]!.location);
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    if (typeof cleanup === 'function') cleanup();
    ui.controller.dispose();
  });
  it('keeps the catalog discovery-only and makes uncited entries reachable', async () => {
    const ui = setup();
    ui.controller.open();
    await flush();
    expect(host.view!.model.rows.map((row) => row.id)).toContain('c');
    expect(host.lookup).not.toHaveBeenCalled();
    ui.send({ type: 'select', id: 'c' });
    expect(host.view!.model.scene).toBe('target');
    expect(host.view!.model.description).toBe(snapshot.entries[2]!.text);
    ui.controller.dispose();
  });
  it('resolves menu positions and permits discovery for unknown targets', async () => {
    const ui = setup();
    const append = vi.fn();
    ui.callbacks.onContextMenu({
      context: {
        ...ui.context(),
        references: [],
        position: { pageIndex: 4, rects: [[100, 100, 101, 101]] as const },
      },
      append,
    });
    expect(host.read).not.toHaveBeenCalled();
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    expect(host.view!.model.hasTarget).toBe(false);
    ui.send({ type: 'catalog' });
    expect(host.view!.model.rows.map((row) => row.id)).toContain('c');
    ui.callbacks.onContextMenu({
      context: { ...ui.context(), references: [], position: snapshot.entries[1]!.location },
      append,
    });
    append.mock.calls[1]![0][0].onCommand();
    await flush();
    expect(host.view!.model.description).toBe(snapshot.entries[1]!.text);
    ui.send({ type: 'occurrence', id: '0' });
    await flush();
    expect(ui.jump).toHaveBeenCalledWith(snapshot.occurrences[0]!.location);
    ui.controller.dispose();
  });
  it('preserves cached data across failed refresh and clears it only on request', async () => {
    host.lookup
      .mockResolvedValueOnce({ kind: 'found', paper, cache: { origin: 'cached', stale: true } })
      .mockResolvedValueOnce({
        kind: 'found',
        paper,
        cache: { origin: 'cached', stale: true, warning: 'offline' },
      });
    host.clearCache.mockResolvedValue(undefined);
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    expect(host.lookup.mock.calls[0]![2]).toBe('cache-only');
    expect(host.view!.model.paper).toEqual(paper);
    expect(host.view!.model.provenance).toContain('Cached');
    ui.send({ type: 'metadata-refresh' });
    await flush();
    expect(host.lookup.mock.calls.at(-1)?.[2]).toBe('refresh');
    expect(host.view!.model.status).toContain('offline');
    expect(host.view!.model.paper).toEqual(paper);
    ui.send({ type: 'metadata-clear' });
    await flush();
    expect(host.clearCache).toHaveBeenCalledOnce();
    expect(host.view!.model.paper).toBeNull();
    ui.controller.dispose();
  });
  it('retains the raw paper if refresh fails without a cache fallback', async () => {
    host.lookup
      .mockResolvedValueOnce({ kind: 'found', paper, cache: { origin: 'network', stale: false } })
      .mockRejectedValueOnce(new Error('offline after eviction'));
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    ui.send({ type: 'metadata-refresh' });
    expect(host.view!.model.paper).toEqual(paper);
    await flush();
    expect(host.view!.model.paper).toEqual(paper);
    expect(host.view!.model.status).toContain('offline after eviction');
    ui.controller.dispose();
  });
  it.each(['candidates', 'not-found'] as const)(
    'removes the prior paper and import authority after a successful refresh returns %s',
    async (kind) => {
      const replacement = { ...paper, sourceID: 'replacement', title: 'Replacement title' };
      host.lookup
        .mockResolvedValueOnce({ kind: 'candidates', papers: [paper] })
        .mockResolvedValueOnce(kind === 'candidates' ? { kind, papers: [replacement] } : { kind });
      const ui = setup();
      await ui.openEntry();
      ui.send({ type: 'metadata' });
      await flush();
      ui.send({ type: 'candidate', id: '0' });
      await flush();
      expect(host.view!.model.paper).toEqual(paper);
      ui.send({ type: 'metadata-refresh' });
      expect(host.view!.model.paper).toEqual(paper);
      await flush();
      expect(host.view!.model.paper).toBeNull();
      ui.send({ type: 'add' });
      await flush();
      expect(host.add).not.toHaveBeenCalled();
      if (kind === 'candidates') {
        expect(host.view!.model.rows[0]?.label).toContain('Replacement title');
        ui.send({ type: 'candidate', id: '0' });
        await flush();
        expect(host.view!.model.paper).toEqual(replacement);
      } else expect(host.view!.model.rows).toEqual([]);
      ui.controller.dispose();
    },
  );
  it('requires manual metadata candidate adoption and explicit import', async () => {
    host.lookup.mockResolvedValue({ kind: 'candidates', papers: [paper] });
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    expect(host.lookup).toHaveBeenCalledWith(
      { text: 'Second reference', doi: '10.1/example', arxivID: '2401.12345v2' },
      expect.anything(),
      'cache-only',
    );
    expect(host.view!.model.paper).toBeNull();
    expect(host.add).not.toHaveBeenCalled();
    ui.send({ type: 'candidate', id: '0' });
    await flush();
    expect(host.view!.model.paper).toEqual(paper);
    host.add.mockResolvedValue({ title: 'Original title' });
    ui.send({ type: 'add' });
    await flush();
    expect(host.add).toHaveBeenCalledWith(paper, 4, expect.any(Function));
    ui.controller.dispose();
  });
  it('does not publish source data after close', async () => {
    const pending = Promise.withResolvers<ReaderReferenceSnapshot>();
    host.read.mockReturnValue(pending.promise);
    const ui = setup();
    ui.controller.open();
    const view = host.view!;
    ui.controller.close();
    pending.resolve(source());
    await flush();
    expect(view.disposed).toBe(true);
    expect(ui.document.documentElement.children).toHaveLength(0);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it.each([
    { typed: 'Edited title', submitted: { text: 'Edited title' } },
    {
      typed: 'https://doi.org/10.1234/ABC',
      submitted: { text: 'https://doi.org/10.1234/ABC', doi: '10.1234/abc' },
    },
    {
      typed: 'arxiv:2401.12345v2',
      submitted: { text: 'arxiv:2401.12345v2', arxivID: '2401.12345v2' },
    },
  ])('captures $typed before async source admission', async ({ typed, submitted }) => {
    const admission = Promise.withResolvers<boolean>();
    let delayed = false;
    host.read.mockResolvedValue({
      ...source(),
      validate: () => (delayed ? admission.promise : Promise.resolve(true)),
    });
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    host.lookup.mockClear();
    ui.send({ type: 'query', value: typed });
    delayed = true;
    ui.send({ type: 'metadata-search' });
    admission.resolve(true);
    await flush();
    expect(host.lookup).toHaveBeenCalledWith(submitted, expect.anything(), undefined);
    ui.controller.dispose();
  });
  it('aborts a pending lookup on query change and ignores its late result', async () => {
    const pending = Promise.withResolvers<unknown>();
    host.lookup.mockReturnValue(pending.promise);
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    const signal = host.lookup.mock.calls[0]![1] as AbortSignal;
    ui.send({ type: 'query', value: 'Different title' });
    expect(signal.aborted).toBe(true);
    pending.resolve({ kind: 'found', paper });
    await flush();
    expect(host.view!.model.paper).toBeNull();
    ui.controller.dispose();
  });
  it('does not publish a lookup after the captured source is retired', async () => {
    const pending = Promise.withResolvers<unknown>();
    host.lookup.mockReturnValue(pending.promise);
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    ui.retire();
    pending.resolve({ kind: 'found', paper });
    await flush();
    expect(host.view!.model.paper).toBeNull();
    expect(host.view!.disposed).toBe(true);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it('owns focus in the UI document and respects IME Escape', async () => {
    const ui = setup();
    const uiDocument = new DocumentFixture();
    const context = { ...ui.context(), uiWindow: windowFixture(uiDocument) };
    const append = vi.fn();
    ui.callbacks.onContextMenu({ context, append });
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    const root = uiDocument.find('section');
    expect(ui.controller.isInputFocused(ui.window)).toBe(true);
    expect(ui.controller.ownsTarget(uiDocument.activeElement as unknown as EventTarget)).toBe(true);
    root.emit('compositionstart');
    root.emit('keydown', { key: 'Escape' });
    expect(root.isConnected).toBe(true);
    root.emit('compositionend');
    root.emit('keydown', { key: 'Escape' });
    expect(root.isConnected).toBe(false);
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    ui.controller.dispose();
  });
  it('dismisses on source pointer without restoring focus or trapping Tab', async () => {
    const ui = setup();
    const uiDocument = new DocumentFixture();
    const append = vi.fn();
    ui.callbacks.onContextMenu({
      context: { ...ui.context(), uiWindow: windowFixture(uiDocument) },
      append,
    });
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    const root = uiDocument.find('section');
    expect(root.emit('keydown', { key: 'Tab' }).defaultPrevented).toBe(false);
    ui.document.emit('pointerdown', { target: ui.document.documentElement });
    expect(root.isConnected).toBe(false);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it('opens only the explicitly chosen local attachment', async () => {
    const ui = setup();
    await ui.openEntry();
    host.find.mockResolvedValue([{ itemID: 22, attachmentID: 23, title: 'Possible match' }]);
    ui.send({ type: 'local' });
    await flush();
    expect(host.open).not.toHaveBeenCalled();
    ui.send({ type: 'match', id: '0' });
    await flush();
    expect(host.open).toHaveBeenCalledWith(23);
    ui.controller.dispose();
  });
});

describe('contextual reference lifetime boundaries', () => {
  it('owns focused native footer controls for their exact pane without hover work', () => {
    const ui = setup();
    const document = new DocumentFixture();
    const mount = document.createElementNS('', 'span');
    document.documentElement.append(mount);
    const context = { ...ui.context(), uiWindow: windowFixture(document) };
    const cleanup = ui.callbacks.onCitationPopup({
      context,
      mount: mount as unknown as HTMLElement,
    });
    const control = document.nodes.find((node) => node.tagName === 'button')!;
    expect(host.read).not.toHaveBeenCalled();
    expect(host.lookup).not.toHaveBeenCalled();
    expect(document.activeElement).toBeNull();
    control.focus();
    expect(ui.controller.ownsTarget(control as unknown as EventTarget)).toBe(true);
    expect(ui.controller.isInputFocused(ui.window)).toBe(true);
    expect(ui.controller.isInputFocused({} as Window)).toBe(false);
    const enter = control.parent!.emit('keydown', { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(false);
    expect(enter.propagationStopped).toBe(true);
    control.parent!.emit('keydown', { key: 'Escape' });
    expect(context.dismissPreview).toHaveBeenCalledOnce();
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    ui.captureView.mockClear();
    if (typeof cleanup === 'function') cleanup();
    control.emit('click');
    expect(ui.captureView).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('opens discovery in the toolbar document and keeps an edge anchor on screen', async () => {
    const ui = setup();
    const document = new DocumentFixture();
    const owner = Object.assign(windowFixture(document), { innerWidth: 480, innerHeight: 400 });
    const mount = document.createElementNS('', 'span');
    document.documentElement.append(mount);
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({
      left: 450,
      top: 370,
      right: 470,
      bottom: 390,
      width: 20,
      height: 20,
    });
    let toolbarCurrent = true;
    const cleanup = ui.callbacks.onToolbar({
      uiWindow: owner,
      mount: mount as unknown as HTMLElement,
      isCurrent: () => toolbarCurrent,
    });
    const toolbarButton = document.nodes.find((node) => node.tagName === 'button')!;
    toolbarButton.focus();
    expect(ui.controller.ownsTarget(toolbarButton as unknown as EventTarget)).toBe(true);
    toolbarButton.emit('click');
    await flush();
    const root = document.find('section');
    expect(ui.document.nodes.some((node) => node.isConnected && node.tagName === 'section')).toBe(
      false,
    );
    expect(parseFloat(root.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(root.style.left) + root.getBoundingClientRect().width).toBeLessThanOrEqual(
      owner.innerWidth,
    );
    expect(parseFloat(root.style.top)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(root.style.top) + root.getBoundingClientRect().height).toBeLessThanOrEqual(
      owner.innerHeight,
    );
    expect(host.view!.model.rows.map((row) => row.id)).toContain('c');
    expect(host.lookup).not.toHaveBeenCalled();
    ui.controller.close();
    toolbarCurrent = false;
    expect(ui.controller.ownsTarget(toolbarButton as unknown as EventTarget)).toBe(false);
    toolbarButton.emit('click');
    expect(document.nodes.some((node) => node.isConnected && node.tagName === 'section')).toBe(
      false,
    );
    ui.controller.dispose();
    if (typeof cleanup === 'function') cleanup();
    toolbarCurrent = true;
    expect(ui.controller.ownsTarget(toolbarButton as unknown as EventTarget)).toBe(false);
  });

  it('opens identifier websites without a metadata request or Bootstrap URL constructor', async () => {
    const ui = setup();
    vi.stubGlobal('URL', undefined);
    await ui.openEntry();
    ui.send({ type: 'doi' });
    await flush();
    expect(host.launch).toHaveBeenCalledWith('https://doi.org/10.1/example');
    expect(host.lookup).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('does not launch a website after its source retires during byte admission', async () => {
    const admission = Promise.withResolvers<boolean>();
    let delayed = false;
    host.read.mockResolvedValue({
      ...source(),
      validate: () => (delayed ? admission.promise : Promise.resolve(true)),
    });
    const ui = setup();
    await ui.openEntry();
    delayed = true;
    ui.send({ type: 'arxiv' });
    ui.retire();
    admission.resolve(true);
    await flush();
    expect(host.launch).not.toHaveBeenCalled();
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('lets a manual offline title search replace pending local candidates without opening either automatically', async () => {
    const pending =
      Promise.withResolvers<Array<{ itemID: number; attachmentID: number; title: string }>>();
    host.find
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue([{ itemID: 30, attachmentID: 31, title: 'Manual title match' }]);
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'local' });
    await flush();
    ui.send({ type: 'query', value: 'A manual title' });
    ui.send({ type: 'local-search' });
    await flush();
    pending.resolve([{ itemID: 20, attachmentID: 21, title: 'Old candidate' }]);
    await flush();
    expect(host.view!.model.rows.map((row) => row.id)).toEqual(['0']);
    expect(host.open).not.toHaveBeenCalled();
    expect(host.lookup).not.toHaveBeenCalled();
    ui.send({ type: 'match', id: '0' });
    await flush();
    expect(host.open).toHaveBeenCalledWith(31);
    ui.controller.dispose();
  });

  it('rejects commands retained from an earlier candidate list', async () => {
    host.lookup.mockResolvedValue({
      kind: 'candidates',
      papers: [paper, { ...paper, sourceID: 'other', title: 'Other title' }],
    });
    const ui = setup();
    await ui.openEntry();
    ui.send({ type: 'metadata' });
    await flush();
    const view = host.view!;
    const stale: ReferenceCommand = {
      type: 'candidate',
      id: '1',
      generation: view.model.generation,
    };
    ui.send({ type: 'candidate', id: '0' });
    await flush();
    expect(view.model.paper).toEqual(paper);
    view.dispatch(stale);
    await flush();
    expect(view.model.paper).toEqual(paper);
    ui.controller.dispose();
  });
});

it('keeps the invocation anchor when activating its pane dismisses the native preview', async () => {
  const ui = setup();
  let previewLive = true;
  const context: ReaderReferenceInteractionContext = {
    ...ui.context(),
    isCurrent: () => previewLive,
    isSourceCurrent: () => true,
    anchorRect: () => (previewLive ? [120, 100, 180, 120] : null),
  };
  ui.captureView.mockImplementation(() => {
    previewLive = false;
    return {
      window: ui.window,
      isCurrent: () => true,
      jump: ui.jump,
      restoreFocus: ui.restoreFocus,
    };
  });
  const mount = ui.document.createElementNS('', 'span');
  ui.document.documentElement.append(mount);
  const cleanup = ui.callbacks.onCitationPopup({ context, mount: mount as unknown as HTMLElement });
  ui.button('In-text mentions').emit('click');
  await flush();
  const root = ui.document.find('section');
  expect(root.style.left).toBe('120px');
  expect(parseFloat(root.style.top)).toBeGreaterThanOrEqual(120);
  if (typeof cleanup === 'function') cleanup();
  ui.controller.dispose();
});
