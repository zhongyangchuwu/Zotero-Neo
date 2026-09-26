import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { PickerItem } from './picker/model';
import { createCollectionCandidateProvider } from './picker/providers/collections';
import type { FuzzyPicker } from './picker';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';
import type { MainCurrentTarget } from './action-targets';
import { resolveItemTargets, type ItemTargetContext } from './item-targets';

export interface CollectionMembershipTargets {
  readonly items: readonly Zotero.Item[];
  readonly libraryID: number;
  readonly signature: string;
}

function targetSignature(items: readonly Zotero.Item[]): string {
  return [...new Set(items.map((item) => `${item.libraryID}:${item.id}`))].sort().join('|');
}

function collectionIDs(item: Zotero.Item): readonly number[] {
  try {
    return item.getCollections?.() ?? [];
  } catch {
    return [];
  }
}

export function resolveCollectionMembershipTargets(
  window: MainWindow,
  session: MainWindowSession,
  context: ItemTargetContext = 'main',
  currentTarget?: MainCurrentTarget | null,
): CollectionMembershipTargets {
  const resolved = resolveItemTargets(window, session, context, currentTarget);
  if (resolved.missing)
    throw new Error(
      context === 'main' ? 'Selection contains unavailable items' : 'Context item is unavailable',
    );
  if (!resolved.total || !resolved.items.length) throw new Error('No item target');

  const items = [...resolved.items];
  if (!items.length) throw new Error('No top-level item target');

  const libraries = new Set(items.map((item) => item.libraryID));
  if (libraries.size !== 1) throw new Error('Collection membership requires one library');
  const libraryID = items[0]!.libraryID;
  if (!Number.isInteger(libraryID) || libraryID <= 0)
    throw new Error('Target library is unavailable');

  return {
    items,
    libraryID,
    signature: targetSignature(items),
  };
}

type MembershipTransition = {
  readonly item: Zotero.Item;
  readonly wasMember: boolean;
};

export async function setCollectionMembership(
  items: readonly Zotero.Item[],
  collectionID: number,
  present: boolean,
): Promise<number> {
  const transitions: MembershipTransition[] = [];
  for (const item of items) {
    const wasMember = collectionIDs(item).includes(collectionID);
    if (wasMember === present) continue;
    transitions.push({ item, wasMember });
  }
  if (!transitions.length) return 0;

  try {
    await Zotero.DB.executeTransaction(async () => {
      for (const { item } of transitions) {
        if (present) item.addToCollection(collectionID);
        else item.removeFromCollection(collectionID);
        await item.save();
      }
    });
  } catch (error) {
    for (const { item, wasMember } of transitions) {
      const isMember = collectionIDs(item).includes(collectionID);
      if (isMember === wasMember) continue;
      if (wasMember) item.addToCollection(collectionID);
      else item.removeFromCollection(collectionID);
    }
    throw error;
  }

  return transitions.length;
}

export class CollectionMembershipActions {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;

  constructor(logger: Logger, navigation: MainNavigation, picker: FuzzyPicker) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#picker = picker;
  }

  open(
    window: MainWindow,
    session: MainWindowSession,
    present: boolean,
    context: ItemTargetContext = 'main',
    currentTarget?: MainCurrentTarget | null,
  ): void {
    let initial: CollectionMembershipTargets;
    try {
      initial = resolveCollectionMembershipTargets(window, session, context, currentTarget);
    } catch (error) {
      this.#navigation.status(session, `✗ ${String((error as Error).message ?? error)}`);
      return;
    }

    void this.#picker.open(window, session, 'collections', {
      closeBeforeConfirm: true,
      source: createCollectionCandidateProvider(initial.libraryID),
      confirm: async (candidate: PickerItem) => {
        try {
          const current = resolveCollectionMembershipTargets(
            window,
            session,
            context,
            currentTarget,
          );
          if (current.libraryID !== initial.libraryID || current.signature !== initial.signature) {
            this.#navigation.status(session, '✗ Collection target changed; retry');
            return;
          }

          const collectionID = Number(candidate.id);
          const collection = Zotero.Collections.get(collectionID);
          if (!collection || collection.libraryID !== current.libraryID) {
            this.#navigation.status(session, '✗ Collection target is unavailable');
            return;
          }

          const changed = await setCollectionMembership(current.items, collectionID, present);
          this.#navigation.status(
            session,
            changed
              ? `✓ ${present ? 'Added' : 'Removed'} ${changed} item${changed === 1 ? '' : 's'} ${present ? 'to' : 'from'} ${collection.name}`
              : `→ No collection membership changes for ${collection.name}`,
          );
        } catch (error) {
          this.#logger.debug(`collection membership failed: ${String(error)}`);
          this.#navigation.status(session, '✗ Collection membership failed');
        }
      },
    });
  }
}
