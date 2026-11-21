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
    const memberships = [[11], [10, 11]];
    const add = createCollectionCandidateProvider(1, { memberships, present: true });
    const added = await add.load();
    expect(added.map((candidate) => [candidate.id, candidate.meta])).toEqual([
      [10, '1/2 direct'],
      [11, 'Parent / Child · 2/2 direct · Already assigned'],
      [12, '0/2 direct'],
    ]);
    const remove = createCollectionCandidateProvider(1, {
      memberships,
      present: false,
      preferredID: 11,
    });
    const removed = await remove.load();
    expect(removed.map((candidate) => candidate.id)).toEqual([11, 10]);
    const childOnly = createCollectionCandidateProvider(1, { memberships: [[11]], present: false });
    expect((await childOnly.load()).map((candidate) => candidate.id)).toEqual([11]);
  });

  it('keeps full paths searchable but shows only parent paths and contextual coverage', async () => {
    const collections = [
      { id: 10, name: 'Project', libraryID: 1, parentID: false },
      { id: 11, name: 'Research / Drafts', libraryID: 1, parentID: 10 },
      { id: 12, name: 'Archive', libraryID: 1, parentID: false },
    ];
    vi.stubGlobal('Zotero', {
      Collections: {
        getByLibrary: () => collections,
        get: (id: number) => collections.find((collection) => collection.id === id),
      },
    });
    const add = createCollectionCandidateProvider(1, {
      presentation: 'compact',
      language: 'zh-CN',
      memberships: [[11]],
      present: true,
      includeCreate: true,
    });
    const added = await add.load();
    expect(added[1]).toMatchObject({
      id: 11,
      icon: 'folder',
      search: 'Project / Research / Drafts',
      columns: [
        { text: 'Research / Drafts', role: 'primary' },
        { text: 'Project', role: 'muted' },
        { text: '✓ 已归属', role: 'badge', align: 'end' },
      ],
    });
    expect(added[0]?.columns?.map((column) => column.text)).toEqual(['Project', '']);
    expect(add.filterItems!(added, 'Project').map(({ id }) => id)).toContain(11);
    expect(add.preview(added[1]!).body).toBe('Project\n✓ 已归属');
    expect(added.at(-1)).toMatchObject({
      id: 'create',
      icon: 'plus',
      kind: 'action',
      selectable: false,
    });

    const remove = createCollectionCandidateProvider(1, {
      presentation: 'compact',
      memberships: [[11]],
      present: false,
    });
    expect(await remove.load()).toEqual([
      expect.objectContaining({
        id: 11,
        columns: [
          expect.objectContaining({ text: 'Research / Drafts', role: 'primary' }),
          expect.objectContaining({ text: 'Project', role: 'muted' }),
        ],
      }),
    ]);

    for (const present of [true, false]) {
      const many = createCollectionCandidateProvider(1, {
        presentation: 'compact',
        memberships: [[10, 11], [11]],
        present,
      });
      expect((await many.load()).map((row) => [row.id, row.columns?.[2]?.text])).toEqual(
        present
          ? [
              [10, '1/2'],
              [11, '2/2 ✓'],
              [12, '0/2'],
            ]
          : [
              [10, '1/2'],
              [11, '2/2 ✓'],
            ],
      );
    }
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
    const add = createCollectionCandidateProvider(1, { includeCreate: true });
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
