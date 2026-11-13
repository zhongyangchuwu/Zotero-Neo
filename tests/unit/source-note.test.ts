import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { findAIQAAdoptions, saveAIQAToNote } from '../../src/ai-qa/adoption';
import type { AIQARecord } from '../../src/ai-qa/contracts';
import type { AIQASourceCapture } from '../../src/ai-qa/evidence';
import { createSourceNote } from '../../src/operations/source-note';
import type { SourceNoteTarget } from '../../src/core/source-note';
const io = vi.hoisted(() => ({ pdf: vi.fn(), blob: vi.fn(), related: vi.fn() }));
vi.mock('../../src/platform/document-analysis', () => ({ analysisPDF: io.pdf }));
vi.mock('../../src/platform/image-data', () => ({ pngBlob: io.blob }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.resetAllMocks());
function fixture() {
  io.related.mockResolvedValue([]);
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
  const saved: Note[] = [],
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
    tags = new Map<string, number>();
    deleted = false;
    isNote() {
      return true;
    }
    getRelationsByPredicate(predicate: string) {
      return this.relations.filter(([p]) => p === predicate).map(([, value]) => value);
    }
    hasTag(value: string) {
      return this.tags.has(value);
    }
    addTag(value: string, type: number) {
      this.tags.set(value, type);
    }
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
    Relations: { getByPredicateAndObject: io.related },
    Items: { getAsync: async (id: number) => (id === 4 ? source : id === 3 ? parent : false) },
    Libraries: { get: () => library },
    Item: Note,
    Utilities: {
      Internal: { md5: (value: string) => createHash('md5').update(value).digest('hex') },
    },
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
  it('reuses a generated note without overwriting manual edits or reimporting images', async () => {
    const f = fixture();
    io.related.mockResolvedValue([
      {
        id: 44,
        key: 'EDITED',
        libraryID: 1,
        parentID: 3,
        deleted: false,
        isNote: () => true,
        hasTag: (value: string) => value === 'urn:zotero-neo:chapter-note:v1:' + 'a'.repeat(32),
        getRelationsByPredicate: () => ['http://zotero.org/users/local/TEST/items/PDFKEY'],
        getNote: () => 'handwritten edits',
      },
    ]);
    const draft = { ...f.draft, identity: 'urn:zotero-neo:chapter-note:v1:' + 'a'.repeat(32) };
    expect(await createSourceNote(f.target, draft)).toEqual({
      itemID: 44,
      key: 'EDITED',
      reused: true,
    });
    expect(f.saved).toEqual([]);
    expect(f.imported).not.toHaveBeenCalled();
  });
  it('keeps opaque identities out of item relations and uses automatic tags without replacing human edits', async () => {
    const f = fixture();
    const identity = 'urn:zotero-neo:chapter-note:v1:' + 'c'.repeat(32);
    const draft = { ...f.draft, identity };
    const created = await createSourceNote(f.target, draft);
    const note = f.saved.at(-1)!;
    expect(note.relations).toEqual([
      ['dc:relation', 'http://zotero.org/users/local/TEST/items/PDFKEY'],
    ]);
    expect(note.tags.get(identity)).toBe(1);
    note.setNote('<p>Human edits remain authoritative.</p>');
    io.related.mockResolvedValue([note]);
    expect(await createSourceNote(f.target, draft)).toEqual({ ...created, reused: true });
    expect(note.html).toBe('<p>Human edits remain authoritative.</p>');
    expect(f.imported).toHaveBeenCalledOnce();
  });
  it('serializes concurrent generation for one source identity and rechecks each destination', async () => {
    const f = fixture(),
      first = Promise.withResolvers<void>();
    io.related.mockImplementation(async () => {
      if (f.saved.length) return [f.saved.at(-1)!];
      await first.promise;
      return [];
    });
    const draft = {
      ...f.draft,
      identity: 'urn:zotero-neo:chapter-note:v1:' + 'b'.repeat(32),
      schemaVersion: 10 as const,
    };
    const a = createSourceNote(f.target, draft),
      b = createSourceNote(f.target, draft),
      c = createSourceNote(f.target, draft);
    first.resolve();
    const receipts = await Promise.all([a, b, c]);
    expect(receipts.map((r) => r.reused)).toEqual([false, true, true]);
    expect(f.imported).toHaveBeenCalledOnce();
    expect((f.saved[0] as { html: string }).html).toContain('data-schema-version="10"');
  });
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

it('recovers each AI revision from the original note identity and preserves manual edits', async () => {
  const f = fixture();
  const source = {
    itemID: 4,
    key: 'PDFKEY',
    libraryID: 1,
    fingerprint: 'source',
    fileName: 'paper',
  };
  const capture = { source, target: f.target, isCurrent: f.current } as AIQASourceCapture;
  const record: AIQARecord = {
    id: 'answer',
    revision: 1,
    source,
    kind: 'question',
    question: 'Why?',
    contextTitle: 'paper',
    evidence: [],
    output: { paragraphs: [{ text: 'Answer', evidenceIDs: [] }], guide: [] },
    model: 'model',
    endpoint: '',
    usage: { inputTokens: null, outputTokens: null },
    createdAt: '',
    updatedAt: '',
    userText: null,
  };
  const labels = {
    title: 'AI',
    question: 'Question',
    source: 'Source',
    model: 'Model',
    generated: 'Original',
    modified: 'Edited',
  };
  expect(await findAIQAAdoptions([record], capture)).toEqual({ answer: null });
  expect(await saveAIQAToNote(record, capture, labels)).toEqual({
    itemID: 10,
    key: 'NOTEKEY',
    reused: false,
  });
  const note = f.saved[0]!;
  note.setNote('manual content');
  io.related.mockImplementation(async () => f.saved);
  expect(await findAIQAAdoptions([record], capture)).toEqual({
    answer: { itemID: 10, key: 'NOTEKEY', reused: true },
  });
  expect((await saveAIQAToNote(record, capture, labels)).reused).toBe(true);
  expect(note.html).toBe('manual content');
  const revised = { ...record, revision: 2, userText: 'My revision' };
  expect(await findAIQAAdoptions([revised], capture)).toEqual({ answer: null });
  expect((await saveAIQAToNote(revised, capture, labels)).reused).toBe(false);
  expect(new Set(f.saved).size).toBe(2);
  note.deleted = true;
  expect(await findAIQAAdoptions([record], capture)).toEqual({ answer: 'unavailable' });
  expect(note.html).toBe('manual content');
});
