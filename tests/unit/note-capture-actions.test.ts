import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow, ReaderSelectionContext } from '../../src/core/contracts';
import {
  NoteCaptureActions,
  appendReaderSelectionToNote,
  readerSelectionNoteFragment,
} from '../../src/main/note-capture-actions';
import type { MainNavigation } from '../../src/main/navigation';
import type { FuzzyPicker } from '../../src/main/picker';
import type { MainWindowSession } from '../../src/main/session';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function context(overrides: Partial<ReaderSelectionContext> = {}): ReaderSelectionContext {
  return {
    text: 'A < B & C',
    itemID: 11,
    pageLabel: '7 & 8',
    position: '{"pageIndex":6}',
    ...overrides,
  };
}

function note(id: number, libraryID = 1, html = '<p>Existing</p>'): Zotero.Item {
  let current = html;
  return {
    id,
    libraryID,
    deleted: false,
    isNote: () => true,
    getNote: () => current,
    setNote: vi.fn((value: string) => {
      current = value;
      return true;
    }),
    saveTx: vi.fn(async () => id),
  } as unknown as Zotero.Item;
}

describe('Reader selection note fragment', () => {
  it('escapes selected text and page labels without synthesizing citation markup', () => {
    expect(readerSelectionNoteFragment(context())).toBe(
      '<blockquote><p>A &lt; B &amp; C</p></blockquote>\n<p>Page 7 &amp; 8</p>',
    );
  });

  it('omits the page line when no page label is available', () => {
    expect(readerSelectionNoteFragment(context({ pageLabel: null }))).toBe(
      '<blockquote><p>A &lt; B &amp; C</p></blockquote>',
    );
  });
});

describe('native note append', () => {
  it('preserves existing note HTML and appends one capture fragment', async () => {
    const target = note(20);

    await appendReaderSelectionToNote(target, context(), 1);

    expect(target.setNote).toHaveBeenCalledWith(
      '<p>Existing</p>\n<blockquote><p>A &lt; B &amp; C</p></blockquote>\n<p>Page 7 &amp; 8</p>',
    );
    expect(target.saveTx).toHaveBeenCalledOnce();
  });

  it('refuses deleted or wrong-library note targets before mutation', async () => {
    const wrong = note(20, 2);
    await expect(appendReaderSelectionToNote(wrong, context(), 1)).rejects.toThrow(
      'Note target is unavailable',
    );
    expect(wrong.setNote).not.toHaveBeenCalled();

    const deleted = note(21, 1);
    Object.assign(deleted, { deleted: true });
    await expect(appendReaderSelectionToNote(deleted, context(), 1)).rejects.toThrow(
      'Note target is unavailable',
    );
    expect(deleted.setNote).not.toHaveBeenCalled();
  });
});

describe('NoteCaptureActions', () => {
  it('keeps an immutable Reader selection snapshot while the picker is open', async () => {
    const attachment = {
      id: 11,
      libraryID: 1,
      parentItemID: 10,
      isAttachment: () => true,
      isNote: () => false,
    } as unknown as Zotero.Item;
    const parent = {
      id: 10,
      libraryID: 1,
      isAttachment: () => false,
      isNote: () => false,
      getNotes: () => [20],
    } as unknown as Zotero.Item;
    const target = note(20);
    const byID = new Map<number, Zotero.Item>([
      [attachment.id, attachment],
      [parent.id, parent],
      [target.id, target],
    ]);
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number) => byID.get(id) ?? false,
        keepTopLevel: (items: Zotero.Item[]) =>
          items.map((item) => (item.id === attachment.id ? parent : item)),
      },
      Libraries: { userLibraryID: 1 },
    });

    let confirm: ((candidate: { id: number }) => Promise<void>) | undefined;
    const picker = {
      open: vi.fn(async (_window, _session, scope, options) => {
        expect(scope).toBe('notes');
        expect(options.closeBeforeConfirm).toBe(true);
        confirm = options.confirm;
      }),
    } as unknown as FuzzyPicker;
    const status = vi.fn();
    const actions = new NoteCaptureActions(
      { debug: vi.fn() } as never,
      { status } as unknown as MainNavigation,
      picker,
    );
    const window = { document: {} } as unknown as MainWindow;
    const session = {} as MainWindowSession;
    const original = context();

    actions.open(window, session, original);
    await Promise.resolve();
    (original as { text: string }).text = 'CHANGED AFTER OPEN';

    expect(confirm).toBeDefined();
    await confirm!({ id: target.id });

    expect(target.setNote).toHaveBeenCalledWith(
      expect.stringContaining('A &lt; B &amp; C'),
    );
    expect(target.setNote).not.toHaveBeenCalledWith(
      expect.stringContaining('CHANGED AFTER OPEN'),
    );
    expect(status).toHaveBeenLastCalledWith(session, '✓ Appended selection to note');
  });

  it('revalidates the note library at confirmation time', async () => {
    const attachment = {
      id: 11,
      libraryID: 1,
      isAttachment: () => true,
      isNote: () => false,
    } as unknown as Zotero.Item;
    const wrong = note(30, 2);
    const byID = new Map<number, Zotero.Item>([
      [attachment.id, attachment],
      [wrong.id, wrong],
    ]);
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number) => byID.get(id) ?? false,
        keepTopLevel: (items: Zotero.Item[]) => items,
      },
      Libraries: { userLibraryID: 1 },
    });

    let confirm: ((candidate: { id: number }) => Promise<void>) | undefined;
    const picker = {
      open: vi.fn(async (_window, _session, _scope, options) => {
        confirm = options.confirm;
      }),
    } as unknown as FuzzyPicker;
    const status = vi.fn();
    const session = {} as MainWindowSession;
    const actions = new NoteCaptureActions(
      { debug: vi.fn() } as never,
      { status } as unknown as MainNavigation,
      picker,
    );

    actions.open({ document: {} } as unknown as MainWindow, session, context());
    await Promise.resolve();
    await confirm!({ id: wrong.id });

    expect(wrong.setNote).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(session, '✗ Note target is unavailable');
  });
});
