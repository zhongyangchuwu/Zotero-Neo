import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { createNotesProvider } from '../../src/main/picker/providers/notes';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function note(
  id: number,
  title: string,
  libraryID = 7,
  dateModified = '2026-09-20T00:00:00Z',
): Zotero.Item {
  return {
    id,
    libraryID,
    deleted: false,
    dateModified,
    isNote: () => true,
    getDisplayTitle: () => title,
    getNoteTitle: () => title,
    getNote: () => `<p>${title} body</p>`,
  } as unknown as Zotero.Item;
}

describe('notes provider explicit context', () => {
  it('uses the Reader base library and ranks current-item notes first', async () => {
    const current = note(11, 'Current note', 7, '2026-09-01T00:00:00Z');
    const recent = note(12, 'Recent note', 7, '2026-09-21T00:00:00Z');
    const byID = new Map([
      [11, current],
      [12, recent],
    ]);
    const conditions: unknown[][] = [];

    class Search {
      addCondition(...args: unknown[]) {
        conditions.push(args);
      }
      async search() {
        return [11, 12];
      }
    }

    vi.stubGlobal('Zotero', {
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
      Items: {
        get: (value: number | number[]) =>
          Array.isArray(value)
            ? value.map((id) => byID.get(id)).filter(Boolean)
            : (byID.get(value) ?? false),
      },
      Libraries: { userLibraryID: 1 },
    });

    const base = {
      id: 5,
      libraryID: 7,
      isAttachment: () => false,
      isNote: () => false,
      getNotes: () => [11],
      getDisplayTitle: () => 'Reader paper',
    } as unknown as Zotero.Item;
    const element = {
      textContent: '',
      set innerHTML(value: string) {
        this.textContent = value.replace(/<[^>]*>/g, '');
      },
    };
    const window = {
      document: {
        createElementNS: () => ({ ...element }),
      },
    } as unknown as MainWindow;

    const provider = createNotesProvider(window, { debug: vi.fn() } as never, {
      baseItem: base,
      libraryID: 7,
    });
    const items = await provider.load();

    expect(conditions).toContainEqual(['libraryID', 'is', 7]);
    expect(items.map((item) => item.id)).toEqual([11, 12]);
    expect(items[0]).toMatchObject({
      title: 'Current note',
      section: 'current',
    });
    expect(items[1]).toMatchObject({
      title: 'Recent note',
      section: 'all',
    });
  });
});
