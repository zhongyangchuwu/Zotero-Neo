/** The public Relations service is not yet declared by zotero-types. */
export function relatedSourceNotes(uri: string): Promise<Zotero.Item[]> {
  const runtime = Zotero as unknown as {
    readonly Relations: {
      getByPredicateAndObject(
        type: 'item',
        predicate: 'dc:relation',
        uri: string,
      ): Promise<Zotero.Item[]>;
    };
  };
  return runtime.Relations.getByPredicateAndObject('item', 'dc:relation', uri);
}

export const SOURCE_NOTE_IDENTITY_PREFIX = 'urn:zotero-neo:chapter-note:v1:';

/** A content digest is an idempotency key, not an authentication or integrity primitive. */
export function sourceNoteIdentity(value: string): string {
  return SOURCE_NOTE_IDENTITY_PREFIX + Zotero.Utilities.Internal.md5(value);
}
