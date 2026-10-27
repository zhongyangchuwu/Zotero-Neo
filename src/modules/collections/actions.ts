import type { MainWindow } from '../../core/contracts';
import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import { moveCollectionItems, setCollectionMembership } from '../../operations/item-collections';
import {
  createCollection,
  createCollectionAndAdd,
  deleteCollection,
  moveCollection,
  renameCollection,
} from '../../operations/collections';
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
} from '../../toolkit/main';
import type { PickerItem } from '../../main/picker/model';
import { createCollectionCandidateProvider } from './providers/collections';
import { createCollectionItemsProvider } from './providers/items';
import type {
  PickerConfirmationResult,
  PickerContinuation,
  PickerProvider,
} from '../../main/picker/types';

export interface CollectionTargetRequest {
  readonly source: 'main' | 'reader';
  readonly resolveTargets: () => ItemTargetSet;
  readonly label: 'Selection' | 'context item';
}

export type CollectionConfirmation = (
  candidate: PickerItem,
  isCurrent: () => boolean,
  query: string,
) => PickerConfirmationResult | Promise<PickerConfirmationResult>;

export interface CollectionActionHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly isCurrent: () => boolean;
  readonly status: (message: string) => void;
  readonly navigate: (collectionID: number) => Promise<void>;
  readonly choose: (source: PickerProvider, confirm: CollectionConfirmation) => void;
  readonly captureCurrent: () => () => boolean;
}

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
  readonly #host: CollectionActionHost;
  #renameDraft: { readonly id: number; readonly name: string } | undefined;

  constructor(host: CollectionActionHost) {
    this.#host = host;
  }

  open(request: CollectionTargetRequest, present: boolean): void {
    const { window } = this.#host;
    const { resolveTargets } = request;
    this.start(() => {
      const initial = resolveCollectionMembershipTargets(resolveTargets());
      writable(initial.libraryID);
      const source = createCollectionCandidateProvider(initial.libraryID, {
        title: `${present ? 'Add' : 'Remove'} · ${initial.items.length} items · ${request.label}`,
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
      this.openPicker(source, async (candidate, isCurrent, query) => {
        const current = targets();
        writable(current.libraryID);
        if (candidate.collectionCandidate === 'create') {
          originalQuery = query;
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
          if (!isCurrent()) throw new Error('Collection workflow expired');
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
          this.#host.status(`✓ Created “${name}” and added ${confirmed.items.length} items`);
          return;
        }
        const id = candidateID(candidate, current.libraryID);
        const collection = currentCollection(id, current.libraryID);
        const changed = await setCollectionMembership(current.items, id, present, isCurrent);
        this.#host.status(
          changed
            ? `✓ ${present ? 'Added' : 'Removed'} ${changed} items ${present ? 'to' : 'from'} ${collection.path}`
            : `→ No collection membership changes for ${collection.path}`,
        );
      });
    });
  }

  find(): void {
    const { window } = this.#host;
    this.start(() => {
      const scope = mainCollectionLibrary(window);
      if (!scope) throw new Error('Choose one library scope to find collections');
      const source = createCollectionCandidateProvider(scope.libraryID, {
        title: `Find collections · ${scope.name}`,
        libraryName: scope.name,
      });
      this.openPicker(source, async (candidate, isCurrent) => {
        const collection = mainCollectionRef(Number(candidate.id));
        if (!collection || collection.libraryID !== scope.libraryID)
          throw new Error('Collection target is unavailable');
        if (!isCurrent()) throw new Error('Collection workflow expired');
        await this.#host.navigate(collection.id);
      });
    });
  }

  addItems(): void {
    const { window } = this.#host;
    this.start(() => {
      const collection = mainActiveCollection(window);
      if (!collection) throw new Error('Choose one active ordinary collection to add items');
      writable(collection.libraryID);
      this.openPicker(createCollectionItemsProvider(collection), async (candidate, isCurrent) => {
        currentCollection(collection.id, collection.libraryID);
        const item = await prepareMainCollectionItem(Number(candidate.id), collection.libraryID);
        const changed = await setCollectionMembership([item], collection.id, true, isCurrent);
        return {
          keepOpen: true,
          message: changed
            ? `Added “${candidate.title}” to ${collection.path}. Current filters remain unchanged; the item may be hidden. Esc ends; saved additions remain.`
            : `“${candidate.title}” is already directly assigned. No changes. Esc ends.`,
        };
      });
    });
  }

  moveItems(request: CollectionTargetRequest): void {
    const { window } = this.#host;
    const { resolveTargets } = request;
    this.start(() => {
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
        createCollectionCandidateProvider(source.libraryID, {
          title: `Move · ${initial.items.length} items · ${request.label} · from ${source.path}`,
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
          this.#host.status(`✓ Moved ${changed} items from ${source.path} to ${destination.path}`);
        },
      );
    });
  }

  move(): void {
    const { window } = this.#host;
    this.start(() => {
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
          this.#host.status(`✓ Moved collection ${target.name}`);
        },
      );
    });
  }

  create(): void {
    const { window } = this.#host;
    this.start(() => {
      const cursor = mainTreeFocused(window, 'collections')
        ? mainCursorCollection(window)
        : undefined;
      const scope = mainCollectionLibrary(window);
      const libraryID = cursor?.libraryID ?? scope?.libraryID;
      if (!libraryID) throw new Error('Choose one library scope to create a collection');
      writable(libraryID);
      let name = '';
      this.openPicker(
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
          if (!isCurrent()) throw new Error('Collection workflow expired');
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
          this.#host.status(`✓ Created “${name}” under ${parentPath}`);
        },
      );
    });
  }

  rename(): void {
    const { window } = this.#host;
    this.dialogAction(async (target, isCurrent) => {
      const draft = this.#renameDraft;
      const name = promptMainCollectionName(
        window,
        `Rename collection · ${target.path}`,
        draft?.id === target.id ? draft.name : target.name,
      );
      if (name === undefined) {
        this.#renameDraft = undefined;
        return;
      }
      this.#renameDraft = { id: target.id, name };
      if (!name.trim()) throw new Error('Collection name is required');
      currentCollection(target.id, target.libraryID);
      await renameCollection(target.id, name, isCurrent);
      this.#renameDraft = undefined;
      this.#host.status(`✓ Renamed ${target.path} to “${name}”`);
    });
  }

  removeCollection(): void {
    const { window } = this.#host;
    this.dialogAction(async (target, isCurrent) => {
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
      this.#host.status(`✓ Deleted ${target.path}; all items kept`);
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

  private openPicker(source: PickerProvider, confirm: CollectionConfirmation): void {
    this.#host.choose(source, confirm);
  }

  private dialogAction(
    action: (target: MainCollectionRef, isCurrent: () => boolean) => Promise<void>,
  ): void {
    this.start(() => {
      const target = this.target(this.#host.window);
      const isCurrent = this.#host.captureCurrent();
      void action(target, isCurrent).catch((error) => this.failure(error));
    });
  }

  private start(action: () => void): void {
    if (!this.#host.isCurrent()) return;
    try {
      action();
    } catch (error) {
      this.failure(error);
    }
  }

  private failure(error: unknown): void {
    this.#host.logger.debug(`collection workflow failed: ${String(error)}`);
    this.#host.status(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
}
