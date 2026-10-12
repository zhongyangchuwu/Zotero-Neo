import type { Logger } from '../../../core/logging';
import type { MainWindow } from '../../../core/contracts';
import { currentMainItem, mainItem } from '../../host';
import { noteOwnerKey } from '../../../platform/zotero-items';
import type { PickerItem } from '../model';
import type { PickerProvider } from '../types';

type NotesScope = 'item' | 'library';

function text(document: Document, html: string): string {
  const node = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  node.innerHTML = html.replace(/<\/(?:p|div|h[1-6]|li)>|<br\s*\/?>/gi, '$&\n');
  return (node.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parentID(item: Zotero.Item): number | undefined {
  const id = item.parentItemID;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

function parentItem(item: Zotero.Item): Zotero.Item | undefined {
  const id = parentID(item);
  if (id === undefined) return undefined;
  try {
    const parent = mainItem(id);
    return parent?.libraryID === item.libraryID ? parent : undefined;
  } catch {
    return undefined;
  }
}

function isNote(item: Zotero.Item): boolean {
  try {
    return item.isNote();
  } catch {
    return false;
  }
}

function sourceGroup(item: Zotero.Item): string {
  const library = String(item.libraryID);
  if (isNote(item)) {
    return noteOwnerKey(item);
  }
  return `library:${library}:item:${item.id}`;
}

function resolveBaseItem(selected: Zotero.Item | null | undefined): Zotero.Item | undefined {
  if (!selected) return undefined;
  if (selected.isAttachment()) return parentItem(selected);
  if (selected.isNote()) return parentItem(selected) ?? selected;
  return selected;
}

function currentItemNotes(base: Zotero.Item | undefined, logger: Logger): Zotero.Item[] {
  if (!base) return [];
  try {
    const ids = base.isNote() ? [base.id] : (base.getNotes?.() ?? []);
    return ids.length ? Zotero.Items.get(ids) : [];
  } catch (error) {
    logger.debug(`current-item notes unavailable: ${String(error)}`);
    return [];
  }
}

async function libraryNotes(libraryID: number, logger: Logger): Promise<Zotero.Item[]> {
  try {
    await Zotero.Schema.schemaUpdatePromise;
    const search = new Zotero.Search();
    search.addCondition('libraryID', 'is', libraryID);
    search.addCondition('itemType', 'is', 'note');
    return Zotero.Items.get(await search.search());
  } catch (error) {
    logger.debug(`notes search fallback reason=${String(error)}`);
    return Zotero.Items.getAll(libraryID, false, false);
  }
}

interface NoteSource {
  readonly group: string;
  readonly label: string;
}

function sourceForNote(note: Zotero.Item): NoteSource {
  const ownerID = parentID(note);
  if (ownerID === undefined) {
    return {
      group: noteOwnerKey(note),
      label: 'Standalone note',
    };
  }

  const group = noteOwnerKey(note);
  try {
    const parent = mainItem(ownerID);
    if (!parent || parent.libraryID !== note.libraryID) {
      return { group, label: 'Source unavailable' };
    }
    return {
      group,
      label: `Parent: ${parent.getDisplayTitle?.().trim() || 'Untitled item'}`,
    };
  } catch {
    return { group, label: 'Source unavailable' };
  }
}

interface NoteRow {
  readonly item: PickerItem;
  readonly modified: number;
  readonly index: number;
}

function orderLibraryRows(rows: NoteRow[], currentGroup?: string): PickerItem[] {
  const groups = new Map<string, { rows: NoteRow[]; latest: number; first: number }>();
  for (const row of rows) {
    const groupID = row.item.group!;
    const group = groups.get(groupID);
    if (group) {
      group.rows.push(row);
      group.latest = Math.max(group.latest, row.modified);
    } else {
      groups.set(groupID, { rows: [row], latest: row.modified, first: row.index });
    }
  }

  const orderedGroups = [...groups.entries()];
  orderedGroups.sort(([aID, a], [bID, b]) => {
    const aCurrent = aID === currentGroup;
    const bCurrent = bID === currentGroup;
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    return b.latest - a.latest || a.first - b.first;
  });

  const ordered: PickerItem[] = [];
  for (const [, group] of orderedGroups) {
    group.rows.sort((a, b) => b.modified - a.modified || a.index - b.index);
    for (const row of group.rows) ordered.push(row.item);
  }
  return ordered;
}

export interface NotesProviderContext {
  readonly baseItem?: Zotero.Item | null;
  readonly libraryID?: number;
  readonly scope?: NotesScope;
}

export function createNotesProvider(
  window: MainWindow,
  logger: Logger,
  context: NotesProviderContext = {},
): PickerProvider {
  const selected = context.baseItem === undefined ? currentMainItem(window) : context.baseItem;
  const base = resolveBaseItem(selected);
  const libraryID =
    context.libraryID ?? base?.libraryID ?? selected?.libraryID ?? Zotero.Libraries.userLibraryID;
  const currentGroup = base ? sourceGroup(base) : undefined;

  function forScope(scope: NotesScope): PickerProvider {
    return {
      title: 'Notes',
      placeholder: '> Search note names…',
      alternateSource: {
        label: scope === 'item' ? 'Browse library' : 'Current item',
        provider: () => forScope(scope === 'item' ? 'library' : 'item'),
      },
      async load() {
        const notes =
          scope === 'item' ? currentItemNotes(base, logger) : await libraryNotes(libraryID, logger);
        const rows: NoteRow[] = [];

        for (const note of notes) {
          try {
            if (note.deleted || note.libraryID !== libraryID || !note.isNote()) continue;
            const owner = sourceForNote(note);
            const title =
              note.getDisplayTitle?.().trim() || note.getNoteTitle?.().trim() || 'Untitled note';
            const preview = text(window.document, note.getNote());
            const item: PickerItem = {
              id: note.id,
              title,
              search: `${title}\n${preview}`.toLowerCase(),
              preview,
              meta: owner.label,
              group: owner.group,
              kind: 'note',
            };
            const parsedDate = Date.parse(String(note.dateModified ?? ''));
            rows.push({
              item,
              modified: Number.isNaN(parsedDate) ? Number.NEGATIVE_INFINITY : parsedDate,
              index: rows.length,
            });
          } catch (error) {
            logger.debug(`note row unavailable (${String(note.id)}): ${String(error)}`);
          }
        }

        return scope === 'library'
          ? orderLibraryRows(rows, currentGroup)
          : rows.map((row) => row.item);
      },
      rowText: (item) => item.title,
      preview: (item) => ({
        title: item.title,
        body: item.meta ? `${item.meta}\n\n${item.preview ?? ''}` : (item.preview ?? ''),
      }),
      emptyText: (query) => {
        if (scope === 'item') {
          if (!base) return 'No current item is available.';
          return query.trim()
            ? 'No current-item notes match this search.'
            : 'No notes on the current item.';
        }
        return query.trim() ? 'No library notes match this search.' : 'No notes in this library.';
      },
    };
  }

  return forScope(context.scope ?? 'item');
}
