import type { MainWindow } from '../../../core/contracts';
import { citationKey } from '../../../platform/better-bibtex';
import { mainHost, mainItem } from '../../host';
import { selectedCollection } from '../../navigation';
import type { PickerItem, PickerScope } from '../model';
import type { PickerPreview, PickerProvider } from '../types';

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

function preview(item: Zotero.Item, author: string, year: string, citekey: string): string {
  const attachments = item.getAttachments?.() ?? [];
  const notes = item.getNotes?.(false) ?? [];
  const lines = [
    'Bibliographic item',
    author || year ? [author, year].filter(Boolean).join(', ') : '',
    citekey ? `@${citekey}` : '',
    `Attachments: ${attachments.length}`,
    ...children(
      attachments,
      (child) => child.attachmentFilename?.trim() || title(child, 'Unnamed attachment'),
    ).map((value) => `  - ${value}`),
    `Child notes: ${notes.length}`,
    ...children(notes, (child) =>
      title(child, child.getNoteTitle?.().trim() || 'Untitled note'),
    ).map((value) => `  - ${value}`),
  ];
  if (attachments.length > MAX_CHILD_PREVIEW_ITEMS)
    lines.push(`  … ${attachments.length - MAX_CHILD_PREVIEW_ITEMS} more attachments`);
  if (notes.length > MAX_CHILD_PREVIEW_ITEMS)
    lines.push(`  … ${notes.length - MAX_CHILD_PREVIEW_ITEMS} more child notes`);
  return lines.filter(Boolean).join('\n');
}

export function isFuzzyPickerItem(item: Zotero.Item): boolean {
  return item.isRegularItem();
}

export function itemRowText(item: PickerItem): string {
  const metadata = `${item.title || '(untitled)'}${
    item.author ? ` — ${item.author}${item.year ? `, ${item.year}` : ''}` : ''
  }`;
  return item.citekey ? `@${item.citekey}  ${metadata}` : metadata;
}

export function createItemsProvider(
  window: MainWindow,
  scope: Extract<PickerScope, 'all' | 'collection'>,
): PickerProvider {
  return {
    title: scope === 'collection' ? 'Collection' : 'All items',
    placeholder: scope === 'collection' ? '> Search current collection…' : '> Search all items…',
    async load() {
      const collection = selectedCollection(mainHost(window).ZoteroPane?.collectionsView);
      const source =
        scope === 'collection' && collection
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
          kind: 'Bibliographic item',
          preview: preview(item, author, year, citekey),
          search: `${citekey} ${label} ${author} ${year}`.toLowerCase(),
        };
      });
    },
    rowText: (item) => itemRowText(item),
    preview: (item): PickerPreview => ({
      title: item.title || '(untitled)',
      body:
        [
          item.preview,
          item.kind,
          item.citekey ? `@${item.citekey}` : '',
          [item.author, item.year].filter(Boolean).join(', '),
        ]
          .filter(Boolean)
          .join('\n\n') || item.title,
    }),
  };
}
