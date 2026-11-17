import { reportDiagnosticError, ZoteroLogger } from '../core/logging';
import {
  normalizeAttributeValue,
  readAttributeValue,
  replaceAttributeValue,
} from '../item-attributes/extra';
import type { ItemAttributeDefinition, ItemAttributeState } from '../item-attributes/types';
import {
  captureItemExtraRecovery,
  executeCollectionTransaction,
  type ItemExtraRecovery,
} from '../toolkit/main';

type AttributeLibrary = Exclude<ReturnType<typeof Zotero.Libraries.get>, false>;

type Target = {
  readonly item: Zotero.Item;
  readonly library: AttributeLibrary;
  readonly expected: ItemAttributeState;
};

const recoveryLogger = new ZoteroLogger();
type Transition = {
  readonly item: Zotero.Item;
  readonly previous: string;
  readonly next: string;
  readonly recovery: ItemExtraRecovery;
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
    for (const { item, previous, next, recovery } of transitions) {
      try {
        const latest = item.getField('extra');
        const desired =
          latest === next
            ? previous
            : sameState(readAttributeValue(latest, key), readAttributeValue(next, key))
              ? replaceAttributeValue(latest, key, readAttributeValue(previous, key).value)
              : latest;
        recovery.restore(desired);
      } catch (error) {
        // Every target gets a recovery attempt. Never replace the operation's
        // original error with an independent cache-recovery failure.
        reportDiagnosticError(recoveryLogger, 'Attribute rollback recovery failed', error);
      }
    }
  }

  return executeCollectionTransaction(
    async () => {
      const recoveries = new Map<number, ItemExtraRecovery>();
      for (const target of targets.values()) {
        assertCurrentTarget(target);
        const previous = target.item.getField('extra');
        if (replaceAttributeValue(previous, key, value) !== previous)
          recoveries.set(target.item.id, captureItemExtraRecovery(target.item));
      }
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
          // Preflight every target before any mutation; recapture after earlier
          // awaited saves to use the latest clean native baseline.
          recovery: transitions.length ? captureItemExtraRecovery(item) : recoveries.get(item.id)!,
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
        } catch (error) {
          try {
            transition.recovery.saved();
          } catch (recoveryError) {
            reportDiagnosticError(
              recoveryLogger,
              'Attribute save-state capture failed',
              recoveryError,
            );
          }
          throw error;
        }
        transition.recovery.saved();
        assertCurrentTarget(target);
      }
      for (const target of targets.values()) assertCurrentTarget(target);
      return transitions.length;
    },
    { onRollback: restore, reportCommittedError: true },
  );
}
