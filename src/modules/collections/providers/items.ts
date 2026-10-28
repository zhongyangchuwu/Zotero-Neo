import { citationKey } from '../../../platform/better-bibtex';
import { queryMainCollectionItems, type MainCollectionRef } from '../../../toolkit/main';
import type { PickerItem } from '../../../main/picker/model';
import type { PickerProvider } from '../../../main/picker/types';
import { itemRowText } from '../../../main/picker/item-row';

const RESULT_LIMIT = 100;

export function createCollectionItemsProvider(collection: MainCollectionRef): PickerProvider {
  const query = async (text: string): Promise<PickerItem[]> => {
    const items = await queryMainCollectionItems(collection.libraryID, text, RESULT_LIMIT);
    return items.map((item) => {
      const creator = item.getCreators?.()[0];
      const author =
        creator?.lastName ?? (creator as typeof creator & { name?: string })?.name ?? '';
      const year = item.getField('year') ?? '';
      const title = item.getField('title') || '(untitled)';
      const assigned = item.getCollections().includes(collection.id);
      return {
        id: item.id,
        title,
        search: title,
        author,
        year,
        citekey: citationKey(item),
        meta: assigned ? 'Already directly assigned · no change' : 'Enter to add',
        preview: `${collection.path}\n${assigned ? 'Already directly assigned' : 'Add to this collection'}\nOther memberships and current filters are preserved.`,
      };
    });
  };
  return {
    title: `Add items → ${collection.path}`,
    placeholder: 'Search items in this library…',
    help: {
      query: 'Enter adds · Esc ends (saved additions remain)',
      list: 'Enter adds · Esc ends',
    },
    loadingText: 'Searching this library…',
    load: () => query(''),
    query,
    rowText: (item) => `${itemRowText(item)} · ${item.meta}`,
    preview: (item) => ({ title: item.title, body: item.preview ?? item.title }),
    emptyText: (text) => (text ? `No items match “${text}”` : 'No items available in this library'),
    countText: (count) => `${count} results${count === RESULT_LIMIT ? ' (limit)' : ''}`,
  };
}
