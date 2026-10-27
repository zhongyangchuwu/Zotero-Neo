import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCollectionCandidateProvider } from '../../src/modules/collections/providers/collections';

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
    const collections = getByLibrary();
    Reflect.set(Zotero.Collections, 'get', (id: number) =>
      collections.find((collection) => collection.id === id),
    );

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

  it('shows mixed direct coverage and removes only the union of actual memberships', async () => {
    const collections = [
      { id: 10, name: 'Parent', libraryID: 1, parentID: false },
      { id: 11, name: 'Child', libraryID: 1, parentID: 10 },
      { id: 12, name: 'Unassigned', libraryID: 1, parentID: false },
    ];
    vi.stubGlobal('Zotero', {
      Collections: {
        getByLibrary: () => collections,
        get: (id: number) => collections.find((collection) => collection.id === id),
      },
    });
    const items = [
      { getCollections: () => [11] },
      { getCollections: () => [10, 11] },
    ] as Zotero.Item[];
    const add = createCollectionCandidateProvider(1, { items, present: true });
    const added = await add.load();
    expect(added.map((candidate) => [candidate.id, candidate.meta])).toEqual([
      [10, '1/2 direct'],
      [11, 'Parent / Child · 2/2 direct · Already assigned'],
      [12, '0/2 direct'],
    ]);
    const remove = createCollectionCandidateProvider(1, { items, present: false, preferredID: 11 });
    const removed = await remove.load();
    expect(removed.map((candidate) => candidate.id)).toEqual([11, 10]);
    const childOnly = createCollectionCandidateProvider(1, { items: [items[0]!], present: false });
    expect((await childOnly.load()).map((candidate) => candidate.id)).toEqual([11]);
  });

  it('keeps explicit create reachable at the result cap and excludes self and descendants from parent choices', async () => {
    const collections = Array.from({ length: 130 }, (_, index) => ({
      id: index + 1,
      libraryID: 1,
      name: `Folder ${index + 1}`,
      parentID: false,
    }));
    vi.stubGlobal('Zotero', {
      Collections: {
        getByLibrary: () => collections,
        get: (id: number) => collections.find((collection) => collection.id === id),
      },
    });
    const add = createCollectionCandidateProvider(1, { items: [], includeCreate: true });
    const candidates = await add.load();
    const filtered = add.filterItems!(candidates, 'Folder');
    expect(filtered).toHaveLength(100);
    expect(filtered[99]?.collectionCandidate).toBe('create');
    expect(
      add.filterItems!(candidates, 'not found').map((candidate) => candidate.collectionCandidate),
    ).toEqual(['create']);
    const parents = createCollectionCandidateProvider(1, {
      includeRoot: true,
      excludeIDs: new Set([1, 2]),
    });
    const parentCandidates = await parents.load();
    expect(parentCandidates.some((candidate) => candidate.id === 1 || candidate.id === 2)).toBe(
      false,
    );
    expect(parentCandidates[0]?.collectionCandidate).toBe('root');
  });
});
