import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createMetadataPlan,
  snapshotMetadata,
  type MetadataPlan,
} from '../../src/metadata-review/model';
import {
  readMetadataReviewPaper,
  metadataReviewPayload,
} from '../../src/metadata-review/artifacts';
import { applyMetadataPlan } from '../../src/operations/metadata';
import { projectArtifactNote } from '../../src/operations/artifact-note';
import { extractScholarlyQuery } from '../../src/scholarly/query';
import type { ScholarlyPaper } from '../../src/scholarly/contracts';

const paper: ScholarlyPaper = {
  source: 'crossref',
  sourceID: '10.1234/example',
  title: 'Published title',
  authors: ['Ada Example'],
  year: 2025,
  venue: 'Journal',
  abstract: null,
  doi: '10.1234/example',
  arxivID: null,
  url: 'https://doi.org/10.1234/example',
  pdfURL: null,
  referenceCount: null,
  citationCount: null,
  retrievedAt: '2026-01-01T00:00:00Z',
  bibliography: {
    volume: '12',
    pages: '10-20',
    creators: [{ firstName: 'Ada', lastName: 'Example' }],
  },
  citekey: 'Example:2025',
};
let fields: Record<string, string>;
let creators: _ZoteroTypes.Item.CreatorJSON[];
let item: Zotero.Item;
let saves: Mock<() => Promise<void>>;
let search: Mock<() => Promise<number[]>>;
let library: { editable: boolean; archived: boolean; libraryType: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  fields = { title: 'My edited title', date: '2024', extra: '', citationKey: 'my-key' };
  creators = [{ creatorType: 'author', firstName: 'Original', lastName: 'Author' }];
  saves = vi.fn(async () => {});
  search = vi.fn(async () => []);
  library = { editable: true, archived: false, libraryType: 'user' };
  item = {
    id: 1,
    key: 'ABCD2345',
    libraryID: 1,
    itemTypeID: 2,
    deleted: false,
    isRegularItem: () => true,
    getField: (field: string) => fields[field] || '',
    setField: vi.fn((field: string, value: string) => {
      fields[field] = value;
    }),
    getCreatorsJSON: () => creators,
    setCreators: vi.fn((next: _ZoteroTypes.Item.CreatorJSON[]) => {
      creators = next;
    }),
    save: saves,
  } as unknown as Zotero.Item;
  vi.stubGlobal('Zotero', {
    Libraries: { get: () => library },
    Items: { getAsync: async () => item },
    ItemFields: { getID: (name: string) => name, isValidForType: () => true },
    Search: class {
      addCondition() {}
      search = search;
    },
    DB: { executeTransaction: async (run: () => Promise<unknown>) => run() },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('metadata review', () => {
  it('uses native item properties without requiring an external identifier', () => {
    const snapshot = snapshotMetadata(item, '@article{local, title={A better query}, year={2025}}');
    expect(snapshot.query).toMatchObject({
      title: 'My edited title',
      authors: ['Original Author'],
      year: 2024,
      citekey: 'my-key',
    });
    expect(snapshot.query.doi).toBeUndefined();
    expect(snapshot.query.arxivID).toBeUndefined();
    expect(snapshot.query.bibtex).toContain('A better query');
  });
  it.each(['', ' \t '])(
    'uses pasted bibliographic data when the native title is %j and authors are empty',
    (title) => {
      fields.title = title;
      fields.date = '';
      creators = [];
      const snapshot = snapshotMetadata(
        item,
        '@article{not-an-id, title={Useful Title}, author={Ada Example}, year=2022}',
      );
      expect(extractScholarlyQuery(snapshot.query)).toMatchObject({
        text: '',
        title: 'Useful Title',
        authors: ['Ada Example'],
        year: 2022,
      });
      expect(snapshot.values.title).toBe(title);
      expect(snapshot.values.creators).toEqual([]);
    },
  );
  it('keeps populated native title and authors authoritative over pasted BibTeX', () => {
    const snapshot = snapshotMetadata(
      item,
      '@article{not-an-id, title={Pasted Title}, author={Pasted Author}, year=2022}',
    );
    expect(extractScholarlyQuery(snapshot.query)).toMatchObject({
      title: 'My edited title',
      authors: ['Original Author'],
      year: 2024,
    });
  });
  it('keeps populated fields and citation keys unselected and preserves structured names', () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    expect(plan.changes.find((change) => change.field === 'title')).toMatchObject({
      before: 'My edited title',
      after: 'Published title',
      selected: false,
    });
    expect(plan.changes.find((change) => change.field === 'volume')).toMatchObject({
      after: '12',
      selected: true,
    });
    expect(plan.changes.find((change) => change.field === 'citationKey')).toMatchObject({
      selected: false,
    });
    expect(plan.changes.find((change) => change.field === 'creators')?.after).toEqual([
      { creatorType: 'author', firstName: 'Ada', lastName: 'Example' },
    ]);
    expect(plan.changes.some((change) => change.field === 'abstractNote')).toBe(false);
  });
  it('writes only reviewed fields and leaves manual fields and authors untouched', async () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    await applyMetadataPlan(plan, ['volume', 'pages'], () => true);
    expect(fields.volume).toBe('12');
    expect(fields.pages).toBe('10-20');
    expect(fields.title).toBe('My edited title');
    expect(fields.citationKey).toBe('my-key');
    expect(creators).toEqual([
      { creatorType: 'author', firstName: 'Original', lastName: 'Author' },
    ]);
    expect(saves).toHaveBeenCalledTimes(1);
  });
  it('rejects a stale baseline instead of overwriting an intervening manual edit', async () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    fields.title = 'Changed in another window';
    await expect(applyMetadataPlan(plan, ['volume'], () => true)).rejects.toThrow(
      'changed after inspection',
    );
    expect(fields.volume).toBeUndefined();
    expect(saves).not.toHaveBeenCalled();
  });
  it('does not write after cancellation or a change of item identity', async () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    await expect(applyMetadataPlan(plan, ['volume'], () => false)).rejects.toThrow('cancelled');
    const wrong = {
      ...plan,
      snapshot: { ...plan.snapshot, itemKey: 'WRONG234' },
    } satisfies MetadataPlan;
    await expect(applyMetadataPlan(wrong, ['volume'], () => true)).rejects.toThrow(
      'no longer available',
    );
    expect(saves).not.toHaveBeenCalled();
  });
  it('rejects a colliding native citation key even after explicit selection', async () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    search.mockResolvedValue([9]);
    await expect(applyMetadataPlan(plan, ['citationKey'], () => true)).rejects.toThrow(
      'already used',
    );
    expect(fields.citationKey).toBe('my-key');
  });
  it.each([
    ['review closure', () => {}, 'cancelled'],
    [
      'item ID change',
      () => {
        Object.assign(item, { id: 2 });
      },
      'no longer available',
    ],
    [
      'item key change',
      () => {
        Object.assign(item, { key: 'OTHER234' });
      },
      'no longer available',
    ],
    [
      'library change',
      () => {
        Object.assign(item, { libraryID: 2 });
      },
      'no longer available',
    ],
    [
      'manual edit',
      () => {
        fields.title = 'Changed during lookup';
      },
      'changed after inspection',
    ],
    [
      'read-only library',
      () => {
        library.editable = false;
      },
      'no longer writable',
    ],
    [
      'archived library',
      () => {
        library.archived = true;
      },
      'no longer writable',
    ],
  ] as const)(
    'rejects %s during a pending citation key search without assigning any fields',
    async (reason, change, message) => {
      const plan = createMetadataPlan(snapshotMetadata(item), paper);
      const entered = deferred<void>();
      const found = deferred<number[]>();
      search.mockImplementationOnce(() => {
        entered.resolve(undefined);
        return found.promise;
      });
      let current = true;
      const applying = applyMetadataPlan(plan, ['citationKey', 'volume'], () => current);
      const rejected = expect(applying).rejects.toThrow(message);
      await entered.promise;
      if (reason === 'review closure') current = false;
      change();
      found.resolve([]);
      await rejected;
      expect(item.setField).not.toHaveBeenCalled();
      expect(item.setCreators).not.toHaveBeenCalled();
      expect(saves).not.toHaveBeenCalled();
      expect(fields.citationKey).toBe('my-key');
      expect(fields.volume).toBeUndefined();
    },
  );
  it('rolls back in-memory proposed values when native persistence fails', async () => {
    fields.volume = 'Old volume';
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    saves.mockRejectedValue(new Error('disk full'));
    await expect(applyMetadataPlan(plan, ['volume'], () => true)).rejects.toThrow('disk full');
    expect(fields.volume).toBe('Old volume');
  });
  it('does not serialize machine-specific item IDs and rejects a foreign parent or malformed paper', () => {
    const plan = createMetadataPlan(snapshotMetadata(item), paper);
    const payload = metadataReviewPayload(plan, ['volume']);
    expect(payload.snapshot).toEqual({ itemKey: 'ABCD2345', values: plan.snapshot.values });
    expect(readMetadataReviewPaper(payload, 'ABCD2345')).toEqual(paper);
    expect(readMetadataReviewPaper(payload, 'OTHER234')).toBeNull();
    expect(
      readMetadataReviewPaper({ ...payload, paper: { ...paper, authors: [{}] } }, 'ABCD2345'),
    ).toBeNull();
    expect(
      readMetadataReviewPaper(
        {
          ...payload,
          paper: { ...paper, bibliography: { creators: [{ lastName: 'Missing first name' }] } },
        },
        'ABCD2345',
      ),
    ).toBeNull();
  });
});

describe('artifact note admission', () => {
  let parent: Zotero.Item;
  let attachment: Zotero.Item;
  let note: Zotero.Item;
  let attachmentLookup: Mock<() => Promise<Zotero.Item | null>>;
  let noteLookup: Mock<() => Promise<Zotero.Item | null>>;
  let createNote: Mock;

  beforeEach(() => {
    parent = { ...item, getNotes: () => [7] } as unknown as Zotero.Item;
    attachment = {
      libraryID: 1,
      parentItemID: 1,
      deleted: false,
      isAttachment: () => true,
    } as unknown as Zotero.Item;
    note = {
      addRelation: vi.fn(),
      setNote: vi.fn(),
      save: saves,
    } as unknown as Zotero.Item;
    attachmentLookup = vi.fn(async () => attachment);
    noteLookup = vi.fn(async () => null);
    createNote = vi.fn(function () {
      return note;
    });
    vi.stubGlobal('Zotero', {
      ...Zotero,
      Item: createNote,
      Items: { getByLibraryAndKeyAsync: attachmentLookup, getAsync: noteLookup },
      URI: { getItemURI: () => 'https://example.test/artifact' },
    });
  });

  it.each(['attachment', 'existing note'] as const)(
    'does not create or save a note when the review closes during pending %s lookup',
    async (phase) => {
      const entered = deferred<void>();
      const result = deferred<Zotero.Item | null>();
      const lookup = phase === 'attachment' ? attachmentLookup : noteLookup;
      lookup.mockImplementationOnce(() => {
        entered.resolve(undefined);
        return result.promise;
      });
      let current = true;
      const projecting = projectArtifactNote(
        parent,
        'ARTF2345',
        'Review',
        ['Proposed fields'],
        () => current,
      );
      const rejected = expect(projecting).rejects.toThrow('cancelled');
      await entered.promise;
      current = false;
      result.resolve(phase === 'attachment' ? attachment : null);
      await rejected;
      expect(createNote).not.toHaveBeenCalled();
      expect(note.setNote).not.toHaveBeenCalled();
      expect(saves).not.toHaveBeenCalled();
    },
  );

  it('creates a linked projection when the optional admission predicate is omitted', async () => {
    expect(await projectArtifactNote(parent, 'ARTF2345', 'Review <title>', ['A & B'])).toBe(note);
    expect(note.addRelation).toHaveBeenCalledWith('dc:relation', 'https://example.test/artifact');
    expect(note.setNote).toHaveBeenCalledWith('<h1>Review &lt;title&gt;</h1><p>A &amp; B</p>');
    expect(saves).toHaveBeenCalledTimes(1);
  });

  it('returns an admitted note save even if the review closes while that save is pending', async () => {
    const entered = deferred<void>();
    const saved = deferred<void>();
    saves.mockImplementationOnce(() => {
      entered.resolve(undefined);
      return saved.promise;
    });
    let current = true;
    const projecting = projectArtifactNote(parent, 'ARTF2345', 'Review', [], () => current);
    await entered.promise;
    current = false;
    saved.resolve(undefined);
    expect(await projecting).toBe(note);
    expect(saves).toHaveBeenCalledTimes(1);
  });
});
