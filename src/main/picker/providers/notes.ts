import type { Logger } from '../../../core/logging';
import type { MainWindow } from '../../../core/contracts';
import { currentMainItem, mainHost, mainItem } from '../../host';
import type { MainNavigation } from '../../navigation';
import type { MainWindowSession } from '../../session';
import type { PickerItem } from '../model';
import type { PickerProvider, PickerProviderCommands } from '../types';

function parent(item: Zotero.Item | undefined): Zotero.Item | undefined {
  if (!item) return undefined;
  if ((item.isAttachment() || item.isNote()) && item.parentItemID)
    return mainItem(item.parentItemID);
  return item.isAttachment() || item.isNote() ? undefined : item;
}

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
  session: MainWindowSession,
  navigation: MainNavigation,
  logger: Logger,
): PickerProvider {
  const failure = (context: string, error: unknown): void => {
    logger.debug(`picker ${context} failed: ${String(error)}`);
  };
  const load = async (): Promise<PickerItem[]> => {
    const selected = currentMainItem(window);
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
          title: note.getDisplayTitle?.().trim() || note.getNoteTitle?.().trim() || 'Untitled note',
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
  };
  const createNote = async (
    commands: PickerProviderCommands,
    useSelectedNote: boolean,
    openInWindow: boolean,
  ): Promise<void> => {
    const selected = useSelectedNote
      ? mainItem(Number(session.picker.filtered[session.picker.selected]?.id ?? 0))
      : undefined;
    const target = parent(selected) ?? parent(currentMainItem(window));
    if (!target) {
      navigation.status(session, '✗ Select a parent item to create a child note');
      return;
    }
    const generation = session.picker.generation;
    try {
      const note = new Zotero.Item('note') as Omit<Zotero.Item, 'libraryID' | 'parentID'> & {
        libraryID: number;
        parentID: number;
      };
      note.libraryID = target.libraryID;
      note.parentID = target.id;
      note.setNote('<p></p>');
      await note.saveTx();
      if (!commands.isCurrent(generation)) return;
      const pane = mainHost(window).ZoteroPane;
      await pane?.selectItem?.(note.id);
      if (!commands.isCurrent(generation)) return;
      if (pane?.openNote) await pane.openNote(note.id, { openInWindow });
      else await Zotero.Notes.open(note.id, null, { openInWindow });
      if (!commands.isCurrent(generation)) return;
      commands.close();
      navigation.status(session, '✓ New child note', 1200);
    } catch (error) {
      if (!commands.isCurrent(generation)) return;
      failure('create note', error);
      navigation.status(session, '✗ Create note failed');
    }
  };
  const trashNote = async (commands: PickerProviderCommands): Promise<void> => {
    const item = session.picker.filtered[session.picker.selected];
    if (!item || item.kind !== 'note') return;
    const generation = session.picker.generation;
    try {
      const id = Number(item.id);
      await navigation.trashItems([id]);
      if (!commands.isCurrent(generation)) return;
      session.picker.lastDeletedNoteID = id;
      session.picker.items = session.picker.items.filter((candidate) => candidate.id !== id);
      commands.filter();
      navigation.status(session, '✓ Note moved to trash · u to restore', 1800);
    } catch (error) {
      if (!commands.isCurrent(generation)) return;
      failure('trash note', error);
      navigation.status(session, '✗ Unable to move note to trash');
    }
  };
  const restoreNote = async (commands: PickerProviderCommands): Promise<void> => {
    const id = session.picker.lastDeletedNoteID;
    if (!id) {
      navigation.status(session, '✗ No deleted note to restore');
      return;
    }
    const generation = session.picker.generation;
    try {
      const restored = await navigation.restoreTrashedItems([id]);
      if (!commands.isCurrent(generation)) return;
      if (!restored) {
        navigation.status(session, '✗ Unable to restore note');
        return;
      }
      const items = await load();
      if (!commands.isCurrent(generation)) return;
      session.picker.lastDeletedNoteID = null;
      session.picker.items = items;
      commands.filter();
      navigation.status(session, '✓ Note restored', 1400);
    } catch (error) {
      if (!commands.isCurrent(generation)) return;
      failure('restore note', error);
      navigation.status(session, '✗ Unable to restore note');
    }
  };
  return {
    title: 'Notes',
    placeholder: '> Search note names…',
    load,
    rowText: (item) =>
      `${item.section === 'current' ? '● ' : ''}${item.title}${item.meta ? ` — ${item.meta}` : ''}`,
    preview: (item) => ({
      title: item.title,
      body: [item.meta, item.preview || '(empty note)'].filter(Boolean).join('\n\n'),
    }),
    async activate(item, openInWindow) {
      const pane = mainHost(window).ZoteroPane;
      await pane?.selectItem?.(Number(item.id));
      if (pane?.openNote) await pane.openNote(Number(item.id), { openInWindow });
      else await Zotero.Notes.open(Number(item.id), null, { openInWindow });
    },
    onKeyDown(event, commands) {
      const key = event.key;
      const lower = key.toLowerCase();
      const stop = (): void => {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      };
      if (key === 'Enter') {
        stop();
        commands.enqueue('select note', () => commands.select(event.shiftKey));
        return true;
      }
      if (event.target === session.picker.input || session.picker.focusPane === 'search') {
        if (key === 'ArrowDown') {
          stop();
          commands.focusPane('list');
          return true;
        }
        event.stopPropagation();
        return false;
      }
      if (key === '/') {
        stop();
        commands.focusPane('search');
        session.picker.input?.select();
        return true;
      }
      if (key === 'ArrowDown' || lower === 'j') {
        stop();
        session.picker.selected = Math.min(
          Math.max(0, session.picker.filtered.length - 1),
          session.picker.selected + 1,
        );
        commands.render();
        return true;
      }
      if (key === 'ArrowUp' || lower === 'k') {
        stop();
        session.picker.selected = Math.max(0, session.picker.selected - 1);
        commands.render();
        return true;
      }
      if (lower === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('create note', () =>
          createNote(commands, !event.shiftKey, event.shiftKey),
        );
        return true;
      }
      if (lower === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('trash note', () => trashNote(commands));
        return true;
      }
      if (lower === 'd' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (session.picker.command === 'd') {
          session.picker.command = '';
          clearTimeout(session.picker.commandTimer);
          session.picker.commandTimer = undefined;
          commands.enqueue('trash note', () => trashNote(commands));
        } else commands.armCommand('d');
        return true;
      }
      if (lower === 'u' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('restore note', () => restoreNote(commands));
        return true;
      }
      if (lower === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (session.picker.command === 'g') {
          session.picker.command = '';
          clearTimeout(session.picker.commandTimer);
          session.picker.commandTimer = undefined;
          session.picker.selected = 0;
          commands.render();
        } else commands.armCommand('g');
        return true;
      }
      if (key === 'G') {
        stop();
        session.picker.selected = Math.max(0, session.picker.filtered.length - 1);
        commands.render();
        return true;
      }
      event.stopPropagation();
      return false;
    },
  };
}
