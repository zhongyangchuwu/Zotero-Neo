import { mainCollectionRefs } from '../../../toolkit/main';
import { fuzzyMatchScore } from '../fuzzy';
import type { PickerItem } from '../model';
import type { PickerProvider } from '../types';

export interface CollectionCandidateOptions {
  readonly title?: string;
  readonly libraryName?: string;
  readonly items?: readonly Zotero.Item[];
  readonly present?: boolean;
  readonly includeCreate?: boolean;
  readonly includeRoot?: boolean;
  readonly excludeIDs?: ReadonlySet<number>;
  readonly preferredID?: number;
}

/** Same-library identities only; coverage always means direct membership, never recursive visibility. */
export function createCollectionCandidateProvider(
  libraryID: number,
  options: CollectionCandidateOptions = {},
): PickerProvider {
  return {
    title: options.title ?? `Collections · ${options.libraryName ?? `Library ${libraryID}`}`,
    placeholder: 'Search collection names or full paths…',
    async load() {
      const coverage = new Map<number, number>();
      for (const item of options.items ?? []) {
        for (const id of new Set(item.getCollections()))
          coverage.set(id, (coverage.get(id) ?? 0) + 1);
      }
      const candidates = mainCollectionRefs(libraryID)
        .filter((collection) => !options.excludeIDs?.has(collection.id))
        .filter((collection) => options.present !== false || coverage.has(collection.id))
        .map((collection): PickerItem => {
          const count = coverage.get(collection.id) ?? 0;
          const membership = options.items
            ? `${count}/${options.items.length} direct${count === options.items.length ? ' · Already assigned' : ''}`
            : '';
          return {
            id: collection.id,
            title: collection.name,
            search: collection.path,
            kind: 'collection',
            collectionCandidate: 'collection',
            meta:
              [collection.path === collection.name ? '' : collection.path, membership]
                .filter(Boolean)
                .join(' · ') || undefined,
            preview: [collection.path, membership, `Library: ${options.libraryName ?? libraryID}`]
              .filter(Boolean)
              .join('\n'),
          };
        });
      if (options.preferredID !== undefined)
        candidates.sort(
          (a, b) => Number(b.id === options.preferredID) - Number(a.id === options.preferredID),
        );
      if (options.includeRoot)
        candidates.unshift({
          id: 'root',
          title: `${options.libraryName ?? `Library ${libraryID}`} / (root)`,
          search: 'root',
          collectionCandidate: 'root',
          preview: 'Create or move directly under this library root.',
        });
      if (options.includeCreate)
        candidates.push({
          id: 'create',
          title: 'New collection…',
          search: '',
          collectionCandidate: 'create',
          preview: `Choose a parent, name the collection, then confirm creating and adding ${options.items?.length ?? 0} items.`,
        });
      return candidates;
    },
    filterItems(items, query) {
      const needle = query.trim();
      const ranked = items
        .filter((item) => item.collectionCandidate !== 'create')
        .map((item) => ({ item, score: needle ? fuzzyMatchScore(item.search, needle) : 0 }))
        .filter((entry): entry is { item: PickerItem; score: number } => entry.score !== null)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item);
      return [
        ...ranked.slice(0, options.includeCreate ? 99 : 100),
        ...items.filter((item) => item.collectionCandidate === 'create'),
      ];
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
    emptyText: (query) =>
      options.present === false
        ? query
          ? `No assigned collections match “${query}”`
          : 'These items have no direct collection memberships'
        : query
          ? `No collections match “${query}”`
          : 'No collections available',
  };
}
