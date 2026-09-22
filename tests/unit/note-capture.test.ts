import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSelectionContext } from '../../src/core/contracts';
import {
  appendReaderSelectionToNote,
  readerCaptureBaseItem,
  readerSelectionNoteFragment,
} from '../../src/main/note-capture';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function context(overrides: Partial<ReaderSelectionContext> = {}): ReaderSelectionContext {
  return {
    text: 'Selected <text>',
    itemID: 2,
    pageLabel: '12',
    position: null,
    ...overrides,
  };
}

function note(id: number, libraryID = 1, html = '<p>Existing</p>'): Zotero.Item {
  let body = html;
  return {
    id,
    libraryID,
    deleted: false,
    isNote: () => true,
    getNote: () => body,
    setNote: vi.fn((value: string) => {
      body = value;
    }),
    saveTx: vi.fn(async () => id),
  } as unknown as Zotero.Item;
}

describe('Reader note capture', () => {
  it('normalizes the Reader attachment to its bibliographic base item', () => {
    const parent = { id: 1, libraryID: 7 } as Zotero.Item;
    const attachment = { id: 2, libraryID: 7 } as Zotero.Item;
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number) => (id === 2 ? attachment : false),
        keepTopLevel: vi.fn(() => [parent]),
      },
    });

    expect(readerCaptureBaseItem(context())).toBe(parent);
  });

  it('uses Zotero text2html and includes the page label in the captured fragment', () => {
    const text2html = vi.fn(
      (value: string) =>
        `<p>${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`,
    );
    vi.stubGlobal('Zotero', { Utilities: { text2html } });

    const fragment = readerSelectionNoteFragment(context());

    expect(text2html).toHaveBeenCalledWith('Selected <text>\n\nPage 12');
    expect(fragment).toBe('<blockquote><p>Selected &lt;text&gt;\n\nPage 12</p></blockquote>');
  });

  it('appends to existing note HTML and saves once', async () => {
    const text2html = (value: string) => `<p>${value}</p>`;
    vi.stubGlobal('Zotero', { Utilities: { text2html } });
    const target = note(10, 7);

    await appendReaderSelectionToNote(target, context({ pageLabel: null }), 7);

    expect(target.setNote).toHaveBeenCalledWith(
      '<p>Existing</p><blockquote><p>Selected <text></p></blockquote>',
    );
    expect(target.saveTx).toHaveBeenCalledTimes(1);
  });

  it('refuses deleted, non-note, and cross-library targets without saving', async () => {
    vi.stubGlobal('Zotero', { Utilities: { text2html: (value: string) => value } });
    const deleted = note(10, 7);
    Reflect.set(deleted, 'deleted', true);
    const crossLibrary = note(11, 8);
    const notNote = note(12, 7);
    Reflect.set(notNote, 'isNote', () => false);

    await expect(appendReaderSelectionToNote(deleted, context(), 7)).rejects.toThrow(
      'Note target is unavailable',
    );
    await expect(appendReaderSelectionToNote(notNote, context(), 7)).rejects.toThrow(
      'Note target is unavailable',
    );
    await expect(appendReaderSelectionToNote(crossLibrary, context(), 7)).rejects.toThrow(
      'another library',
    );

    expect(deleted.saveTx).not.toHaveBeenCalled();
    expect(notNote.saveTx).not.toHaveBeenCalled();
    expect(crossLibrary.saveTx).not.toHaveBeenCalled();
  });
});
