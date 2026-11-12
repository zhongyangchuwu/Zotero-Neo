import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PREFIX = 'urn:zotero-neo:chapter-note:v1:';
const IDENTITY = PREFIX + 'a'.repeat(32);
const SOURCE = 'http://zotero.org/users/local/TEST/items/PDFKEY';
let adapter: typeof import('../../src/platform/note-relations');
beforeEach(async () => {
  // Each case loads a fresh runtime bundle; a static import would share its one-shot migration.
  vi.resetModules();
  adapter = await import('../../src/platform/note-relations');
});
afterEach(() => vi.unstubAllGlobals());

class Note {
  key: string;
  libraryID = 1;
  parentID = 7;
  deleted = false;
  html = '<p>Human edits and zotero://open-pdf/library/items/PDFKEY?page=2</p>';
  dateModified = '2026-10-01 12:30:00';
  synced = true;
  tags = new Map<string, number>([['human tag', 0]]);
  relations = new Map<string, string[]>([['dc:relation', [SOURCE, IDENTITY]]]);
  saves = 0;
  beforeCommit = Promise.resolve();
  stored: ReturnType<Note['snapshot']>;
  constructor(readonly id: number) {
    this.key = `NOTE${id}`;
    this.stored = this.snapshot();
  }
  isNote() {
    return true;
  }
  getRelationsByPredicate(predicate: string) {
    return [...(this.relations.get(predicate) ?? [])];
  }
  removeRelation(predicate: string, value: string) {
    this.relations.set(
      predicate,
      this.getRelationsByPredicate(predicate).filter((v) => v !== value),
    );
  }
  hasTag(tag: string) {
    return this.tags.has(tag);
  }
  addTag(tag: string, type: number) {
    this.tags.set(tag, type);
  }
  snapshot() {
    return {
      id: this.id,
      key: this.key,
      libraryID: this.libraryID,
      parentID: this.parentID,
      html: this.html,
      dateModified: this.dateModified,
      deleted: this.deleted,
      synced: this.synced,
      tags: [...this.tags],
      relations: [...this.relations].map(([p, values]) => [p, [...values]]),
    };
  }
  async saveTx(options: { skipDateModifiedUpdate?: boolean }) {
    this.saves++;
    await this.beforeCommit;
    if (!options.skipDateModifiedUpdate) this.dateModified = '2026-11-01 00:00:00';
    this.synced = false;
    this.stored = this.snapshot();
  }
}
function fixture(notes: Note[]) {
  const library = { editable: true };
  const ready = Promise.withResolvers<void>();
  vi.stubGlobal('Zotero', {
    initializationPromise: ready.promise,
    DB: { columnQueryAsync: async () => notes.map((note) => note.id) },
    Items: { getAsync: async (id: number) => notes.find((note) => note.id === id) },
    Libraries: { get: () => library },
    Relations: { getByPredicateAndObject: async () => notes },
  });
  return { library, ready };
}

describe('source note identity migration', () => {
  it('migrates normal and trashed notes without changing content, identity, human tags or source links', async () => {
    const note = new Note(11),
      trash = new Note(12);
    trash.deleted = true;
    trash.tags.set(IDENTITY, 0);
    note.relations.set('dc:relation', [SOURCE, IDENTITY, SOURCE.replace('PDFKEY', 'OTHERKEY')]);
    note.relations.set('owl:sameAs', [SOURCE.replace('PDFKEY', 'LINKEDKEY')]);
    const before = [note.snapshot(), trash.snapshot()];
    const f = fixture([note, trash]);
    const migration = adapter.migrateLegacySourceNoteIdentities();
    expect([note.snapshot(), trash.snapshot()]).toEqual(before);
    f.ready.resolve();
    expect(await migration).toEqual({ migrated: 2, readOnly: 0 });
    for (const [index, item] of [note, trash].entries()) {
      expect(item.stored).toMatchObject({
        id: before[index]!.id,
        key: before[index]!.key,
        parentID: before[index]!.parentID,
        html: before[index]!.html,
        dateModified: before[index]!.dateModified,
        deleted: before[index]!.deleted,
        synced: false,
      });
      expect(item.tags.get('human tag')).toBe(0);
      expect(item.tags.get(IDENTITY)).toBe(index === 0 ? 1 : 0);
    }
    expect(note.getRelationsByPredicate('dc:relation')).toEqual([
      SOURCE,
      SOURCE.replace('PDFKEY', 'OTHERKEY'),
    ]);
    expect(note.getRelationsByPredicate('owl:sameAs')).toEqual([
      SOURCE.replace('PDFKEY', 'LINKEDKEY'),
    ]);
    const stored = note.stored;
    expect(
      await adapter.migrateSourceNoteIdentity(
        note as unknown as Parameters<typeof adapter.migrateSourceNoteIdentity>[0],
      ),
    ).toBe('unchanged');
    expect(note.stored).toBe(stored);
  });

  it('leaves unrelated or malformed markers and non-note items untouched', async () => {
    const malformed = new Note(13),
      nonNote = new Note(14);
    malformed.relations.set('dc:relation', [
      SOURCE,
      PREFIX + 'not-a-digest',
      'urn:other-owner:' + 'a'.repeat(32),
    ]);
    nonNote.isNote = () => false;
    const before = [malformed.snapshot(), nonNote.snapshot()];
    const f = fixture([malformed, nonNote]);
    f.ready.resolve();
    expect(await adapter.migrateLegacySourceNoteIdentities()).toEqual({ migrated: 0, readOnly: 0 });
    expect([malformed.snapshot(), nonNote.snapshot()]).toEqual(before);
  });

  it('defers read-only data, then repairs it when a writable source read reaches it', async () => {
    const note = new Note(15),
      f = fixture([note]);
    f.library.editable = false;
    const before = note.snapshot();
    f.ready.resolve();
    expect(await adapter.migrateLegacySourceNoteIdentities()).toEqual({ migrated: 0, readOnly: 1 });
    expect(note.snapshot()).toEqual(before);
    f.library.editable = true;
    await adapter.relatedSourceNotes(SOURCE);
    expect(note.stored.tags).toContainEqual([IDENTITY, 1]);
    expect(note.stored.relations).toEqual([['dc:relation', [SOURCE]]]);
    expect(note.stored.html).toBe(before.html);
  });

  it('coalesces startup and source reads until the identity is durably saved', async () => {
    const note = new Note(16),
      f = fixture([note]),
      commit = Promise.withResolvers<void>();
    note.beforeCommit = commit.promise;
    f.ready.resolve();
    const startup = adapter.migrateLegacySourceNoteIdentities();
    await vi.waitFor(() => expect(note.saves).toBe(1));
    let returned = false;
    const read = adapter.relatedSourceNotes(SOURCE).then((notes) => {
      returned = true;
      return notes;
    });
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(note.stored.relations).toEqual([['dc:relation', [SOURCE, IDENTITY]]]);
    commit.resolve();
    await Promise.all([startup, read]);
    expect(note.saves).toBe(1);
    expect(note.stored.relations).toEqual([['dc:relation', [SOURCE]]]);
  });
});
