import type { MainWindow } from '../../../core/contracts';
import { citationKey } from '../../../platform/better-bibtex';
import { copyToClipboard } from '../../../platform/clipboard';
import { mainHost, mainItem } from '../../host';
import { selectedCollection, type MainNavigation } from '../../navigation';
import type { MainWindowSession } from '../../session';
import type { PickerItem, PickerScope } from '../model';
import type { PickerPreview, PickerProvider, PickerProviderCommands } from '../types';
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
  const metadata = `${item.title || '(untitled)'}${item.author ? ` — ${item.author}${item.year ? `, ${item.year}` : ''}` : ''}`;
  return item.citekey ? `@${item.citekey}  ${metadata}` : metadata;
}

export function createItemsProvider(
  window: MainWindow,
  session: MainWindowSession,
  scope: Extract<PickerScope, 'all' | 'collection'>,
  navigation: MainNavigation,
): PickerProvider {
  const yankCitation = (commands: PickerProviderCommands): void => {
    const item = session.picker.filtered[session.picker.selected];
    if (!item) return;
    copyToClipboard(
      [
        item.citekey && `@${item.citekey}`,
        item.title,
        [item.author, item.year].filter(Boolean).join(', ') &&
          `(${[item.author, item.year].filter(Boolean).join(', ')})`,
      ]
        .filter(Boolean)
        .join('  '),
    );
    navigation.status(session, `✓ ${item.citekey ? `@${item.citekey}` : item.title}`);
    commands.close();
  };
  const yankKey = (commands: PickerProviderCommands): void => {
    const item = session.picker.filtered[session.picker.selected];
    if (item?.citekey) {
      copyToClipboard(item.citekey);
      navigation.status(session, `✓ @${item.citekey}`);
    } else navigation.status(session, '✗ No citekey');
    commands.close();
  };
  const selectAndOpenPDF = async (commands: PickerProviderCommands): Promise<void> => {
    const generation = session.picker.generation;
    if (
      !(await commands.select(false, false)) ||
      !session.picker.open ||
      session.picker.generation !== generation
    )
      return;
    await navigation.openPDF(window, session);
    if (session.picker.open && session.picker.generation === generation) commands.close();
  };
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
    async activate(item) {
      await mainHost(window).ZoteroPane?.selectItem?.(Number(item.id));
    },
    onKeyDown(event, commands) {
      const lower = event.key.toLowerCase();
      const stop = (): void => {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      };
      if (event.ctrlKey && lower === 'o') {
        stop();
        commands.enqueue('select and open', () => selectAndOpenPDF(commands));
        return true;
      }
      if (event.key === 'y') {
        stop();
        if (session.picker.lastKey === 'y') yankKey(commands);
        else {
          session.picker.lastKey = 'y';
          clearTimeout(session.picker.yTimer);
          session.picker.yTimer = window.setTimeout(() => yankCitation(commands), 400);
        }
        return true;
      }
      event.stopPropagation();
      return false;
    },
  };
}
