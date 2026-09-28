import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import type { Logger } from '../core/logging';
import { setCollectionMembership } from '../operations/item-collections';
import type { PickerItem } from './picker/model';
import { createCollectionCandidateProvider } from './picker/providers/collections';
import type { FuzzyPicker } from './picker';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';

export interface CollectionMembershipTargets {
  readonly items: readonly Zotero.Item[];
  readonly libraryID: number;
  readonly signature: string;
}

function targetSignature(items: readonly Zotero.Item[]): string {
  return [...new Set(items.map((item) => `${item.libraryID}:${item.id}`))].sort().join('|');
}

export function resolveCollectionMembershipTargets(
  resolved: ItemTargetSet,
): CollectionMembershipTargets {
  if (resolved.missing)
    throw new Error(
      resolved.source === 'main'
        ? 'Selection contains unavailable items'
        : 'Context item is unavailable',
    );
  if (!resolved.total || !resolved.items.length) throw new Error('No item target');

  const items = resolved.items;
  const libraryID = items[0]!.libraryID;
  for (let index = 1; index < items.length; index += 1)
    if (items[index]?.libraryID !== libraryID)
      throw new Error('Collection membership requires one library');
  if (!Number.isInteger(libraryID) || libraryID <= 0)
    throw new Error('Target library is unavailable');

  return { items, libraryID, signature: targetSignature(items) };
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
    resolveTargets: () => ItemTargetSet,
  ): void {
    let initial: CollectionMembershipTargets;
    try {
      initial = resolveCollectionMembershipTargets(resolveTargets());
    } catch (error) {
      this.#navigation.status(session, `✗ ${String((error as Error).message ?? error)}`);
      return;
    }

    void this.#picker.open(window, session, 'collections', {
      closeBeforeConfirm: true,
      source: createCollectionCandidateProvider(initial.libraryID),
      confirm: async (candidate: PickerItem) => {
        let current: CollectionMembershipTargets;
        try {
          current = resolveCollectionMembershipTargets(resolveTargets());
        } catch (error) {
          this.#logger.debug(`collection target changed: ${String(error)}`);
          this.#navigation.status(session, '✗ Collection target changed; retry');
          return;
        }
        if (current.libraryID !== initial.libraryID || current.signature !== initial.signature) {
          this.#navigation.status(session, '✗ Collection target changed; retry');
          return;
        }

        try {
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
