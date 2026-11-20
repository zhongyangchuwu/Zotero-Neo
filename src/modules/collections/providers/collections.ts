import { mainCollectionRefs } from '../../../toolkit/main';
import { t, type AppLanguage } from '../../../i18n';
import { fuzzyMatchScore } from '../../../ui/fuzzy';
import type { PickerItem } from '../../../main/picker/model';
import type { PickerProvider } from '../../../main/picker/types';

export interface CollectionCandidateOptions {
  readonly title?: string;
  readonly libraryName?: string;
  readonly memberships?: readonly (readonly number[])[];
  readonly present?: boolean;
  readonly includeCreate?: boolean;
  readonly includeRoot?: boolean;
  readonly excludeIDs?: ReadonlySet<number>;
  readonly preferredID?: number;
  readonly language?: AppLanguage;
}

/** Same-library identities only; coverage always means direct membership, never recursive visibility. */
export function createCollectionCandidateProvider(
  libraryID: number,
  options: CollectionCandidateOptions = {},
): PickerProvider {
  const language = options.language ?? 'en';
  const text = (key: string): string => t(`picker.${key}`, language);
  const library = options.libraryName ?? text('libraryName').replace('{id}', String(libraryID));
  return {
    title: options.title ?? `${text('collections')} · ${library}`,
    placeholder: text('searchCollections'),
    async load() {
      const coverage = new Map<number, number>();
      const itemCount = options.memberships?.length;
      for (const ids of options.memberships ?? []) {
        for (const id of new Set(ids)) coverage.set(id, (coverage.get(id) ?? 0) + 1);
      }
      const candidates = mainCollectionRefs(libraryID)
        .filter((collection) => !options.excludeIDs?.has(collection.id))
        .filter((collection) => options.present !== false || coverage.has(collection.id))
        .map((collection): PickerItem => {
          const count = coverage.get(collection.id) ?? 0;
          const membership =
            itemCount !== undefined
              ? `${text('directMembership').replace('{count}', String(count)).replace('{total}', String(itemCount))}${count === itemCount ? ` · ${text('alreadyAssigned')}` : ''}`
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
            preview: [
              collection.path,
              membership,
              text('libraryLabel').replace('{library}', () => library),
            ]
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
          title: `${library} / ${text('libraryRoot')}`,
          search: 'root',
          collectionCandidate: 'root',
          preview: text('useLibraryRoot'),
        });
      if (options.includeCreate)
        candidates.push({
          id: 'create',
          title: text('newCollection'),
          search: '',
          collectionCandidate: 'create',
          preview: text('newCollectionSteps').replace('{count}', String(itemCount ?? 0)),
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
        body: [
          item.preview ?? item.title,
          text('collectionId').replace('{id}', String(item.id)),
        ].join('\n'),
      };
    },
    emptyText: (query) =>
      options.present === false
        ? query
          ? text('noMatchingAssignedCollections').replace('{query}', () => query)
          : text('noAssignedCollections')
        : query
          ? text('noMatchingCollections').replace('{query}', () => query)
          : text('noCollections'),
  };
}
