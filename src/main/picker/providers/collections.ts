import type { PickerItem } from '../model';
import type { PickerProvider } from '../types';

type CollectionRecord = {
  readonly id: number;
  readonly name: string;
  readonly parentID?: number | false;
  readonly libraryID: number;
};

function collectionPath(
  collection: CollectionRecord,
  byID: ReadonlyMap<number, CollectionRecord>,
): string {
  const names: string[] = [collection.name];
  const seen = new Set<number>([collection.id]);
  let parentID = collection.parentID || undefined;
  while (parentID && !seen.has(parentID)) {
    seen.add(parentID);
    const parent = byID.get(parentID);
    if (!parent) break;
    names.unshift(parent.name);
    parentID = parent.parentID || undefined;
  }
  return names.join(' / ');
}

/**
 * Pure target source for collection-membership actions.
 *
 * It is intentionally restricted to one library and performs no mutation.
 */
export function createCollectionCandidateProvider(libraryID: number): PickerProvider {
  return {
    title: 'Collections',
    placeholder: 'Choose a collection…',
    async load() {
      const collections = (
        Zotero.Collections.getByLibrary(libraryID, true) as unknown as CollectionRecord[]
      ).filter((collection) => collection.libraryID === libraryID);
      const byID = new Map(collections.map((collection) => [collection.id, collection]));
      return collections.map((collection): PickerItem => {
        const path = collectionPath(collection, byID);
        return {
          id: collection.id,
          title: collection.name,
          search: path,
          kind: 'collection',
          meta: path === collection.name ? undefined : path,
          preview: path,
        };
      });
    },
    rowText(item) {
      return item.meta ? `${item.title} · ${item.meta}` : item.title;
    },
    preview(item) {
      return {
        title: item.title,
        body: [item.preview ?? item.title, `Collection ID: ${item.id}`].join('\n'),
      };
    },
    emptyText: (query) => (query ? `No collections match “${query}”` : 'No collections available'),
  };
}
