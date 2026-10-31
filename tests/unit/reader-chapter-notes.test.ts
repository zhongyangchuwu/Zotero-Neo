import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import { createReaderNotesModule, type ReaderNotesHost } from '../../src/modules/notes/reader';
import type { SourceNoteEntry } from '../../src/core/source-note';
import { DocumentFixture } from '../fixtures/dialog-dom';

const io = vi.hoisted(() => ({ read: vi.fn(), entries: vi.fn(), save: vi.fn(), owner: vi.fn() }));
vi.mock('../../src/reader/document-cache', () => ({ readReaderDocument: io.read }));
vi.mock('../../src/toolkit/main', () => ({ sourceNoteEntries: io.entries }));
vi.mock('../../src/toolkit/reader', () => ({ readerWindow: io.owner }));
vi.mock('../../src/platform/document-analysis-cache', () => ({
  observeAttachmentDocumentCache: () => () => {},
}));
vi.mock('../../src/operations/source-note', () => ({ createSourceNote: io.save }));
vi.mock('../../src/platform/note-relations', () => ({
  sourceNoteIdentity: (value: string) => value,
  SOURCE_NOTE_IDENTITY_PREFIX: 'urn:zotero-neo:chapter-note:v1:',
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const doc = new DocumentFixture(),
    owner = { document: doc, AbortController };
  io.owner.mockReturnValue(owner);
  const sourceCurrent = vi.fn(async () => true);
  io.read.mockResolvedValue({
    parsed: { sourceFingerprint: 'pdf', regions: [] },
    isCurrent: sourceCurrent,
  });
  const entry: SourceNoteEntry = {
    id: 'a',
    kind: 'annotation',
    quote: 'Original quote',
    comment: 'Comment',
    locations: [{ pageIndex: 0, rects: [[0, 0, 10, 10]] }],
    html: '<p>Original quote</p>',
    images: [],
    schemaVersion: 9,
  };
  io.entries.mockResolvedValue([entry]);
  io.save.mockResolvedValue({ itemID: 10, key: 'NOTE', reused: false });
  const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true),
    navigate = vi.fn(),
    showStatus = vi.fn();
  let current = true;
  const window = { document: { activeElement: null }, focus: vi.fn() } as unknown as Parameters<
    ReturnType<typeof createReaderNotesModule>['open']
  >[0];
  const ports: ReaderNotesHost = {
    reader: { itemID: 7 },
    preferences: {} as ReaderNotesHost['preferences'],
    target: () => ({
      attachment: { itemID: 7, libraryID: 1, key: 'PDF', title: 'Paper' },
      parent: null,
    }),
    captureView: () => () => current,
    text: (key) => key,
    themeRoot: () => () => {},
    navigate,
    showStatus,
    debug: vi.fn(),
  };
  const module = createReaderNotesModule(host, ports);
  const loaded = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  const save = () =>
    doc.nodes
      .find((node) => node.isConnected && node.tagName === 'button' && node.textContent === 'save')!
      .emit('click');
  const key = (key: string) =>
    module.handleKey({
      key,
      target: doc.activeElement,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as KeyboardEvent);
  return {
    module,
    window,
    doc,
    entry,
    loaded,
    save,
    key,
    navigate,
    showStatus,
    sourceCurrent,
    retire: () => {
      current = false;
    },
    host,
  };
}
describe('Reader chapter notes review', () => {
  it('cancels without writing and contains a late source read', async () => {
    const f = fixture(),
      pending = Promise.withResolvers<unknown>();
    io.read.mockReturnValue(pending.promise);
    f.module.open(f.window);
    f.key('Escape');
    pending.resolve({ parsed: { regions: [] } });
    await f.loaded();
    expect(io.save).not.toHaveBeenCalled();
    expect(io.entries).not.toHaveBeenCalled();
    expect(f.doc.find('section')).toBeUndefined();
    f.host.dispose();
  });
  it('uses Enter only for source navigation and saves only after the explicit action', async () => {
    const f = fixture();
    f.module.open(f.window);
    await f.loaded();
    f.key('Enter');
    await f.loaded();
    expect(f.navigate).toHaveBeenCalledWith(f.window, f.entry.locations[0]);
    expect(io.save).not.toHaveBeenCalled();
    f.module.open(f.window);
    await f.loaded();
    f.save();
    await f.loaded();
    expect(io.save).toHaveBeenCalledOnce();
    expect(io.save.mock.calls[0]?.[0].attachment.itemID).toBe(7);
    expect(io.save.mock.calls[0]?.[1].html).toContain('Original quote');
    expect(f.showStatus).toHaveBeenCalledWith('saved');
    f.host.dispose();
  });
  it('refuses stale note content or a changed PDF before writing', async () => {
    const f = fixture();
    f.module.open(f.window);
    await f.loaded();
    io.entries.mockResolvedValue([{ ...f.entry, comment: 'new comment' }]);
    f.save();
    await f.loaded();
    expect(io.save).not.toHaveBeenCalled();
    f.module.close();
    f.module.open(f.window);
    await f.loaded();
    f.sourceCurrent.mockResolvedValue(false);
    f.save();
    await f.loaded();
    expect(io.save).not.toHaveBeenCalled();
    f.host.dispose();
  });
  it('lets an admitted save finish after retirement without stale focus or status', async () => {
    const f = fixture(),
      pending = Promise.withResolvers<object>();
    io.save.mockReturnValue(pending.promise);
    f.module.open(f.window);
    await f.loaded();
    f.save();
    await f.loaded();
    expect(io.save).toHaveBeenCalledOnce();
    f.retire();
    f.module.releaseView(f.window);
    pending.resolve({ reused: false });
    await f.loaded();
    expect(f.showStatus).not.toHaveBeenCalled();
    expect(f.doc.find('section')).toBeUndefined();
    f.host.dispose();
  });
});
