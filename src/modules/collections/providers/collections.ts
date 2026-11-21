import { mainCollectionRefs } from '../../../toolkit/main';
import { t, type AppLanguage } from '../../../i18n';
import { fuzzyMatchScore } from '../../../ui/fuzzy';
import type { PickerColumn, PickerItem } from '../../../main/picker/model';
import type { PickerProvider } from '../../../main/picker/types';

export interface CollectionCandidateOptions {
  readonly title?: string;
  readonly presentation?: 'compact';
  readonly help?: PickerProvider['help'];
  readonly libraryName?: string;
  readonly memberships?: readonly (readonly number[])[];
  readonly targetCount?: number;
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
  const compact = options.presentation === 'compact';
  return {
    title: options.title ?? `${text('collections')} · ${library}`,
    placeholder: text('searchCollections'),
    help: options.help,
    async load() {
      const coverage = new Map<number, number>();
      const memberships = options.memberships;
      const itemCount = options.targetCount ?? memberships?.length;
      const badgeTotal =
        itemCount !== undefined && (itemCount > 1 || options.present === true)
          ? itemCount
          : undefined;
      for (const ids of memberships ?? []) {
        for (const id of new Set(ids)) coverage.set(id, (coverage.get(id) ?? 0) + 1);
      }
      const candidates = mainCollectionRefs(libraryID)
        .filter((collection) => !options.excludeIDs?.has(collection.id))
        .filter((collection) => options.present !== false || coverage.has(collection.id))
        .map((collection): PickerItem => {
          const count = coverage.get(collection.id) ?? 0;
          if (compact) {
            const parentPath = collection.parentID
              ? collection.path.slice(0, -(collection.name.length + ' / '.length))
              : '';
            const columns: PickerColumn[] = [
              { text: collection.name, role: 'primary', weight: 2 },
              { text: parentPath, role: 'muted', weight: 1 },
            ];
            if (badgeTotal !== undefined) {
              const textValue =
                badgeTotal > 1
                  ? `${count}/${badgeTotal}${count === badgeTotal ? ' ✓' : ''}`
                  : count === 1
                    ? `✓ ${text('collectionAssigned')}`
                    : '';
              columns.push({ text: textValue, role: 'badge', align: 'end' });
            }
            return {
              id: collection.id,
              title: collection.name,
              search: collection.path,
              collectionCandidate: 'collection',
              icon: 'folder',
              columns,
            };
          }
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
      if (options.includeRoot) {
        const title = compact ? text('libraryRoot') : `${library} / ${text('libraryRoot')}`;
        candidates.unshift({
          id: 'root',
          title,
          search: 'root',
          collectionCandidate: 'root',
          ...(compact
            ? {
                icon: 'folder',
                columns: [
                  { text: title, role: 'primary', weight: 2 },
                  { text: library, role: 'muted', weight: 1 },
                ],
              }
            : { preview: text('useLibraryRoot') }),
        });
      }
      if (options.includeCreate) {
        const title = text('newCollection');
        candidates.push({
          id: 'create',
          title,
          search: '',
          collectionCandidate: 'create',
          ...(compact
            ? {
                kind: 'action',
                selectable: false,
                icon: 'plus',
                columns: [{ text: title, role: 'primary' }],
              }
            : { preview: text('newCollectionSteps').replace('{count}', String(itemCount ?? 0)) }),
        });
      }
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
      const body = compact
        ? item.columns
            ?.slice(1)
            .map((column) => column.text)
            .filter(Boolean)
            .join('\n') || item.title
        : [item.preview ?? item.title, text('collectionId').replace('{id}', String(item.id))].join(
            '\n',
          );
      return { title: item.title, body };
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
