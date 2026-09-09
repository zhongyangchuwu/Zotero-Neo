import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { THEME_VARS } from '../ui/theme';
import type { MainWindowSession, NoteEntry, NoteRow } from './session';
import { MainNavigation } from './navigation';
const H = 'http://www.w3.org/1999/xhtml';
function getItem(id: number): Zotero.Item | undefined {
  const item = Zotero.Items.get(id);
  return item === false ? undefined : item;
}

const hints = 'asdfghjklqwertyuiopzxcvbnm';
export class NotesLayout {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;

  constructor(logger: Logger, navigation: MainNavigation) {
    this.#logger = logger;
    this.#navigation = navigation;
  }
  toggle(window: MainWindow, session: MainWindowSession): void {
    if (session.notes.open) this.close(session);
    else void this.open(window, session);
  }
  close(session: MainWindowSession): void {
    if (!session.notes.open) return;
    session.notes.themeCleanup?.();
    session.notes.overlay?.remove();
    clearTimeout(session.notes.hintTimer);
    clearTimeout(session.notes.commandTimer);
    session.notes = {
      ...session.notes,
      open: false,
      overlay: null,
      status: null,
      list: null,
      preview: null,
      current: [],
      all: [],
      entries: [],
      selected: 0,
      hint: '',
      command: '',
      themeCleanup: null,
    };
  }
  onKeyDown(event: KeyboardEvent, window: MainWindow, session: MainWindowSession): void {
    const key = event.key.length === 1 && event.shiftKey ? event.key : event.key.toLowerCase();
    const stop = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (key === 'escape') {
      stop();
      this.close(session);
      return;
    }
    if (key === 'enter') {
      stop();
      void this.openSelected(window, session, event.shiftKey);
      return;
    }
    if (key === 'n' || key === 'N') {
      stop();
      void this.create(window, session, key === 'n', key === 'N');
      return;
    }
    if (session.notes.pane === 'preview') {
      if (key === 'ctrl+h') {
        stop();
        this.pane(session, 'list');
        return;
      }
      if (key === 'j' || key === 'arrowdown') {
        stop();
        session.notes.preview?.scrollBy({ top: 90 });
        return;
      }
      if (key === 'k' || key === 'arrowup') {
        stop();
        session.notes.preview?.scrollBy({ top: -90 });
        return;
      }
      event.stopPropagation();
      return;
    }
    if (key === 'ctrl+l') {
      stop();
      this.pane(session, 'preview');
      return;
    }
    if (key === 'ctrl+j' || key === 'ctrl+k') {
      stop();
      this.section(window, session, key === 'ctrl+j' ? 'all' : 'current');
      return;
    }
    if (key === 'j' || key === 'arrowdown') {
      stop();
      this.move(window, session, 1, 1);
      return;
    }
    if (key === 'k' || key === 'arrowup') {
      stop();
      this.move(window, session, -1, 1);
      return;
    }
    if (key === 'ctrl+d' || key === 'ctrl+u') {
      stop();
      this.move(
        window,
        session,
        key === 'ctrl+d' ? 1 : -1,
        Math.max(5, Math.floor(session.notes.entries.length / 10) || 10),
      );
      return;
    }
    if (key === 'g') {
      stop();
      if (session.notes.command === 'g') {
        session.notes.selected = 0;
        session.notes.command = '';
        this.render(window, session);
      } else {
        session.notes.command = 'g';
        clearTimeout(session.notes.commandTimer);
        session.notes.commandTimer = window.setTimeout(() => {
          session.notes.command = '';
        }, 700);
      }
      return;
    }
    if (key === 'G') {
      stop();
      session.notes.selected = Math.max(0, session.notes.entries.length - 1);
      this.render(window, session);
      return;
    }
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      hints.includes(key)
    ) {
      stop();
      this.selectHint(window, session, key);
      return;
    }
    event.stopPropagation();
  }
  private async open(window: MainWindow, session: MainWindowSession): Promise<void> {
    const doc = window.document;
    const h = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const overlay = h('div');
    overlay.id = 'zv-notes-layout-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:${THEME_VARS.backdrop};z-index:99999;display:flex;align-items:center;justify-content:center;padding:4vh 4vw`;
    const modal = h('div');
    modal.style.cssText = `width:min(1100px,92vw);height:min(760px,88vh);background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px ${THEME_VARS.shadow};font:13px/1.45 monospace`;
    const status = h('div');
    status.textContent =
      'j/k move · Ctrl+d/u fast · Ctrl+j/k section · Ctrl+h/l list/preview · n/N new · Enter/Shift+Enter open';
    status.style.cssText = `padding:10px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted}`;
    const body = h('div');
    body.style.cssText =
      'display:grid;grid-template-columns:minmax(320px,38%) 1fr;min-height:0;flex:1';
    const list = h('div');
    list.style.cssText = `overflow:auto;padding:8px;background:${THEME_VARS.surface};border-right:1px solid ${THEME_VARS.border}`;
    const preview = h('div');
    preview.style.cssText = `overflow:auto;padding:14px 16px;background:${THEME_VARS.elevated}`;
    body.append(list, preview);
    modal.append(status, body);
    overlay.append(modal);
    (doc.body ?? doc.documentElement).append(overlay);
    const themeCleanup = session.theme.add(overlay);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close(session);
    });
    session.notes = {
      ...session.notes,
      open: true,
      overlay,
      status,
      list,
      preview,
      pane: 'list',
      selected: 0,
      current: [],
      all: [],
      entries: [],
      themeCleanup,
    };
    list.textContent = 'Loading notes…';
    preview.textContent = 'Loading note preview…';
    try {
      const payload = await this.rows(window);
      if (!session.notes.open) return;
      session.notes.current = payload.current;
      session.notes.all = payload.all;
      this.render(window, session);
      if (payload.filtered)
        this.#navigation.status(session, `→ hidden ${payload.filtered} machine notes`, 1800);
    } catch (error) {
      this.#logger.debug(`notes load error: ${String(error)}`);
      list.textContent = 'Failed to load notes.';
      preview.textContent = 'Failed to load note preview.';
    }
  }
  private render(window: MainWindow, session: MainWindowSession): void {
    const entries: NoteEntry[] = [
      ...session.notes.current.map((row) => ({ section: 'current' as const, row })),
      ...session.notes.all.map((row) => ({ section: 'all' as const, row })),
    ];
    session.notes.entries = entries;
    session.notes.selected = Math.max(
      0,
      Math.min(session.notes.selected, Math.max(0, entries.length - 1)),
    );
    const list = session.notes.list;
    const preview = session.notes.preview;
    if (!list || !preview) return;
    list.replaceChildren();
    if (!entries.length) {
      list.style.color = THEME_VARS.muted;
      list.textContent = 'No notes found.';
    }
    entries.forEach((entry, index) => {
      const card = list.ownerDocument.createElementNS(H, 'article');
      const selectedCard = index === session.notes.selected;
      card.style.cssText = `border:1px solid ${selectedCard ? THEME_VARS.accent : THEME_VARS.border};background:${selectedCard ? THEME_VARS.selected : THEME_VARS.surface};color:${selectedCard ? THEME_VARS.selectedText : THEME_VARS.text};border-radius:6px;padding:6px 8px;margin:0 0 6px`;
      card.textContent = `[${this.hint(index)}] ${entry.section === 'current' ? 'Current: ' : ''}${entry.row.title}`;
      card.addEventListener('click', () => {
        session.notes.selected = index;
        this.render(window, session);
      });
      card.addEventListener('dblclick', () => void this.openSelected(window, session, false));
      list.append(card);
    });
    const selected = entries[session.notes.selected];
    preview.replaceChildren();
    if (!selected) {
      preview.textContent = 'No note selected.';
      return;
    }
    const title = preview.ownerDocument.createElementNS(H, 'h3');
    title.textContent = selected.row.title;
    const text = preview.ownerDocument.createElementNS(H, 'div');
    text.style.cssText = `white-space:pre-wrap;color:${THEME_VARS.text};line-height:1.6;background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;padding:12px 14px`;
    text.textContent = selected.row.text;
    preview.append(title, text);
    list.children[session.notes.selected]?.scrollIntoView({ block: 'nearest' });
  }
  private hint(index: number): string {
    return index < hints.length
      ? hints[index]
      : `${hints[Math.floor(index / hints.length)] ?? ''}${hints[index % hints.length]}`;
  }
  private selectHint(window: MainWindow, session: MainWindowSession, key: string): void {
    const candidate = session.notes.hint + key;
    const matches = session.notes.entries
      .map((_, index) => this.hint(index))
      .map((hint, index) => ({ hint, index }))
      .filter((entry) => entry.hint.startsWith(candidate));
    if (!matches.length) {
      session.notes.hint = '';
      return;
    }
    session.notes.hint = candidate;
    clearTimeout(session.notes.hintTimer);
    session.notes.hintTimer = window.setTimeout(() => {
      session.notes.hint = '';
    }, 1200);
    const exact = matches.find((entry) => entry.hint === candidate);
    if (exact) {
      session.notes.selected = exact.index;
      session.notes.hint = '';
      this.render(window, session);
    }
  }
  private move(
    window: MainWindow,
    session: MainWindowSession,
    direction: number,
    amount: number,
  ): void {
    if (!session.notes.entries.length) return;
    session.notes.selected = Math.max(
      0,
      Math.min(session.notes.entries.length - 1, session.notes.selected + direction * amount),
    );
    this.render(window, session);
  }
  private section(
    window: MainWindow,
    session: MainWindowSession,
    section: 'current' | 'all',
  ): void {
    const index = session.notes.entries.findIndex((entry) => entry.section === section);
    if (index >= 0) {
      session.notes.selected = index;
      this.render(window, session);
    }
  }
  private pane(session: MainWindowSession, pane: 'list' | 'preview'): void {
    session.notes.pane = pane;
    if (session.notes.list)
      session.notes.list.style.boxShadow =
        pane === 'list' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
    if (session.notes.preview)
      session.notes.preview.style.boxShadow =
        pane === 'preview' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
  }
  private async openSelected(
    window: MainWindow,
    session: MainWindowSession,
    tab: boolean,
  ): Promise<void> {
    const id = session.notes.entries[session.notes.selected]?.row.id;
    if (!id) return;
    try {
      const pane = window as unknown as {
        ZoteroPane?: {
          selectItem?(item: number): Promise<void> | void;
          openNote?(item: number, options: { openInWindow: boolean }): Promise<void> | void;
        };
      };
      await pane.ZoteroPane?.selectItem?.(id);
      if (pane.ZoteroPane?.openNote) await pane.ZoteroPane.openNote(id, { openInWindow: tab });
      else await Zotero.Notes.open(id, null, { openInWindow: tab });
      this.close(session);
    } catch (error) {
      this.#navigation.status(session, '✗ open note failed');
      this.#logger.debug(`open note error: ${String(error)}`);
    }
  }
  private async create(
    window: MainWindow,
    session: MainWindowSession,
    previous: boolean,
    tab: boolean,
  ): Promise<void> {
    const selected = previous
      ? session.notes.entries[session.notes.selected]?.row.id
        ? getItem(session.notes.entries[session.notes.selected].row.id)?.parentItemID
        : undefined
      : (
          window as unknown as { ZoteroPane?: { getSelectedItems?(): Zotero.Item[] } }
        ).ZoteroPane?.getSelectedItems?.()[0]?.id;
    const item = selected ? getItem(selected) : undefined;
    if (!item || item.isNote() || item.isAttachment()) {
      this.#navigation.status(session, '✗ select a parent item to create child note');
      return;
    }
    try {
      const note = new Zotero.Item('note') as Omit<Zotero.Item, 'libraryID' | 'parentID'> & {
        libraryID: number;
        parentID: number;
      };
      note.libraryID = item.libraryID;
      note.parentID = item.id;
      note.setNote('<p></p>');
      await note.saveTx();
      const pane = window as unknown as {
        ZoteroPane?: {
          selectItem?(item: number): Promise<void> | void;
          openNote?(item: number, options: { openInWindow: boolean }): Promise<void> | void;
        };
      };
      await pane.ZoteroPane?.selectItem?.(note.id);
      if (pane.ZoteroPane?.openNote) await pane.ZoteroPane.openNote(note.id, { openInWindow: tab });
      else await Zotero.Notes.open(note.id, null, { openInWindow: tab });
      this.close(session);
      this.#navigation.status(session, '✓ new child note', 1200);
    } catch (error) {
      this.#logger.debug(`create note error: ${String(error)}`);
      this.#navigation.status(session, '✗ create note failed');
    }
  }
  private async rows(
    window: MainWindow,
  ): Promise<{ current: NoteRow[]; all: NoteRow[]; filtered: number }> {
    const make = (note: Zotero.Item, meta = ''): NoteRow | null => {
      if (!note.isNote()) return null;
      const html = note.getNote();
      const text = this.text(window.document, html);
      const title =
        note.getDisplayTitle?.().trim() || note.getNoteTitle?.().trim() || 'Untitled note';
      return {
        id: note.id,
        title,
        text: text || '(empty)',
        meta,
        dateModified: String(note.dateModified ?? ''),
      };
    };
    const selected = (
      window as unknown as { ZoteroPane?: { getSelectedItems?(): Zotero.Item[] } }
    ).ZoteroPane?.getSelectedItems?.()[0];
    const base =
      selected?.isAttachment() && selected.parentItemID ? getItem(selected.parentItemID) : selected;
    const current = base?.isNote()
      ? [make(base)].filter((row): row is NoteRow => !!row)
      : base?.getNotes
        ? base
            .getNotes()
            .map((id: number) => getItem(id))
            .flatMap((note: Zotero.Item | undefined) =>
              note
                ? [make(note, `from: ${base.getDisplayTitle?.() ?? ''}`)].filter(
                    (row): row is NoteRow => !!row,
                  )
                : [],
            )
        : [];
    await Zotero.Schema.schemaUpdatePromise;
    const search = new Zotero.Search() as Omit<Zotero.Search, 'libraryID'> & { libraryID: number };
    search.libraryID = Zotero.Libraries.userLibraryID;
    search.addCondition('itemType', 'is', 'note');
    let filtered = 0;
    const all = (await search.search())
      .map((id) => getItem(id))
      .flatMap((note) => {
        const row = note ? make(note) : null;
        if (!row || note?.deleted || this.machine(row)) {
          filtered += 1;
          return [];
        }
        return [row];
      })
      .sort((a, b) => Date.parse(b.dateModified) - Date.parse(a.dateModified))
      .slice(0, 400);
    return { current, all, filtered };
  }
  private text(doc: Document, html: string): string {
    const container = doc.createElementNS(H, 'div');
    container.innerHTML = html;
    return (container.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  private machine(row: NoteRow): boolean {
    const all = `${row.title} ${row.text}`.trim();
    return (
      !all ||
      /^(timestamp|time\s*record|sync\s*record|machine\s*record|auto\s*record)$/i.test(row.title) ||
      /^(\d{10,13}|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/.test(row.text.trim()) ||
      (/(reading\s*time|readingtime|zotero-reading-time)/i.test(all) && row.text.length < 4000)
    );
  }
}
