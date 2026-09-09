import { afterEach, describe, expect, it } from 'vitest';

import { fuzzyPickerRowText, isFuzzyPickerItem } from '../../src/main/picker';
import { citationKey } from '../../src/platform/better-bibtex';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

describe('fuzzy picker bibliographic items', () => {
  it('keeps regular parent items and excludes notes, attachments, and annotations', () => {
    const item = (regular: boolean): Zotero.Item =>
      ({ isRegularItem: () => regular }) as Zotero.Item;

    expect(isFuzzyPickerItem(item(true))).toBe(true);
    expect(isFuzzyPickerItem(item(false))).toBe(false);
  });

  it('shows the title directly when an item genuinely has no citation key', () => {
    expect(
      fuzzyPickerRowText(
        { id: 1, title: 'A searchable paper', search: 'a searchable paper' },
        0,
        'collection',
      ),
    ).toBe('A searchable paper');
  });
});

describe('citation-key lookup', () => {
  it('prefers the native citationKey field populated by current Better BibTeX', () => {
    const item = {
      id: 1,
      getField: (field: string) => (field === 'citationKey' ? 'Smith2026' : ''),
    } as Zotero.Item;

    expect(citationKey(item)).toBe('Smith2026');
  });

  it('falls back to the Better BibTeX cache for read-only items', () => {
    Reflect.set(globalThis, 'Zotero', {
      BetterBibTeX: {
        KeyManager: {
          get: (itemID: number) =>
            itemID === 2 ? { itemID, citationKey: 'Cached2026' } : undefined,
        },
      },
    });
    const item = { id: 2, getField: () => '' } as unknown as Zotero.Item;

    expect(citationKey(item)).toBe('Cached2026');
  });
});
