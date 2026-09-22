import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCollectionCandidateProvider } from '../../src/main/picker/providers/collections';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

describe('collection candidate provider', () => {
  it('loads recursive collections only from the requested library and exposes paths', async () => {
    const getByLibrary = vi.fn(() => [
      { id: 1, name: 'Inbox', parentID: false, libraryID: 7 },
      { id: 2, name: 'Robotics', parentID: 1, libraryID: 7 },
      { id: 3, name: 'Other library', parentID: false, libraryID: 9 },
    ]);
    vi.stubGlobal('Zotero', { Collections: { getByLibrary } });

    const provider = createCollectionCandidateProvider(7);
    const items = await provider.load();

    expect(getByLibrary).toHaveBeenCalledWith(7, true);
    expect(items).toEqual([
      expect.objectContaining({ id: 1, title: 'Inbox', search: 'Inbox' }),
      expect.objectContaining({
        id: 2,
        title: 'Robotics',
        search: 'Inbox / Robotics',
        meta: 'Inbox / Robotics',
      }),
    ]);
    expect(provider.rowText(items[1]!, 1)).toContain('Inbox / Robotics');
  });
});
