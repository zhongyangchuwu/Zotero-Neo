import type { MainWindow } from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import type { Logger } from '../core/logging';
import { moveCollectionItems, setCollectionMembership } from '../operations/item-collections';
import {
  createCollection,
  createCollectionAndAdd,
  deleteCollection,
  moveCollection,
  renameCollection,
} from '../operations/collections';
import {
  confirmMainCollectionAction,
  mainActiveCollection,
  mainCollectionLibrary,
  mainCollectionRef,
  mainCollectionRefs,
  mainCursorCollection,
  mainLibraryWritable,
  mainTreeFocused,
  prepareMainCollectionItem,
  promptMainCollectionName,
  type MainCollectionRef,
} from '../toolkit/main';
import type { PickerItem } from './picker/model';
import { createCollectionCandidateProvider } from './picker/providers/collections';
import { createCollectionItemsProvider } from './picker/providers/collection-items';
import type { PickerConfirmationResult, PickerContinuation, PickerProvider } from './picker/types';
import type { FuzzyPicker } from './picker';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';

export interface CollectionMembershipTargets {
  readonly items: readonly Zotero.Item[];
  readonly libraryID: number;
  readonly signature: string;
  readonly source: ItemTargetSet['source'];
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
  if (items.some((item) => item.libraryID !== libraryID))
    throw new Error('Collection membership requires one library');
  if (!Number.isInteger(libraryID) || libraryID <= 0)
    throw new Error('Target library is unavailable');
  return { items, libraryID, signature: targetSignature(items), source: resolved.source };
}

function writable(libraryID: number): void {
  if (!mainLibraryWritable(libraryID)) throw new Error('This library is read-only or unavailable');
}

function currentCollection(id: number, libraryID: number): MainCollectionRef {
  const collection = mainCollectionRef(id);
  if (!collection || collection.libraryID !== libraryID)
    throw new Error('Collection target is unavailable');
  writable(libraryID);
  return collection;
}

function candidateID(candidate: PickerItem, libraryID: number): number {
  const id = Number(candidate.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Choose an ordinary collection');
  return currentCollection(id, libraryID).id;
}

export class CollectionMembershipActions {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;
  readonly #navigate: (
    window: MainWindow,
    session: MainWindowSession,
    collectionID: number,
  ) => Promise<void>;
  readonly #renameDrafts = new WeakMap<
    MainWindowSession,
    { readonly id: number; readonly name: string }
  >();

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    picker: FuzzyPicker,
    navigate: (
      window: MainWindow,
      session: MainWindowSession,
      collectionID: number,
    ) => Promise<void>,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#picker = picker;
    this.#navigate = navigate;
  }

  open(
    window: MainWindow,
    session: MainWindowSession,
    present: boolean,
    resolveTargets: () => ItemTargetSet,
  ): void {
    this.start(session, () => {
      const initial = resolveCollectionMembershipTargets(resolveTargets());
      writable(initial.libraryID);
      const source = createCollectionCandidateProvider(initial.libraryID, {
        title: `${present ? 'Add' : 'Remove'} · ${initial.items.length} items · ${initial.source === 'main' && session.selection.size ? 'Selection' : 'context item'}`,
        items: initial.items,
        present,
        includeCreate: present,
        preferredID: mainActiveCollection(window)?.id,
      });
      let creating = false;
      let originalQuery = '';
      let name = '';
      const targets = (): CollectionMembershipTargets => {
        const current = resolveCollectionMembershipTargets(resolveTargets());
        if (
          current.source !== initial.source ||
          current.libraryID !== initial.libraryID ||
          current.signature !== initial.signature
        )
          throw new Error('Collection target changed; retry');
        return current;
      };
      this.openPicker(window, session, source, async (candidate, isCurrent) => {
        const current = targets();
        writable(current.libraryID);
        if (candidate.collectionCandidate === 'create') {
          originalQuery = session.picker.committedQuery;
          creating = true;
          return {
            keepOpen: true,
            query: '',
            source: createCollectionCandidateProvider(current.libraryID, {
              title: 'New collection · choose parent',
              includeRoot: true,
            }),
          };
        }
        if (creating) {
          const parentID =
            candidate.collectionCandidate === 'root'
              ? false
              : candidateID(candidate, current.libraryID);
          const parentPath = parentID
            ? currentCollection(parentID, current.libraryID).path
            : `Library ${current.libraryID} / (root)`;
          const input = promptMainCollectionName(
            window,
            `Create and add ${current.items.length} items · ${parentPath}`,
            name,
          );
          const back = (): PickerContinuation => {
            creating = false;
            return { keepOpen: true, source, query: originalQuery };
          };
          if (input === undefined) return back();
          name = input;
          if (!name.trim()) throw new Error('Collection name is required');
          if (
            !confirmMainCollectionAction(
              window,
              'Create collection and add items',
              `Create “${name}” under ${parentPath} and add ${current.items.length} items? Other memberships are preserved.`,
            )
          )
            return back();
          if (!isCurrent()) throw new Error('Collection workflow expired');
          const confirmed = targets();
          await createCollectionAndAdd(
            confirmed.items,
            confirmed.libraryID,
            name,
            parentID,
            isCurrent,
          );
          this.#navigation.status(
            session,
            `✓ Created “${name}” and added ${confirmed.items.length} items`,
          );
          return;
        }
        const id = candidateID(candidate, current.libraryID);
        const collection = currentCollection(id, current.libraryID);
        const changed = await setCollectionMembership(current.items, id, present, isCurrent);
        this.#navigation.status(
          session,
          changed
            ? `✓ ${present ? 'Added' : 'Removed'} ${changed} items ${present ? 'to' : 'from'} ${collection.path}`
            : `→ No collection membership changes for ${collection.path}`,
        );
      });
    });
  }

  find(window: MainWindow, session: MainWindowSession): void {
    this.start(session, () => {
      const scope = mainCollectionLibrary(window);
      if (!scope) throw new Error('Choose one library scope to find collections');
      const source = createCollectionCandidateProvider(scope.libraryID, {
        title: `Find collections · ${scope.name}`,
        libraryName: scope.name,
      });
      this.openPicker(window, session, source, async (candidate, isCurrent) => {
        const collection = mainCollectionRef(Number(candidate.id));
        if (!collection || collection.libraryID !== scope.libraryID)
          throw new Error('Collection target is unavailable');
        if (!isCurrent()) throw new Error('Collection workflow expired');
        await this.#navigate(window, session, collection.id);
      });
    });
  }

  addItems(window: MainWindow, session: MainWindowSession): void {
    this.start(session, () => {
      const collection = mainActiveCollection(window);
      if (!collection) throw new Error('Choose one active ordinary collection to add items');
      writable(collection.libraryID);
      this.openPicker(
        window,
        session,
        createCollectionItemsProvider(collection),
        async (candidate, isCurrent) => {
          currentCollection(collection.id, collection.libraryID);
          const item = await prepareMainCollectionItem(Number(candidate.id), collection.libraryID);
          const changed = await setCollectionMembership([item], collection.id, true, isCurrent);
          return {
            keepOpen: true,
            message: changed
              ? `Added “${candidate.title}” to ${collection.path}. Current filters remain unchanged; the item may be hidden. Esc ends; saved additions remain.`
              : `“${candidate.title}” is already directly assigned. No changes. Esc ends.`,
          };
        },
      );
    });
  }

  moveItems(
    window: MainWindow,
    session: MainWindowSession,
    resolveTargets: () => ItemTargetSet,
  ): void {
    this.start(session, () => {
      const source = mainActiveCollection(window);
      if (!source)
        throw new Error(
          'Move requires one active ordinary source collection; use Add to collection instead',
        );
      const initial = resolveCollectionMembershipTargets(resolveTargets());
      const targets = (): CollectionMembershipTargets => {
        const current = resolveCollectionMembershipTargets(resolveTargets());
        const active = mainActiveCollection(window);
        if (
          active?.id !== source.id ||
          active.libraryID !== source.libraryID ||
          current.source !== initial.source ||
          current.signature !== initial.signature ||
          current.libraryID !== source.libraryID ||
          current.items.some((item) => !item.getCollections().includes(source.id))
        )
          throw new Error(
            'Move requires unchanged targets directly assigned to the active source; use Add to collection instead',
          );
        currentCollection(source.id, source.libraryID);
        return current;
      };
      targets();
      this.openPicker(
        window,
        session,
        createCollectionCandidateProvider(source.libraryID, {
          title: `Move · ${initial.items.length} items · ${initial.source === 'main' && session.selection.size ? 'Selection' : 'context item'} · from ${source.path}`,
          excludeIDs: new Set([source.id]),
        }),
        async (candidate, isCurrent) => {
          const current = targets();
          const destination = currentCollection(
            candidateID(candidate, source.libraryID),
            source.libraryID,
          );
          const changed = await moveCollectionItems(
            current.items,
            source.id,
            destination.id,
            isCurrent,
          );
          this.#navigation.status(
            session,
            `✓ Moved ${changed} items from ${source.path} to ${destination.path}`,
          );
        },
      );
    });
  }

  move(window: MainWindow, session: MainWindowSession): void {
    this.start(session, () => {
      const target = this.target(window);
      const excluded = new Set([target.id]);
      const refs = mainCollectionRefs(target.libraryID);
      let changed = true;
      while (changed) {
        changed = false;
        for (const ref of refs) {
          if (ref.parentID && excluded.has(ref.parentID) && !excluded.has(ref.id)) {
            excluded.add(ref.id);
            changed = true;
          }
        }
      }
      this.openPicker(
        window,
        session,
        createCollectionCandidateProvider(target.libraryID, {
          title: `Move collection · ${target.path}`,
          includeRoot: true,
          excludeIDs: excluded,
        }),
        async (candidate, isCurrent) => {
          currentCollection(target.id, target.libraryID);
          const parentID =
            candidate.collectionCandidate === 'root'
              ? false
              : candidateID(candidate, target.libraryID);
          await moveCollection(target.id, parentID, isCurrent);
          this.#navigation.status(session, `✓ Moved collection ${target.name}`);
        },
      );
    });
  }

  create(window: MainWindow, session: MainWindowSession): void {
    this.start(session, () => {
      const cursor = mainTreeFocused(window, 'collections')
        ? mainCursorCollection(window)
        : undefined;
      const scope = mainCollectionLibrary(window);
      const libraryID = cursor?.libraryID ?? scope?.libraryID;
      if (!libraryID) throw new Error('Choose one library scope to create a collection');
      writable(libraryID);
      let name = '';
      this.openPicker(
        window,
        session,
        createCollectionCandidateProvider(libraryID, {
          title: 'Create collection · choose parent',
          libraryName: scope?.name,
          includeRoot: true,
          preferredID: cursor?.id ?? mainActiveCollection(window)?.id,
        }),
        async (candidate, isCurrent) => {
          const parentID =
            candidate.collectionCandidate === 'root' ? false : candidateID(candidate, libraryID);
          const parentPath = parentID
            ? currentCollection(parentID, libraryID).path
            : `Library ${libraryID} / (root)`;
          const input = promptMainCollectionName(window, `New collection · ${parentPath}`, name);
          if (input === undefined) return { keepOpen: true };
          name = input;
          if (!name.trim()) throw new Error('Collection name is required');
          if (
            !confirmMainCollectionAction(
              window,
              'Create collection',
              `Create “${name}” under ${parentPath}?`,
            )
          )
            return { keepOpen: true };
          if (!isCurrent()) throw new Error('Collection workflow expired');
          await createCollection(libraryID, name, parentID, isCurrent);
          this.#navigation.status(session, `✓ Created “${name}” under ${parentPath}`);
        },
      );
    });
  }

  rename(window: MainWindow, session: MainWindowSession): void {
    this.dialogAction(window, session, async (target, isCurrent) => {
      const draft = this.#renameDrafts.get(session);
      const name = promptMainCollectionName(
        window,
        `Rename collection · ${target.path}`,
        draft?.id === target.id ? draft.name : target.name,
      );
      if (name === undefined) {
        this.#renameDrafts.delete(session);
        return;
      }
      this.#renameDrafts.set(session, { id: target.id, name });
      if (!name.trim()) throw new Error('Collection name is required');
      currentCollection(target.id, target.libraryID);
      await renameCollection(target.id, name, isCurrent);
      this.#renameDrafts.delete(session);
      this.#navigation.status(session, `✓ Renamed ${target.path} to “${name}”`);
    });
  }

  removeCollection(window: MainWindow, session: MainWindowSession): void {
    this.dialogAction(window, session, async (target, isCurrent) => {
      if (
        !confirmMainCollectionAction(
          window,
          'Delete collection — keep items',
          `Delete ${target.path} and its subcollections? All items are kept in the library. Neo item undo does not restore collection structure.`,
        )
      )
        return;
      currentCollection(target.id, target.libraryID);
      await deleteCollection(target.id, isCurrent);
      this.#navigation.status(session, `✓ Deleted ${target.path}; all items kept`);
    });
  }

  private target(window: MainWindow): MainCollectionRef {
    const target = mainTreeFocused(window, 'collections')
      ? mainCursorCollection(window)
      : mainActiveCollection(window);
    if (!target)
      throw new Error('Choose one ordinary collection; multiple selections are not supported');
    return currentCollection(target.id, target.libraryID);
  }

  private openPicker(
    window: MainWindow,
    session: MainWindowSession,
    source: PickerProvider,
    confirm: (
      candidate: PickerItem,
      isCurrent: () => boolean,
    ) => Promise<PickerConfirmationResult> | PickerConfirmationResult,
  ): void {
    if (session.picker.open) return;
    const generation = session.picker.generation + 1;
    const isCurrent = (): boolean =>
      !session.cleanup.disposed &&
      !window.closed &&
      session.picker.open &&
      session.picker.generation === generation;
    void this.#picker.open(window, session, 'collections', {
      source,
      confirm: (candidate) => {
        if (!isCurrent()) throw new Error('Collection workflow expired');
        return confirm(candidate, isCurrent);
      },
    });
  }

  private dialogAction(
    window: MainWindow,
    session: MainWindowSession,
    action: (target: MainCollectionRef, isCurrent: () => boolean) => Promise<void>,
  ): void {
    this.start(session, () => {
      const target = this.target(window);
      const generation = session.picker.generation;
      const isCurrent = (): boolean =>
        !session.cleanup.disposed && session.picker.generation === generation && !window.closed;
      void action(target, isCurrent).catch((error) => this.failure(session, error));
    });
  }

  private start(session: MainWindowSession, action: () => void): void {
    if (session.cleanup.disposed) return;
    try {
      action();
    } catch (error) {
      this.failure(session, error);
    }
  }

  private failure(session: MainWindowSession, error: unknown): void {
    this.#logger.debug(`collection workflow failed: ${String(error)}`);
    this.#navigation.status(session, `✗ ${error instanceof Error ? error.message : String(error)}`);
  }
}
