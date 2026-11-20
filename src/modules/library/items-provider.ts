import type { MainWindow } from '../../core/contracts';
import { citationKey } from '../../platform/better-bibtex';
import { mainItem, mainItemTypeIcon, mainSelectedCollection } from '../../toolkit/main';
import { t, type AppLanguage } from '../../i18n';
import type { PickerItem, PickerScope } from '../../main/picker/model';
import type { PickerPreviewSection, PickerProvider } from '../../main/picker/types';

const MAX_CHILD_PREVIEW_ITEMS = 6;

function title(item: Zotero.Item | undefined, fallback: string): string {
  try {
    return item?.getDisplayTitle?.().trim() || item?.getField('title')?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function children(
  ids: readonly number[] | undefined,
  format: (item: Zotero.Item) => string,
): string[] {
  return (ids ?? []).slice(0, MAX_CHILD_PREVIEW_ITEMS).flatMap((id) => {
    try {
      const item = mainItem(id);
      return item ? [format(item)] : [];
    } catch {
      return [];
    }
  });
}

function sections(item: Zotero.Item, language: AppLanguage): PickerPreviewSection[] {
  const attachments = item.getAttachments?.() ?? [];
  const notes = item.getNotes?.(false) ?? [];
  const section = (
    heading: string,
    ids: readonly number[],
    format: (child: Zotero.Item) => string,
  ): PickerPreviewSection => ({
    title: t(heading, language),
    count: ids.length,
    names: children(ids, format),
    more:
      ids.length > MAX_CHILD_PREVIEW_ITEMS
        ? t('picker.moreChildren', language).replace(
            '{count}',
            String(ids.length - MAX_CHILD_PREVIEW_ITEMS),
          )
        : undefined,
  });
  return [
    section(
      'picker.attachments',
      attachments,
      (child) => child.attachmentFilename?.trim() || title(child, t('picker.untitled', language)),
    ),
    section('picker.childNotes', notes, (child) =>
      title(child, child.getNoteTitle?.().trim() || t('picker.untitled', language)),
    ),
  ];
}

export function isFuzzyPickerItem(item: Zotero.Item): boolean {
  return item.isRegularItem();
}

export function createItemsProvider(
  window: MainWindow,
  scope: Extract<PickerScope, 'all' | 'collection'>,
  language: AppLanguage = 'en',
): PickerProvider {
  let inCollection = scope === 'collection';
  return {
    get title() {
      return t(inCollection ? 'picker.collectionItems' : 'picker.allItems', language);
    },
    get placeholder() {
      return t(inCollection ? 'picker.searchCollection' : 'picker.searchLibrary', language);
    },
    async load() {
      const collection = scope === 'collection' ? mainSelectedCollection(window) : undefined;
      inCollection = Boolean(collection);
      const source = collection
        ? collection.getChildItems(false, false)
        : await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, true, false);
      return source.filter(isFuzzyPickerItem).map((item) => {
        const citekey = citationKey(item);
        const creator = item.getCreators?.()[0];
        const named = creator as typeof creator & { name?: string };
        const author = creator?.lastName ?? named?.name ?? '';
        const year = item.getField('year') ?? '';
        const label = item.getField('title') ?? '';
        return {
          id: item.id,
          title: label,
          citekey,
          year,
          author,
          bibliography: { icon: mainItemTypeIcon(item), sections: sections(item, language) },
          search: `${citekey} ${label} ${author} ${year}`.toLowerCase(),
        };
      });
    },
    rowText: (item) => item.title,
    preview: (item) => ({
      title: item.title || t('picker.untitled', language),
      body: '',
      meta: [item.author, item.year].filter(Boolean).join(' · '),
      sections: item.bibliography?.sections,
    }),
  };
}
