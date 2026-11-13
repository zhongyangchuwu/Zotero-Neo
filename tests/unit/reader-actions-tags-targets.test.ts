import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerActionsTagsItemIDs } from '../../src/toolkit/reader';
import type { ReaderRuntime } from '../../src/toolkit/reader';

function reader(keys?: readonly string[]): ReaderRuntime {
  return {
    itemID: 42,
    _item: { id: 42, libraryID: 7 },
    _internalReader: {
      _lastView: keys === undefined ? undefined : { _selectedAnnotationIDs: keys },
      _state: { selectedAnnotationIDs: ['OTHER-VIEW'] },
    },
  } as ReaderRuntime;
}

afterEach(() => vi.unstubAllGlobals());

describe('Actions & Tags Reader targets', () => {
  it('resolves each last-view selection in the attachment library, preserving order', () => {
    const getByLibraryAndKey = vi.fn((libraryID: number, key: string) => {
      if (libraryID !== 7) return false;
      const matches: Record<string, { id: number }> = { FIRST: { id: 11 }, SECOND: { id: 12 } };
      return matches[key] ?? false;
    });
    vi.stubGlobal('Zotero', { Items: { getByLibraryAndKey } });

    expect(readerActionsTagsItemIDs(reader(['SECOND', 'FIRST', 'SECOND']))).toEqual([12, 11, 12]);
    expect(getByLibraryAndKey.mock.calls).toEqual([
      [7, 'SECOND'],
      [7, 'FIRST'],
      [7, 'SECOND'],
    ]);
  });

  it('ignores stale and invalid keys without falling back to the PDF', () => {
    vi.stubGlobal('Zotero', {
      Items: {
        getByLibraryAndKey: (_libraryID: number, key: string) => {
          if (key === 'BAD') throw new Error('invalid key');
          return key === 'LIVE' ? { id: 19 } : false;
        },
      },
    });

    expect(readerActionsTagsItemIDs(reader(['MISSING', 'BAD', 'LIVE']))).toEqual([19]);
    expect(readerActionsTagsItemIDs(reader(['MISSING', 'BAD']))).toEqual([]);
  });

  it('returns the exact Reader attachment when the last view has no selection', () => {
    vi.stubGlobal('Zotero', { Items: { getByLibraryAndKey: vi.fn() } });
    expect(readerActionsTagsItemIDs(reader([]))).toEqual([42]);
    expect(readerActionsTagsItemIDs(reader())).toEqual([42]);
    expect(Zotero.Items.getByLibraryAndKey).not.toHaveBeenCalled();
  });

  it('handles missing reader, item service, and attachment safely', () => {
    vi.stubGlobal('Zotero', undefined);
    expect(readerActionsTagsItemIDs(undefined as unknown as ReaderRuntime)).toEqual([]);
    expect(readerActionsTagsItemIDs(reader(['FIRST']))).toEqual([]);
    expect(readerActionsTagsItemIDs({ itemID: 42 })).toEqual([]);
    expect(readerActionsTagsItemIDs(reader([]))).toEqual([42]);
  });

  it('uses the exact attachment item to recover the library when necessary', () => {
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number) => (id === 42 ? { id, libraryID: 7 } : false),
        getByLibraryAndKey: (libraryID: number, key: string) =>
          libraryID === 7 && key === 'FIRST' ? { id: 11 } : false,
      },
    });
    const handle = {
      itemID: 42,
      _internalReader: { _lastView: { _selectedAnnotationIDs: ['FIRST'] } },
    } as ReaderRuntime;
    expect(readerActionsTagsItemIDs(handle)).toEqual([11]);
  });
});
