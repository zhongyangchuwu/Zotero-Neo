import {
  normalizeAttributeValue,
  readAttributeValue,
  replaceAttributeValue,
} from '../item-attributes/extra';
import type { ItemAttributeDefinition, ItemAttributeState } from '../item-attributes/types';
import { executeCollectionTransaction } from '../toolkit/main';

type AttributeLibrary = Exclude<ReturnType<typeof Zotero.Libraries.get>, false>;

type Target = {
  readonly item: Zotero.Item;
  readonly library: AttributeLibrary;
  readonly expected: ItemAttributeState;
};

const SAVE_FIELDS = ['dateModified', 'synced', 'clientVersion'] as const;
type SaveState = ReadonlyMap<string, string>;
type Transition = {
  readonly item: Zotero.Item;
  readonly previous: string;
  readonly next: string;
  readonly primary: SaveState;
  savedPrimary?: SaveState;
};

function sameState(left: ItemAttributeState, right: ItemAttributeState): boolean {
  return !left.ambiguous && !right.ambiguous && left.value === right.value;
}

function assertWritable(item: Zotero.Item): AttributeLibrary {
  if (
    !Number.isSafeInteger(item.id) ||
    item.id <= 0 ||
    Zotero.Items.get(item.id) !== item ||
    item.deleted ||
    !item.isRegularItem() ||
    item.isFeedItem
  )
    throw new Error('Attribute target is not an available ordinary bibliographic item');
  if (!Number.isSafeInteger(item.libraryID) || item.libraryID <= 0)
    throw new Error('Attribute target library is unavailable');
  const library = Zotero.Libraries.get(item.libraryID);
  if (
    !library ||
    !library.editable ||
    library.archived ||
    library.libraryType === 'feed' ||
    !item.isEditable()
  )
    throw new Error('Attribute target library is read-only');
  return library;
}

/** Edit explicit, snapshot-checked targets in one normal native save transaction. */
export async function setItemAttribute(
  items: readonly Zotero.Item[],
  definition: ItemAttributeDefinition,
  input: string | null,
  request: {
    readonly expected: ReadonlyMap<number, ItemAttributeState>;
    readonly isCurrent: () => boolean;
  },
): Promise<number> {
  // Snapshot caller-owned inputs before waiting for admission to the transaction.
  const key = definition.key;
  const value = normalizeAttributeValue(definition, input);
  const isCurrent = request.isCurrent;
  const targets = new Map<number, Target>();
  if (!isCurrent()) throw new Error('Attribute edit is no longer current');
  for (const item of items) {
    const library = assertWritable(item);
    const expected = request.expected.get(item.id);
    if (
      !expected ||
      expected.ambiguous ||
      (expected.value !== null && typeof expected.value !== 'string')
    )
      throw new Error('Every attribute target requires an unambiguous expected value');
    if (!sameState(readAttributeValue(item.getField('extra'), key), expected))
      throw new Error('Attribute value changed since editing began');
    targets.set(item.id, { item, library, expected: { ...expected } });
  }
  if (!targets.size) return 0;
  const transitions: Transition[] = [];
  const written = new Map<number, ItemAttributeState>();

  function assertCurrentTarget({ item, library, expected }: Target): void {
    if (!isCurrent()) throw new Error('Attribute edit is no longer current');
    if (assertWritable(item) !== library) throw new Error('Attribute target library changed');
    if (!written.has(item.id) && item.hasChanged())
      throw new Error(
        'Finish and save native item editing, then reopen the attribute editor before retrying',
      );
    if (
      !sameState(readAttributeValue(item.getField('extra'), key), written.get(item.id) ?? expected)
    )
      throw new Error('Attribute value changed since editing began');
  }

  async function restore(): Promise<void> {
    for (const transition of transitions) {
      const { item, previous, next, primary, savedPrimary } = transition;
      const latest = item.getField('extra');
      if (latest === next) {
        item.setField('extra', previous);
      } else if (sameState(readAttributeValue(latest, key), readAttributeValue(next, key))) {
        // Preserve later edits to unrelated Extra lines, or to any other item field.
        item.setField(
          'extra',
          replaceAttributeValue(latest, key, readAttributeValue(previous, key).value),
        );
      }
      // Do not reload all itemData: it would discard later in-memory metadata edits.
      if (savedPrimary) {
        for (const [field, before] of primary) {
          if (item.getField(field) === savedPrimary.get(field) && item.getField(field) !== before)
            item.setField(field, before);
        }
      }
    }
  }

  return executeCollectionTransaction(
    async () => {
      for (const target of targets.values()) assertCurrentTarget(target);
      for (const target of targets.values()) {
        const { item } = target;
        assertCurrentTarget(target);
        const previous = item.getField('extra');
        const next = replaceAttributeValue(previous, key, value);
        if (next === previous) continue;
        // Native setField() trims and NFC-normalizes the entire Extra field. Refuse
        // before mutation if that would silently rewrite unrelated bytes.
        if (next.trim().normalize() !== next || previous.trim().normalize() !== previous)
          throw new Error(
            'Native Zotero would normalize unrelated Extra text; edit Extra manually first',
          );
        const transition: Transition = {
          item,
          previous,
          next,
          primary: new Map(SAVE_FIELDS.map((field) => [field, item.getField(field)])),
        };
        transitions.push(transition);
        item.setField('extra', next);
        if (item.getField('extra') !== next) {
          item.setField('extra', previous);
          throw new Error('Native Zotero changed unrelated Extra text; edit Extra manually first');
        }
        written.set(item.id, readAttributeValue(next, key));
        // Zotero 10's documented save options stage a real native Undo action.
        // All saves share this transaction and therefore one metadata Undo step.
        const options: Zotero.DataObject.SaveOptions & {
          undoAction: string;
          undoActionArgs: { count: number };
        } = {
          undoAction: 'undo-action-edit-metadata',
          undoActionArgs: { count: transitions.length },
        };
        try {
          await item.save(options);
        } finally {
          transition.savedPrimary = new Map(
            SAVE_FIELDS.map((field) => [field, item.getField(field)]),
          );
        }
        assertCurrentTarget(target);
      }
      for (const target of targets.values()) assertCurrentTarget(target);
      return transitions.length;
    },
    { onRollback: restore, reportCommittedError: true },
  );
}
