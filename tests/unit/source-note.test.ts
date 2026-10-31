import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSourceNote } from '../../src/operations/source-note';
import type { SourceNoteTarget } from '../../src/core/source-note';
const io = vi.hoisted(() => ({ pdf: vi.fn(), blob: vi.fn() }));
vi.mock('../../src/platform/document-analysis', () => ({ analysisPDF: io.pdf }));
vi.mock('../../src/platform/image-data', () => ({ pngBlob: io.blob }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.resetAllMocks());
function fixture() {
  const source = {
    id: 4,
    key: 'PDFKEY',
    libraryID: 1,
    parentItemID: 3,
    isPDFAttachment: () => true,
    deleted: false,
  };
  const parent = { id: 3, key: 'PARENT', libraryID: 1, isRegularItem: () => true, deleted: false };
  const library = { editable: true, filesEditable: true };
  const saved: object[] = [],
    erased = vi.fn(),
    imported = vi.fn(async () => ({ key: 'IMAGEKEY' }));
  const current = vi.fn(async () => true);
  io.pdf.mockResolvedValue({ fingerprint: 'source', isCurrent: current });
  class Note {
    id = 10;
    key = 'NOTEKEY';
    html = '';
    libraryID = 0;
    parentID = 0;
    relations: [string, string][] = [];
    addRelation(predicate: string, object: string) {
      this.relations.push([predicate, object]);
    }
    setNote(html: string) {
      this.html = html;
    }
    async saveTx() {
      saved.push(this);
    }
    eraseTx = erased;
  }
  vi.stubGlobal('Zotero', {
    URI: { getItemURI: () => 'http://zotero.org/users/local/TEST/items/PDFKEY' },
    Items: { getAsync: async (id: number) => (id === 4 ? source : id === 3 ? parent : false) },
    Libraries: { get: () => library },
    Item: Note,
    Attachments: { importEmbeddedImage: imported },
  });
  const target: SourceNoteTarget = {
    attachment: { itemID: 4, key: 'PDFKEY', libraryID: 1, title: 'paper' },
    parent: { itemID: 3, key: 'PARENT' },
  };
  const draft = {
    sourceFingerprint: 'source',
    title: 'Figure 2 <title>',
    html: '<p><img src="neo-image:0"/></p>',
    images: ['data:image/png;base64,AA=='],
  };
  return { target, draft, source, parent, library, saved, erased, imported, current };
}
describe('explicit source note writes', () => {
  it('creates only the captured paper destination and commits an embedded image before returning a receipt', async () => {
    const f = fixture();
    expect(await createSourceNote(f.target, f.draft)).toEqual({
      itemID: 10,
      key: 'NOTEKEY',
      reused: false,
    });
    const note = f.saved.at(-1) as {
      libraryID: number;
      parentID: number;
      html: string;
      relations: [string, string][];
    };
    expect(note).toMatchObject({ libraryID: 1, parentID: 3 });
    expect(note.relations).toContainEqual([
      'dc:relation',
      'http://zotero.org/users/local/TEST/items/PDFKEY',
    ]);
    expect(note.html).toContain('Figure 2 &lt;title&gt;');
    expect(note.html).toContain('data-attachment-key="IMAGEKEY"');
    expect(note.html).not.toContain('neo-image:');
    expect(f.imported).toHaveBeenCalledWith({ blob: undefined, parentItemID: 10 });
  });
  it.each(['source', 'parent', 'library', 'fingerprint'] as const)(
    'rejects changed %s before any note write',
    async (reason) => {
      const f = fixture();
      if (reason === 'source') f.source.key = 'changed';
      if (reason === 'parent') f.parent.key = 'changed';
      if (reason === 'library') f.library.editable = false;
      if (reason === 'fingerprint') f.draft.sourceFingerprint = 'old';
      await expect(createSourceNote(f.target, f.draft)).rejects.toThrow();
      expect(f.saved).toEqual([]);
      expect(f.imported).not.toHaveBeenCalled();
    },
  );
  it('erases only its own partial note after image failure or a PDF change before final commit', async () => {
    const f = fixture();
    f.imported.mockRejectedValueOnce(new Error('image failed'));
    await expect(createSourceNote(f.target, f.draft)).rejects.toThrow('image failed');
    expect(f.erased).toHaveBeenCalledOnce();
    f.erased.mockClear();
    f.current.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(createSourceNote(f.target, f.draft)).rejects.toThrow('Source PDF changed');
    expect(f.erased).toHaveBeenCalledOnce();
  });
  it('rechecks the destination after asynchronous source validation before the first write', async () => {
    const f = fixture(),
      pending = Promise.withResolvers<boolean>();
    f.current.mockReturnValueOnce(pending.promise);
    const saving = createSourceNote(f.target, f.draft);
    await vi.waitFor(() => expect(f.current).toHaveBeenCalledOnce());
    f.parent.key = 'changed';
    pending.resolve(true);
    await expect(saving).rejects.toThrow('destination changed');
    expect(f.saved).toEqual([]);
  });
});
