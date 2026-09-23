import type { MainWindow } from '../core/contracts';
import { keyString } from '../input/keys';
import { citationKey } from '../platform/better-bibtex';
import { THEME_VARS } from '../ui/theme';
import {
  mainItem,
  mainItemCursorRow,
  mainItemRefAtRow,
  mainItemRowCount,
  selectMainItemCursorAnchor,
} from './host';
import type { MainWindowSession } from './session';

const H = 'http://www.w3.org/1999/xhtml';

export type LocalFindDirection = 1 | -1;

function itemSearchText(item: Zotero.Item): string {
  let title = '';
  let author = '';
  let year = '';
  let citekey = '';

  try {
    title =
      item.getDisplayTitle?.().trim() ||
      item.getField?.('title')?.trim() ||
      item.getNoteTitle?.().trim() ||
      item.attachmentFilename?.trim() ||
      '';
  } catch {}

  try {
    const creator = item.getCreators?.()[0] as { lastName?: string; name?: string } | undefined;
    author = creator?.lastName ?? creator?.name ?? '';
  } catch {}

  try {
    year = String(item.getField?.('year') ?? '').trim();
  } catch {}

  try {
    if (item.isRegularItem?.()) citekey = citationKey(item);
  } catch {}

  return [title, author, year, citekey, citekey ? `@${citekey}` : '']
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

function queryTokens(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

export function findVisibleMainItemRow(
  window: MainWindow,
  query: string,
  direction: LocalFindDirection,
): number | undefined {
  const tokens = queryTokens(query);
  const rowCount = mainItemRowCount(window);
  if (!tokens.length || rowCount <= 0) return undefined;

  const current = mainItemCursorRow(window);
  const start =
    current !== undefined && current >= 0 && current < rowCount ? current : direction > 0 ? -1 : 0;

  for (let step = 1; step <= rowCount; step += 1) {
    const row = (((start + direction * step) % rowCount) + rowCount) % rowCount;
    const ref = mainItemRefAtRow(window, row);
    if (!ref) continue;
    const item = mainItem(ref.itemID);
    if (!item || item.libraryID !== ref.libraryID) continue;
    const searchable = itemSearchText(item);
    if (tokens.every((token) => searchable.includes(token))) return row;
  }

  return undefined;
}

/**
 * Vim-style Main local find.
 *
 * The query is session state, while candidates are always derived from the
 * current visible item-tree rows. It never mutates Zotero View/query state.
 */
export class MainLocalFind {
  readonly #status: (session: MainWindowSession, text: string) => void;

  constructor(status: (session: MainWindowSession, text: string) => void) {
    this.#status = status;
  }

  open(window: MainWindow, session: MainWindowSession): void {
    const state = session.localFind;
    if (state.open) {
      state.input?.focus();
      return;
    }

    const doc = window.document;
    const overlay = doc.createElementNS(H, 'div');
    overlay.id = 'zv-main-local-find';
    overlay.style.cssText = `position:fixed;left:14px;right:14px;bottom:10px;z-index:100000;display:flex;align-items:center;gap:8px;max-width:760px;margin:0 auto;padding:7px 10px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:5px;box-shadow:0 8px 28px ${THEME_VARS.shadow};font:13px/1.4 monospace`;

    const prefix = doc.createElementNS(H, 'span');
    prefix.textContent = '/';
    prefix.style.cssText = `color:${THEME_VARS.muted};font-weight:bold`;

    const input = doc.createElementNS(H, 'input') as HTMLInputElement;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Find in visible items…';
    input.style.cssText = `flex:1;min-width:0;border:0;outline:none;background:transparent;color:${THEME_VARS.text};font:inherit`;

    overlay.append(prefix, input);
    (doc.body ?? doc.documentElement).append(overlay);

    state.open = true;
    state.overlay = overlay;
    state.input = input;
    state.previousElement = doc.activeElement;
    state.themeCleanup = session.theme.add(overlay);

    input.focus();
  }

  close(session: MainWindowSession): void {
    const state = session.localFind;
    if (!state.open) return;
    state.themeCleanup?.();
    state.themeCleanup = null;
    state.overlay?.remove();
    state.open = false;
    state.overlay = null;
    state.input = null;
    try {
      if (state.previousElement?.isConnected) (state.previousElement as HTMLElement).focus();
    } catch {}
    state.previousElement = null;
  }

  handleKey(event: KeyboardEvent, window: MainWindow, session: MainWindowSession): void {
    if (!session.localFind.open) return;

    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };

    if (event.isComposing) {
      event.stopPropagation();
      return;
    }

    const key = keyString(event);
    if (key === 'escape') {
      consume();
      this.close(session);
      return;
    }
    if (key === 'enter' || key === 'return') {
      consume();
      const query = session.localFind.input?.value.trim() ?? '';
      if (!query) {
        this.#status(session, '✗ Local find query is empty');
        return;
      }
      session.localFind.query = query;
      this.close(session);
      this.repeat(window, session, 1);
      return;
    }

    // Keep browser text/IME editing native while preventing Zotero/Main
    // shortcuts from also handling prompt input.
    event.stopPropagation();
  }

  repeat(window: MainWindow, session: MainWindowSession, direction: LocalFindDirection): boolean {
    const query = session.localFind.query.trim();
    if (!query) {
      this.#status(session, '✗ No local find query');
      return false;
    }

    const row = findVisibleMainItemRow(window, query, direction);
    if (row === undefined) {
      this.#status(session, `✗ No visible match for “${query}”`);
      return false;
    }

    if (!selectMainItemCursorAnchor(window, row)) {
      this.#status(session, '✗ Local find Cursor move is unavailable');
      return false;
    }

    this.#status(session, `${direction > 0 ? '→' : '←'} /${query}`);
    return true;
  }
}
