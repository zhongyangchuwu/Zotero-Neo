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
  const openEntry = async (): Promise<void> => {
    controller.open();
    await flush();
    button('[2] Second reference').emit('click');
  };
  return {
    document,
    window,
    controller,
    callbacks,
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
  vi.stubGlobal('Zotero', { Items: { get: () => ({ libraryID: 4 }) } });
  host.observe.mockReturnValue(() => {});
  host.read.mockResolvedValue(source());
  host.find.mockResolvedValue([]);
  host.launch.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('contextual references', () => {
  it('mounts a passive native row control and resolves that row only after activation', async () => {
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
    expect(ui.document.activeElement).toBeNull();
    const control = ui.button('In-text mentions');
    control.listeners.get('click')![0]!({ target: control, stopPropagation: vi.fn() });
    await flush();
    expect(ui.captureView).toHaveBeenCalledWith(ui.window);
    expect(context.dismissPreview).toHaveBeenCalledOnce();
    expect(ui.document.documentElement.textContent).toContain('Second reference');
    expect(ui.document.documentElement.textContent).not.toContain('First reference');
    ui.button('Page 2: Context from page two').emit('click');
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
    expect(ui.button('[5] Uncited fifth reference')).toBeDefined();
    expect(ui.document.documentElement.textContent).not.toContain('Scholarly metadata');
    expect(host.lookup).not.toHaveBeenCalled();
    ui.button('[5] Uncited fifth reference').emit('click');
    expect(ui.button('Recognized local mentions')).toBeDefined();
    expect(ui.document.documentElement.textContent).not.toContain('[1] First reference');
    ui.controller.dispose();
  });
  it('resolves menu position only on command and offers search for an unknown target', async () => {
    const ui = setup();
    const context = {
      ...ui.context(),
      references: [],
      position: { pageIndex: 4, rects: [[100, 100, 101, 101]] as const },
    };
    const append = vi.fn();
    ui.callbacks.onContextMenu({ context, append });
    expect(host.read).not.toHaveBeenCalled();
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    expect(ui.document.documentElement.textContent).toContain('No reference identified');
    ui.button('Search bibliography').emit('click');
    expect(ui.button('[5] Uncited fifth reference')).toBeDefined();
    ui.controller.dispose();
  });
  it('resolves a bibliography position to its own reverse mentions', async () => {
    const ui = setup();
    const context = { ...ui.context(), references: [], position: snapshot.entries[1]!.location };
    const append = vi.fn();
    ui.callbacks.onContextMenu({ context, append });
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Second reference');
    ui.button('Page 2: Context from page two').emit('click');
    await flush();
    expect(ui.jump).toHaveBeenCalledWith(snapshot.occurrences[0]!.location);
    ui.controller.dispose();
  });
  it('shows cached provenance, refresh failure and a cache-only clear action', async () => {
    host.lookup.mockResolvedValueOnce({
      kind: 'found',
      paper,
      cache: { origin: 'cached', stale: true },
    });
    host.lookup.mockResolvedValueOnce({
      kind: 'found',
      paper,
      cache: { origin: 'cached', stale: true, warning: 'offline' },
    });
    host.clearCache.mockResolvedValue(undefined);
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Cached · Stale');
    expect(ui.document.documentElement.textContent).toContain('Original abstract text');
    ui.button('Refresh metadata').emit('click');
    await flush();
    expect(host.lookup.mock.calls.at(-1)?.[2]).toBe('refresh');
    expect(ui.document.documentElement.textContent).toContain('offline');
    expect(ui.document.documentElement.textContent).toContain('Original abstract text');
    ui.button('Clear metadata cache').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Metadata cache cleared.');
    expect(ui.document.documentElement.textContent).not.toContain('Original abstract text');
    ui.controller.dispose();
  });
  it('retains the displayed paper when refresh has no cache fallback and fails', async () => {
    host.lookup.mockResolvedValueOnce({
      kind: 'found',
      paper,
      cache: { origin: 'network', stale: false },
    });
    host.lookup.mockRejectedValueOnce(new Error('offline after eviction'));
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    ui.button('Refresh metadata').emit('click');
    expect(ui.document.documentElement.textContent).toContain('Original abstract text');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Original abstract text');
    expect(ui.document.documentElement.textContent).toContain(paper.retrievedAt);
    expect(ui.document.documentElement.textContent).toContain('offline after eviction');
    expect(ui.button('Add to Zotero')).toBeDefined();
    ui.controller.dispose();
  });
  it('keeps broad metadata candidates manual and preserves source fields on adoption and import', async () => {
    host.lookup.mockResolvedValue({ kind: 'candidates', papers: [paper] });
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    expect(host.lookup).toHaveBeenCalledOnce();
    expect(host.lookup).toHaveBeenCalledWith(
      { text: 'Second reference', doi: '10.1/example', arxivID: '2401.12345v2' },
      expect.anything(),
      'cache-only',
    );
    expect(ui.document.documentElement.textContent).not.toContain('Original abstract text');
    ui.button('Original title — Author 2024').emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).toContain('Original abstract text');
    expect(ui.document.documentElement.textContent).toContain('Journal');
    expect(ui.document.documentElement.textContent).toContain('2401.12345v2');
    host.add.mockResolvedValue({ title: 'Original title' });
    ui.button('Add to Zotero').emit('click');
    await flush();
    expect(host.add).toHaveBeenCalledWith(paper, 4, expect.any(Function));
    ui.controller.dispose();
  });
  it('does not publish stale results after close or source replacement', async () => {
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
    let admit!: (valid: boolean) => void;
    let delayed = false;
    host.read.mockResolvedValue({
      ...source(),
      validate: () =>
        delayed
          ? new Promise<boolean>((resolve) => {
              admit = resolve;
            })
          : Promise.resolve(true),
    });
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    host.lookup.mockClear();
    const input = ui.document.nodes.find((node) => node.isConnected && node.tagName === 'input')!;
    input.value = typed;
    input.emit('input');
    delayed = true;
    ui.button('Search metadata').emit('click');
    input.value = 'Later title';
    admit(true);
    await flush();
    expect(host.lookup).toHaveBeenCalledWith(submitted, expect.anything(), undefined);
    ui.controller.dispose();
  });
  it('cancels an in-flight lookup when its query changes', async () => {
    let resolve!: (value: unknown) => void;
    host.lookup.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    const signal = host.lookup.mock.calls[0]![1] as AbortSignal;
    const input = ui.document.nodes.find((node) => node.isConnected && node.tagName === 'input')!;
    input.value = 'Different title';
    input.emit('input');
    expect(signal.aborted).toBe(true);
    resolve({ kind: 'found', paper });
    await flush();
    expect(ui.document.documentElement.textContent).not.toContain('Original abstract text');
    ui.controller.dispose();
  });
  it('does not publish a lookup after its captured source is retired', async () => {
    let resolve!: (value: unknown) => void;
    host.lookup.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    ui.retire();
    resolve({ kind: 'found', paper });
    await flush();
    expect(ui.document.documentElement.textContent).not.toContain('Original abstract text');
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it('owns focus in the Reader UI document for the captured pane and respects IME Escape', async () => {
    const ui = setup();
    const uiDocument = new DocumentFixture();
    const uiWindow = windowFixture(uiDocument);
    const context = { ...ui.context(), uiWindow };
    const append = vi.fn();
    ui.callbacks.onContextMenu({ context, append });
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    const root = uiDocument.nodes.find((node) => node.isConnected && node.tagName === 'section')!;
    expect(ui.controller.isInputFocused(ui.window)).toBe(true);
    expect(ui.controller.ownsTarget(uiDocument.activeElement as unknown as EventTarget)).toBe(true);
    const key = root.listeners.get('keydown')![0]!;
    root.emit('compositionstart');
    key({ key: 'Escape', stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(root.isConnected).toBe(true);
    root.emit('compositionend');
    key({ key: 'Escape', stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(root.isConnected).toBe(false);
    expect(ui.restoreFocus).toHaveBeenCalledOnce();
    ui.controller.dispose();
  });
  it('dismisses on a pointer in the captured PDF without restoring focus or trapping Tab', async () => {
    const ui = setup();
    const uiDocument = new DocumentFixture();
    const context = { ...ui.context(), uiWindow: windowFixture(uiDocument) };
    const append = vi.fn();
    ui.callbacks.onContextMenu({ context, append });
    append.mock.calls[0]![0][0].onCommand();
    await flush();
    const root = uiDocument.nodes.find((node) => node.isConnected && node.tagName === 'section')!;
    const tab = root.emit('keydown', { key: 'Tab' });
    expect(tab.defaultPrevented).toBe(false);
    ui.document.emit('pointerdown', { target: ui.document.documentElement });
    expect(root.isConnected).toBe(false);
    expect(ui.restoreFocus).not.toHaveBeenCalled();
    ui.controller.dispose();
  });
  it('treats local matches as candidates and opens only the chosen attachment', async () => {
    const ui = setup();
    await ui.openEntry();
    host.find.mockResolvedValue([{ itemID: 22, attachmentID: 23, title: 'Possible match' }]);
    ui.button('Find local matches').emit('click');
    await flush();
    expect(host.open).not.toHaveBeenCalled();
    ui.button('Possible match (PDF)').emit('click');
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
    expect(root.textContent).toContain('Uncited fifth reference');
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
    ui.button('Open DOI').emit('click');
    await flush();
    expect(host.launch).toHaveBeenCalledWith('https://doi.org/10.1/example');
    expect(host.lookup).not.toHaveBeenCalled();
    ui.controller.dispose();
  });

  it('does not launch a website after its source retires during byte admission', async () => {
    let admit!: (valid: boolean) => void;
    let delayed = false;
    host.read.mockResolvedValue({
      ...source(),
      validate: () =>
        delayed
          ? new Promise<boolean>((resolve) => {
              admit = resolve;
            })
          : Promise.resolve(true),
    });
    const ui = setup();
    await ui.openEntry();
    delayed = true;
    ui.button('Open arXiv').emit('click');
    ui.retire();
    admit(true);
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
    ui.button('Find local matches').emit('click');
    await flush();
    const input = ui.document.find('input');
    input.value = 'A manual title';
    input.emit('input');
    ui.button('Find in library').emit('click');
    await flush();
    pending.resolve([{ itemID: 20, attachmentID: 21, title: 'Old candidate' }]);
    await flush();
    expect(ui.document.documentElement.textContent).not.toContain('Old candidate');
    expect(host.open).not.toHaveBeenCalled();
    expect(host.lookup).not.toHaveBeenCalled();
    ui.button('Manual title match (PDF)').emit('click');
    await flush();
    expect(host.open).toHaveBeenCalledWith(31);
    ui.controller.dispose();
  });

  it('restores a selected metadata candidate to connected details and rejects detached candidate clicks', async () => {
    host.lookup.mockResolvedValue({
      kind: 'candidates',
      papers: [paper, { ...paper, sourceID: 'other', title: 'Other title' }],
    });
    const ui = setup();
    await ui.openEntry();
    ui.button('Paper details').emit('click');
    await flush();
    const chosen = ui.button('Original title — Author 2024');
    const stale = ui.button('Other title — Author 2024');
    chosen.focus();
    chosen.emit('click');
    await flush();
    expect(chosen.isConnected).toBe(false);
    expect(ui.document.activeElement?.isConnected).toBe(true);
    expect(ui.document.activeElement?.textContent).toContain('Original abstract text');
    stale.emit('click');
    await flush();
    expect(ui.document.documentElement.textContent).not.toContain('Other title');
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
