/** The public Relations service is not yet declared by zotero-types. */
export async function relatedSourceNotes(uri: string): Promise<Zotero.Item[]> {
  const runtime = Zotero as unknown as {
    readonly Relations: {
      getByPredicateAndObject(
        type: 'item',
        predicate: 'dc:relation',
        uri: string,
      ): Promise<Zotero.Item[]>;
    };
  };
  const notes = await runtime.Relations.getByPredicateAndObject('item', 'dc:relation', uri);
  for (const note of notes) await migrateSourceNoteIdentity(note);
  return notes;
}

export const SOURCE_NOTE_IDENTITY_PREFIX = 'urn:zotero-neo:chapter-note:v1:';
const IDENTITY_DIGEST = /^[a-f0-9]{32}$/u;
type MigrationOutcome = 'unchanged' | 'migrated' | 'read-only';
const pendingMigrations = new Map<number, Promise<MigrationOutcome>>();
let legacyMigration: Promise<{ migrated: number; readOnly: number }> | undefined;

export function isSourceNoteIdentity(value: string): boolean {
  return (
    value.startsWith(SOURCE_NOTE_IDENTITY_PREFIX) &&
    IDENTITY_DIGEST.test(value.slice(SOURCE_NOTE_IDENTITY_PREFIX.length))
  );
}

/** Move only Neo's legacy identity relations to syncable automatic tags; never rewrite note content. */
export function migrateSourceNoteIdentity(
  note: Zotero.Item,
): MigrationOutcome | Promise<MigrationOutcome> {
  const pending = pendingMigrations.get(note.id);
  if (pending) return pending;
  if (!note.isNote()) return 'unchanged';
  const identities = note.getRelationsByPredicate('dc:relation').filter(isSourceNoteIdentity);
  if (!identities.length) return 'unchanged';
  const library = Zotero.Libraries.get(note.libraryID);
  if (!library || !library.editable) return 'read-only';
  const migration = (async (): Promise<MigrationOutcome> => {
    for (const identity of identities) {
      if (!note.hasTag(identity)) note.addTag(identity, 1);
      note.removeRelation('dc:relation', identity);
    }
    await note.saveTx({ skipDateModifiedUpdate: true, skipSelect: true });
    return 'migrated';
  })().finally(() => pendingMigrations.delete(note.id));
  pendingMigrations.set(note.id, migration);
  return migration;
}

/** Scan all libraries, including trash, once after DB initialization; public item saves retain normal sync. */
export function migrateLegacySourceNoteIdentities(): Promise<{
  migrated: number;
  readOnly: number;
}> {
  return (legacyMigration ??= (async () => {
    await Zotero.initializationPromise;
    const itemIDs = await Zotero.DB.columnQueryAsync<number>(
      `SELECT DISTINCT R.itemID FROM itemRelations R
       JOIN relationPredicates P USING (predicateID)
       WHERE P.predicate = ? AND R.object LIKE ?`,
      ['dc:relation', `${SOURCE_NOTE_IDENTITY_PREFIX}%`],
    );
    let migrated = 0;
    let readOnly = 0;
    for (const itemID of itemIDs) {
      const note = await Zotero.Items.getAsync(itemID);
      if (!note) continue;
      const outcome = await migrateSourceNoteIdentity(note);
      if (outcome === 'migrated') migrated++;
      else if (outcome === 'read-only') readOnly++;
    }
    return { migrated, readOnly };
  })());
}

/** A content digest is an idempotency key, not an authentication or integrity primitive. */
export function sourceNoteIdentity(value: string): string {
  return SOURCE_NOTE_IDENTITY_PREFIX + Zotero.Utilities.Internal.md5(value);
}
