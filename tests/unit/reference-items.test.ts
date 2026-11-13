import { afterEach, describe, expect, it, vi } from 'vitest';
import { addReferencePaper, findReferenceItems } from '../../src/operations/references';
import type { ScholarlyPaper } from '../../src/references/contracts';

const paper: ScholarlyPaper = {
  source: 'semantic-scholar',
  sourceID: 'id',
  title: 'An Actual Paper',
  authors: ['Ada Lovelace'],
  year: 2020,
  venue: 'Journal',
  abstract: 'Original abstract',
  doi: '10.1234/abc',
  arxivID: '2001.01234',
  url: 'https://example.org/paper',
  pdfURL: 'https://example.org/paper.pdf',
  referenceCount: null,
  citationCount: null,
  retrievedAt: '2024-01-01',
};
function host() {
  const items = new Map<number, Item>();
  const library = { editable: true, archived: false, libraryType: 'user' };
  let next = 1;
  class Item {
    id = 0;
    libraryID = 1;
    deleted = false;
    fields: Record<string, string> = {};
    creators: unknown[] = [];
    constructor(_type = 'journalArticle') {}
    getField(name: string) {
      return this.fields[name] ?? '';
    }
    setField(name: string, value: string) {
      this.fields[name] = value;
    }
    setCreators(creators: unknown[]) {
      this.creators = creators;
    }
    getAttachments() {
      return [];
    }
    isRegularItem() {
      return true;
    }
    async saveTx() {
      this.id = next++;
      items.set(this.id, this);
    }
  }
  class Search {
    conditions: Array<[string, string, string | number | undefined]> = [];
    addCondition(field: string, op: string, value?: string | number) {
      this.conditions.push([field, op, value]);
    }
    async search() {
      const libraryID = this.conditions.find(([field]) => field === 'libraryID')?.[2];
      const term = this.conditions.find(([field]) => ['DOI', 'extra', 'title'].includes(field));
      return [...items.values()]
        .filter(
          (item) =>
            item.libraryID === libraryID &&
            term &&
            item.getField(term[0]).toLowerCase().includes(String(term[2]).toLowerCase()),
        )
        .map((item) => item.id);
    }
  }
  vi.stubGlobal('Zotero', {
    Item,
    Search,
    Libraries: { get: (id: number) => (id === 1 ? library : undefined) },
    Items: {
      get: (ids: number | number[]) =>
        Array.isArray(ids) ? ids.map((id) => items.get(id)) : items.get(ids),
    },
  });
  return { Item, items, library };
}
afterEach(() => vi.unstubAllGlobals());
describe('reference library operations', () => {
  it('creates complete metadata in the explicitly provided library, then deduplicates exact identifiers', async () => {
    const { items } = host();
    const result = await addReferencePaper(paper, 1, () => true);
    expect(result.reused).toBe(false);
    const item = items.get(result.itemID)!;
    expect(item.fields).toMatchObject({
      title: paper.title,
      DOI: paper.doi,
      date: '2020',
      publicationTitle: 'Journal',
      abstractNote: 'Original abstract',
      url: paper.url,
      extra: 'arXiv: 2001.01234\nPDF: https://example.org/paper.pdf',
    });
    expect(item.creators).toEqual([
      { creatorType: 'author', lastName: 'Ada Lovelace', fieldMode: 1 },
    ]);
    expect(await addReferencePaper(paper, 1, () => true)).toEqual({ ...result, reused: true });
    expect(items.size).toBe(1);
    const { reused: _reused, ...localMatch } = result;
    expect(await findReferenceItems({ text: '', doi: paper.doi! }, 1)).toEqual([localMatch]);
  });
  it('does not overwrite title-only ambiguous matches', async () => {
    const { Item, items } = host();
    const item = new Item();
    item.setField('title', paper.title);
    await item.saveTx();
    await expect(addReferencePaper(paper, 1, () => true)).rejects.toThrow('same title');
    expect(items.size).toBe(1);
    expect(item.fields).toEqual({ title: paper.title });
  });
  it('rejects read-only or retired destinations without creating an item', async () => {
    const { library, items } = host();
    library.editable = false;
    await expect(addReferencePaper(paper, 1, () => true)).rejects.toThrow('read-only');
    library.editable = true;
    await expect(addReferencePaper(paper, 1, () => false)).rejects.toThrow('changed');
    expect(items.size).toBe(0);
  });
  it.each([1, 2, 3])('awaits destination validation at admission check %i', async (retireAt) => {
    const { items } = host();
    let checks = 0;
    const validate = vi.fn(async () => ++checks !== retireAt);
    await expect(addReferencePaper(paper, 1, validate)).rejects.toThrow('destination changed');
    expect(checks).toBe(retireAt);
    expect(items.size).toBe(0);
  });
  it('refuses duplicate exact IDs rather than selecting one', async () => {
    const { Item } = host();
    for (let i = 0; i < 2; i++) {
      const item = new Item();
      item.setField('DOI', paper.doi!);
      await item.saveTx();
    }
    await expect(addReferencePaper(paper, 1, () => true)).rejects.toThrow('Multiple');
  });
  it('deduplicates identifiers in Extra and refuses conflicting identifiers', async () => {
    const { Item, items } = host();
    const item = new Item();
    item.setField('extra', 'DOI: 10.1234/abc\narXiv: 2001.09999');
    await item.saveTx();
    await expect(addReferencePaper(paper, 1, () => true)).rejects.toThrow('identifiers conflict');
    expect(items.size).toBe(1);
  });
});
