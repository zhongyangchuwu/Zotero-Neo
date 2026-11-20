import { reportDiagnosticError, ZoteroLogger } from '../core/logging';
import type { BatchOutcome } from '../i18n/batch-result';
import { executeCollectionTransaction } from '../toolkit/main/collection-transactions';

export interface CollectionBatchOutcome extends BatchOutcome {
  collectionID?: number;
  cacheWarning?: boolean;
}

type MembershipScope =
  | {
      readonly target: Zotero.Collection;
      readonly present: boolean;
      readonly source?: Zotero.Collection;
    }
  | {
      readonly libraryID: number;
      readonly createTarget: () => Promise<Zotero.Collection>;
      readonly checkParent: () => void;
      readonly recoverCreation: () => Promise<void>;
    };

type MembershipChange = 'done' | 'unchanged' | 'unavailable' | 'missingData';

const logger = new ZoteroLogger();

export function writableLibrary(libraryID: number): void {
  const library = Zotero.Libraries.get(libraryID);
  if (!library || !library.editable || library.archived || library.libraryType === 'feed')
    throw new Error('Collection library is read-only');
}

export function writableCollection(collectionID: number): Zotero.Collection {
  const collection = Zotero.Collections.get(collectionID);
  if (!collection || collection.deleted) throw new Error('Collection target is unavailable');
  writableLibrary(collection.libraryID);
  const seen = new Set<number>([collection.id]);
  let parentID = collection.parentID;
  while (parentID) {
    if (seen.has(parentID)) throw new Error('Collection ancestry is invalid');
    seen.add(parentID);
    const parent = Zotero.Collections.get(parentID);
    if (!parent || parent.deleted || parent.libraryID !== collection.libraryID)
      throw new Error('Collection target is unavailable');
    parentID = parent.parentID;
  }
  return collection;
}

export function writableCollectionItem(item: Zotero.Item, libraryID: number): boolean {
  return (
    !!item.id &&
    item.libraryID === libraryID &&
    Zotero.Items.get(item.id) === item &&
    !item.deleted &&
    item.isTopLevelItem() &&
    item.isEditable()
  );
}

/** Zotero accepts includeTrashed; the bundled SDK declaration omits the optional argument. */
function allCollectionIDs(item: Zotero.Item): number[] {
  return (
    item as Zotero.Item & { getCollections(includeTrashed: boolean): number[] }
  ).getCollections(true);
}

/** Each item owns a SQL transaction and its cache recovery; a move never commits just one leg. */
export async function applyCollectionMembership(
  items: readonly Zotero.Item[],
  scope: MembershipScope,
  isCurrent: () => boolean,
): Promise<CollectionBatchOutcome> {
  const creation = 'createTarget' in scope ? scope : undefined;
  const source = 'source' in scope ? scope.source : undefined;
  const present = 'present' in scope ? scope.present : true;
  const libraryID = 'target' in scope ? scope.target.libraryID : scope.libraryID;
  let target = 'target' in scope ? scope.target : undefined;
  if (source && source.libraryID !== libraryID)
    throw new Error('Collection move requires one library');

  function checkScope(destination: Zotero.Collection | undefined): void {
    if (!isCurrent()) throw new Error('Collection action is no longer current');
    writableLibrary(libraryID);
    creation?.checkParent();
    if (
      destination &&
      (writableCollection(destination.id) !== destination || destination.libraryID !== libraryID)
    )
      throw new Error('Collection target changed');
    if (source && (writableCollection(source.id) !== source || source.libraryID !== libraryID))
      throw new Error('Source collection changed');
  }

  checkScope(target);
  const result: CollectionBatchOutcome = { done: 0 };
  const unique = new Map<number | Zotero.Item, Zotero.Item>();
  for (const item of items) {
    const key = item.id || item;
    if (!unique.has(key)) unique.set(key, item);
  }
  let remaining = unique.size;
  for (const item of unique.values()) {
    let destination: Zotero.Collection | undefined = target;
    let scopeInvalid = false;
    let itemUnavailable = false;
    let committed = false;
    let attemptedCreation = false;
    let original: number[] | null | undefined;
    function validateScope(): void {
      scopeInvalid = true;
      checkScope(destination);
      scopeInvalid = false;
    }
    try {
      const outcome = await executeCollectionTransaction<MembershipChange>(
        async () => {
          validateScope();
          if (!writableCollectionItem(item, libraryID)) return 'unavailable';
          if (destination) {
            const collections = item.getCollections();
            if (source && !collections.includes(source.id)) return 'missingData';
            if (source ? source === destination : collections.includes(destination.id) === present)
              return 'unchanged';
          }
          // This owned hook precedes item.save's cache hooks. If a later hook throws, the
          // toolkit still rejects, but the batch can report the durable write separately.
          const db = Zotero.DB as unknown as {
            addCurrentCallback(type: 'commit', callback: () => void): void;
          };
          db.addCurrentCallback('commit', () => {
            committed = true;
          });
          if (!destination) {
            attemptedCreation = true;
            destination = await creation!.createTarget();
            validateScope();
            if (!writableCollectionItem(item, libraryID)) {
              itemUnavailable = true;
              throw new Error('Item target changed');
            }
          }
          original = attemptedCreation ? null : allCollectionIDs(item);
          if (present) item.addToCollection(destination.id);
          else item.removeFromCollection(destination.id);
          if (source) item.removeFromCollection(source.id);
          if ((await item.save()) === false) throw new Error('Collection membership was not saved');
          validateScope();
          if (!writableCollectionItem(item, libraryID)) {
            itemUnavailable = true;
            throw new Error('Item target changed');
          }
          return 'done';
        },
        {
          reportCommittedError: true,
          onRollback: async () => {
            const recovery: Promise<void>[] = [];
            if (original !== undefined) {
              const memberships = original;
              recovery.push(
                Promise.resolve().then(async () => {
                  // A rolled-back creation has already been unloaded by native callbacks.
                  // Reload without inspecting its ID through native membership methods.
                  try {
                    if (memberships) {
                      const current = allCollectionIDs(item);
                      for (const id of current)
                        if (!memberships.includes(id)) item.removeFromCollection(id);
                      for (const id of memberships)
                        if (!current.includes(id)) item.addToCollection(id);
                    }
                  } finally {
                    await item.reload(['primaryData', 'collections'], true);
                  }
                }),
              );
            }
            if (attemptedCreation) recovery.push(Promise.resolve().then(creation!.recoverCreation));
            for (const outcome of await Promise.allSettled(recovery))
              if (outcome.status === 'rejected')
                reportDiagnosticError(
                  logger,
                  'Collection rollback state restoration failed',
                  outcome.reason,
                );
          },
        },
      );
      if (outcome === 'done') {
        result.done += 1;
        target = destination;
      } else result[outcome] = (result[outcome] ?? 0) + 1;
    } catch (error) {
      if (committed) {
        result.done += 1;
        result.cacheWarning = true;
        target = destination;
      } else if (scopeInvalid) {
        if (!result.done) throw error;
        result.unavailable = (result.unavailable ?? 0) + remaining;
        break;
      } else if (itemUnavailable) {
        result.unavailable = (result.unavailable ?? 0) + 1;
      } else {
        reportDiagnosticError(logger, 'Collection membership could not be saved', error);
        result.failed = (result.failed ?? 0) + 1;
      }
    }
    remaining -= 1;
  }
  if (creation && target) result.collectionID = target.id;
  return result;
}

/** Apply changed direct memberships only, after identity and permission revalidation. */
export async function setCollectionMembership(
  items: readonly Zotero.Item[],
  collectionID: number,
  present: boolean,
  isCurrent: () => boolean = () => true,
): Promise<CollectionBatchOutcome> {
  return applyCollectionMembership(
    items,
    { target: writableCollection(collectionID), present },
    isCurrent,
  );
}

/** Move explicit direct members A→B without disturbing any other collection memberships. */
export async function moveCollectionItems(
  items: readonly Zotero.Item[],
  sourceID: number,
  targetID: number,
  isCurrent: () => boolean = () => true,
): Promise<CollectionBatchOutcome> {
  return applyCollectionMembership(
    items,
    { target: writableCollection(targetID), source: writableCollection(sourceID), present: true },
    isCurrent,
  );
}
