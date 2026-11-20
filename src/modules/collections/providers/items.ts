import { citationKey } from '../../../platform/better-bibtex';
import {
  mainItemTypeIcon,
  queryMainCollectionItems,
  type MainCollectionRef,
} from '../../../toolkit/main';
import { t, type AppLanguage } from '../../../i18n';
import type { PickerItem } from '../../../main/picker/model';
import type { PickerProvider } from '../../../main/picker/types';

const RESULT_LIMIT = 100;

export function createCollectionItemsProvider(
  collection: MainCollectionRef,
  language: AppLanguage = 'en',
): PickerProvider {
  const text = (key: string): string => t(`picker.${key}`, language);
  const query = async (needle: string): Promise<PickerItem[]> => {
    const items = await queryMainCollectionItems(collection.libraryID, needle, RESULT_LIMIT);
    return items.map((item) => {
      const creator = item.getCreators?.()[0];
      const author =
        creator?.lastName ?? (creator as typeof creator & { name?: string })?.name ?? '';
      const year = item.getField('year') ?? '';
      const title = item.getField('title');
      const assigned = item.getCollections().includes(collection.id);
      return {
        id: item.id,
        title: title || text('untitled'),
        search: title || '(untitled)',
        author,
        year,
        citekey: citationKey(item),
        bibliography: { icon: mainItemTypeIcon(item) },
        meta: text(assigned ? 'itemAlreadyAssigned' : 'addItem'),
        preview: `${collection.path}\n${text(assigned ? 'itemAlreadyAssigned' : 'addItem')}\n${text('otherMembershipsPreserved')}`,
      };
    });
  };
  return {
    title: text('addItemsToCollection').replace('{path}', () => collection.path),
    placeholder: text('searchItemsInLibrary'),
    help: {
      query: text('savedItemsStay'),
      list: text('savedItemsStay'),
    },
    load: () => query(''),
    query,
    rowText: (item) => item.title,
    preview: (item) => ({ title: item.title, body: item.preview ?? item.title }),
    emptyText: (query) =>
      query ? text('noMatchingItems').replace('{query}', () => query) : text('noItemsInLibrary'),
    countText: (count) =>
      `${text('resultCount').replace('{count}', String(count))}${count === RESULT_LIMIT ? ` ${text('resultLimit')}` : ''}`,
  };
}
