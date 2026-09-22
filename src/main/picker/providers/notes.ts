import type { Logger } from '../../../core/logging';
import type { MainWindow } from '../../../core/contracts';
import { currentMainItem, mainItem } from '../../host';
import type { PickerItem } from '../model';
import type { PickerProvider } from '../types';

function text(document: Document, html: string): string {
  const node = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  node.innerHTML = html;
  return (node.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function machine(item: PickerItem): boolean {
  const sample = `${item.title}\n${item.preview ?? ''}`.toLowerCase();
  return (
    /(^|\s)(better\s*bibtex|zotero\s*citation|citation\s*key|csl\s*json)(\s|$)/i.test(sample) ||
    (/^\s*[\[{]/.test(item.preview ?? '') && /"(citationkey|itemtype|creators?)"\s*:/.test(sample))
  );
}

export function createNotesProvider(
  window: MainWindow,
  logger: Logger,
  baseItem?: Zotero.Item,
): PickerProvider {
  return {
    title: 'Notes',
    placeholder: '> Search note names…',
    async load() {
      const selected = baseItem ?? currentMainItem(window);
      const base =
        selected?.isAttachment() && selected.parentItemID
          ? mainItem(selected.parentItemID)
          : selected;
      const libraryID = base?.libraryID ?? Zotero.Libraries.userLibraryID;
      const current = new Set(base?.isNote() ? [base.id] : (base?.getNotes?.() ?? []));
      let notes: Zotero.Item[];
      try {
        await Zotero.Schema.schemaUpdatePromise;
        const search = new Zotero.Search();
        search.addCondition('libraryID', 'is', libraryID);
        search.addCondition('itemType', 'is', 'note');
        notes = Zotero.Items.get(await search.search());
      } catch (error) {
        logger.debug(`notes search fallback reason=${String(error)}`);
        notes = await Zotero.Items.getAll(libraryID, false, false);
      }
      const ordered = notes
        .filter((note) => {
          try {
            return current.has(note.id);
          } catch {
            return false;
          }
        })
        .concat(
          notes
            .filter((note) => {
              try {
                return !current.has(note.id);
              } catch {
                return false;
              }
            })
            .sort(
              (a, b) =>
                Date.parse(String(b.dateModified ?? '')) - Date.parse(String(a.dateModified ?? '')),
            ),
        );
      return ordered.flatMap((note) => {
        try {
          if (!note.isNote() || note.deleted) return [];
          const preview = text(window.document, note.getNote());
          const item: PickerItem = {
            id: note.id,
            title:
              note.getDisplayTitle?.().trim() || note.getNoteTitle?.().trim() || 'Untitled note',
            search: '',
            preview: preview || '(empty note)',
            meta: current.has(note.id)
              ? `Current item · ${base?.getDisplayTitle?.() ?? ''}`
              : String(note.dateModified ?? ''),
            section: current.has(note.id) ? 'current' : 'all',
            kind: 'note',
          };
          item.search = `${item.title}\n${preview}`.toLowerCase();
          return machine(item) ? [] : [item];
        } catch (error) {
          logger.debug(`note row unavailable (${String(note.id)}): ${String(error)}`);
          return [];
        }
      });
    },
    rowText: (item) =>
      `${item.section === 'current' ? '● ' : ''}${item.title}${item.meta ? ` — ${item.meta}` : ''}`,
    preview: (item) => ({
      title: item.title,
      body: [item.meta, item.preview || '(empty note)'].filter(Boolean).join('\n\n'),
    }),
  };
}
