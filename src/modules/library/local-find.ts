import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { NavigationCause } from '../../navigation/types';
import type { MainWindow } from '../../core/contracts';
import { compositionOwnsKey } from '../../input/composition';
import { keyString } from '../../input/keys';
import { citationKey } from '../../platform/better-bibtex';
import { THEME_VARS } from '../../ui/theme';
import {
  mainItem,
  mainItemCursorRow,
  mainItemRefAtRow,
  mainItemRowCount,
  moveMainItemCursor,
} from '../../toolkit/main';

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

interface LocalFindOpening {
  overlay: HTMLElement | null;
  input: HTMLInputElement | null;
  previousElement: Element | null;
  themeCleanup: Cleanup | null;
}

interface LocalFindPorts {
  window: MainWindow;
  status(text: string): void;
  navigate(cause: NavigationCause, move: () => boolean): void;
  themeRoot(root: HTMLElement): Cleanup;
  isCurrent(): boolean;
}

/** Local find searches current visible rows without changing Zotero View state. */
export class MainLocalFind {
  readonly #ports: LocalFindPorts;
  #opening: LocalFindOpening | null = null;
  #revision = 0;
  #query = '';

  constructor(ports: LocalFindPorts) {
    this.#ports = ports;
  }

  get isOpen(): boolean {
    return this.#opening !== null;
  }

  open(): void {
    if (!this.#ports.isCurrent()) return;
    if (this.#opening) {
      this.#opening.input?.focus();
      return;
    }

    const opening: LocalFindOpening = {
      overlay: null,
      input: null,
      previousElement: null,
      themeCleanup: null,
    };
    this.#opening = opening;
    const revision = ++this.#revision;
    const current = (): boolean =>
      this.#ports.isCurrent() && this.#opening === opening && this.#revision === revision;
    try {
      const doc = this.#ports.window.document;
      opening.previousElement = doc.activeElement;
      const overlay = doc.createElementNS(H, 'div');
      opening.overlay = overlay;
      overlay.id = 'zv-main-local-find';
      overlay.style.cssText = `position:fixed;left:14px;right:14px;bottom:10px;z-index:100000;display:flex;align-items:center;gap:8px;max-width:760px;margin:0 auto;padding:7px 10px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:5px;box-shadow:0 8px 28px ${THEME_VARS.shadow};font:13px/1.4 monospace`;

      const prefix = doc.createElementNS(H, 'span');
      prefix.textContent = '/';
      prefix.style.cssText = `color:${THEME_VARS.muted};font-weight:bold`;

      const input = doc.createElementNS(H, 'input') as HTMLInputElement;
      opening.input = input;
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = 'Find in visible items…';
      input.style.cssText = `flex:1;min-width:0;border:0;outline:none;background:transparent;color:${THEME_VARS.text};font:inherit`;

      overlay.append(prefix, input);
      if (!current()) {
        this.#discard(opening);
        return;
      }
      (doc.body ?? doc.documentElement).append(overlay);
      if (!current()) {
        this.#discard(opening);
        return;
      }

      const cleanup = this.#ports.themeRoot(overlay);
      if (!current()) {
        const failure = new CleanupFailure();
        failure.run(cleanup);
        failure.run(() => this.#discard(opening));
        failure.rethrow();
        return;
      }
      opening.themeCleanup = cleanup;
      input.focus();
      if (!current()) this.#discard(opening);
    } catch (error) {
      try {
        this.#discard(opening);
      } catch {}
      throw error;
    }
  }

  #discard(opening: LocalFindOpening, restoreFocus = false): void {
    const owned = this.#opening === opening;
    if (owned) {
      this.#opening = null;
      this.#revision += 1;
    }
    const revision = this.#revision;
    const cleanup = opening.themeCleanup;
    opening.themeCleanup = null;
    const failure = new CleanupFailure();
    if (cleanup) failure.run(cleanup);
    if (opening.overlay) failure.run(() => opening.overlay?.remove());
    if (owned && restoreFocus && this.#ports.isCurrent() && this.#revision === revision) {
      try {
        if (opening.previousElement?.isConnected) (opening.previousElement as HTMLElement).focus();
      } catch {}
    }
    failure.rethrow();
  }

  close(restoreFocus = true): void {
    if (this.#opening) this.#discard(this.#opening, restoreFocus);
  }

  handleKey(event: KeyboardEvent): void {
    const opening = this.#opening;
    if (!opening || !this.#ports.isCurrent()) return;

    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };

    if (compositionOwnsKey(event, false)) {
      event.stopPropagation();
      return;
    }

    const key = keyString(event);
    if (key === 'escape') {
      consume();
      if (this.#opening !== opening) return;
      this.close();
      return;
    }
    if (key === 'enter' || key === 'return') {
      consume();
      if (this.#opening !== opening) return;
      const query = opening.input?.value.trim() ?? '';
      if (!query) {
        this.#ports.status('✗ Local find query is empty');
        return;
      }
      this.#query = query;
      const revision = this.#revision;
      this.close();
      if (this.#ports.isCurrent() && this.#revision === revision + 1) {
        this.repeat(1, { kind: 'event', event: 'main-local-find.confirm' });
      }
      return;
    }

    // Keep browser text/IME editing native while preventing Zotero/Main
    // shortcuts from also handling prompt input.
    event.stopPropagation();
  }

  repeat(
    direction: LocalFindDirection,
    cause: NavigationCause = {
      kind: 'action',
      action: direction > 0 ? 'findNext' : 'findPrevious',
    },
  ): boolean {
    const query = this.#query.trim();
    if (!this.#ports.isCurrent()) return false;
    if (!query) {
      this.#ports.status('✗ No local find query');
      return false;
    }

    const row = findVisibleMainItemRow(this.#ports.window, query, direction);
    if (row === undefined) {
      this.#ports.status(`✗ No visible match for “${query}”`);
      return false;
    }

    let moved = false;
    this.#ports.navigate(cause, () => {
      moved = moveMainItemCursor(this.#ports.window, row);
      return moved;
    });
    if (!moved) {
      this.#ports.status('✗ Local find Cursor move is unavailable');
      return false;
    }

    this.#ports.status(`${direction > 0 ? '→' : '←'} /${query}`);
    return true;
  }
}
