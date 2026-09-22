import type { MainWindow } from '../core/contracts';
import { keyString } from '../input/keys';
import { THEME_VARS } from '../ui/theme';
import {
  currentMainItemCursorRef,
  mainHost,
  mainItem,
  mainItemRowForRef,
  projectMainSelection,
} from './host';
import type { MainWindowSession } from './session';
import type { MainReturnContext } from './return-context';
import type { ItemRef } from './selection-store';

const H = 'http://www.w3.org/1999/xhtml';

export type SelectionEntryState = 'visible' | 'hidden' | 'unavailable';

export interface SelectionPanelEntry {
  readonly ref: ItemRef;
  readonly title: string;
  readonly state: SelectionEntryState;
}

export interface SelectionPanelLogger {
  debug(message: string): void;
}

function itemForRef(ref: ItemRef): Zotero.Item | undefined {
  const item = mainItem(ref.itemID);
  return item && item.libraryID === ref.libraryID ? item : undefined;
}

function itemTitle(item: Zotero.Item | undefined, ref: ItemRef): string {
  if (!item) return `Item ${ref.itemID}`;
  try {
    const title = String(item.getField?.('title') ?? '').trim();
    if (title) return title;
  } catch {}
  return `Item ${ref.itemID}`;
}

export function selectionPanelEntries(
  window: MainWindow,
  refs: readonly ItemRef[],
): readonly SelectionPanelEntry[] {
  return refs.map((ref) => {
    const item = itemForRef(ref);
    return {
      ref,
      title: itemTitle(item, ref),
      state:
        mainItemRowForRef(window, ref) !== undefined ? 'visible' : item ? 'hidden' : 'unavailable',
    };
  });
}

/**
 * Persistent inspector for Neo's explicit Main Selection workset.
 *
 * This panel intentionally owns no batch domain actions. It can inspect the
 * workset, remove/clear membership, and explicitly reveal one member.
 */
export class SelectionPanel {
  readonly #logger: SelectionPanelLogger;
  readonly #returnContext: MainReturnContext;

  constructor(logger: SelectionPanelLogger, returnContext: MainReturnContext) {
    this.#logger = logger;
    this.#returnContext = returnContext;
  }

  open(window: MainWindow, session: MainWindowSession): void {
    const state = session.selectionPanel;
    if (state.open) {
      state.overlay?.focus();
      return;
    }

    const doc = window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const overlay = create('div');
    overlay.id = 'zv-selection-panel';
    overlay.tabIndex = -1;
    overlay.style.cssText = `position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:40px;background:${THEME_VARS.backdrop};color:${THEME_VARS.text};font:13px/1.4 monospace`;

    const panel = create('section');
    panel.style.cssText = `width:min(900px,calc(100vw - 80px));height:min(600px,calc(100vh - 80px));min-width:580px;min-height:380px;display:flex;flex-direction:column;overflow:hidden;background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 24px 70px ${THEME_VARS.shadow}`;

    const header = create('header');
    header.style.cssText = `display:flex;align-items:center;gap:14px;padding:12px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border}`;
    const title = create('strong');
    title.textContent = 'Selection';
    title.style.cssText = 'font-size:14px;white-space:nowrap';
    const count = create('span');
    count.style.cssText = `color:${THEME_VARS.muted};white-space:nowrap`;
    header.append(title, count);

    const content = create('div');
    content.style.cssText =
      'display:grid;grid-template-columns:minmax(300px,52%) minmax(260px,48%);flex:1;min-height:0';

    const list = create('div');
    list.tabIndex = -1;
    list.style.cssText = `overflow:auto;min-height:0;padding:7px 0;border-right:1px solid ${THEME_VARS.border};outline:none`;

    const details = create('div');
    details.tabIndex = -1;
    details.style.cssText = `overflow:auto;min-height:0;padding:20px 22px;background:${THEME_VARS.elevated};white-space:pre-wrap;outline:none`;

    content.append(list, details);

    const footer = create('footer');
    footer.style.cssText = `padding:7px 12px;color:${THEME_VARS.muted};border-top:1px solid ${THEME_VARS.border};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;

    panel.append(header, content, footer);
    overlay.append(panel);
    (doc.body ?? doc.documentElement).append(overlay);

    state.open = true;
    state.refs = [];
    state.selected = 0;
    state.commandBuffer = '';
    state.overlay = overlay;
    state.list = list;
    state.details = details;
    state.count = count;
    state.footer = footer;
    state.previousElement = doc.activeElement;
    state.themeCleanup = session.theme.add(overlay);

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close(session);
    });

    overlay.focus();
    this.refresh(window, session);
  }

  close(session: MainWindowSession): void {
    const state = session.selectionPanel;
    if (!state.open) return;
    session.window.clearTimeout(state.commandTimer);
    state.commandTimer = undefined;
    state.themeCleanup?.();
    state.themeCleanup = null;
    state.overlay?.remove();
    state.open = false;
    state.refs = [];
    state.selected = 0;
    state.commandBuffer = '';
    state.overlay = null;
    state.list = null;
    state.details = null;
    state.count = null;
    state.footer = null;
    try {
      if (state.previousElement?.isConnected) (state.previousElement as HTMLElement).focus();
    } catch {}
    state.previousElement = null;
  }

  handleKey(event: KeyboardEvent, window: MainWindow, session: MainWindowSession): void {
    const state = session.selectionPanel;
    if (!state.open) return;

    const key = keyString(event);
    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };
    if (!key) {
      event.stopPropagation();
      return;
    }

    if (key !== 'g' && state.commandBuffer) this.clearCommand(session);

    if (key === 'escape' || key === 'q') {
      consume();
      this.close(session);
      return;
    }
    if (key === 'r') {
      consume();
      this.refresh(window, session);
      return;
    }
    if (key === 'j') {
      consume();
      this.select(session, Math.min(state.refs.length - 1, state.selected + 1));
      return;
    }
    if (key === 'k') {
      consume();
      this.select(session, Math.max(0, state.selected - 1));
      return;
    }
    if (key === 'G' || key === 'end') {
      consume();
      this.select(session, Math.max(0, state.refs.length - 1));
      return;
    }
    if (key === 'home') {
      consume();
      this.select(session, 0);
      return;
    }
    if (key === 'g') {
      consume();
      if (state.commandBuffer === 'g') {
        this.clearCommand(session);
        this.select(session, 0);
      } else {
        state.commandBuffer = 'g';
        session.window.clearTimeout(state.commandTimer);
        state.commandTimer = session.window.setTimeout(() => this.clearCommand(session), 700);
        this.renderFooter(session, 'g … (gg top)');
      }
      return;
    }
    if (key === 'x') {
      consume();
      this.removeCurrent(window, session);
      return;
    }
    if (key === 'c') {
      consume();
      this.clear(window, session);
      return;
    }
    if (key === 'enter') {
      consume();
      this.reveal(window, session);
      return;
    }

    event.stopPropagation();
  }

  refresh(window: MainWindow, session: MainWindowSession): void {
    const state = session.selectionPanel;
    state.refs = [...session.selection.values()];
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, state.refs.length - 1)));
    this.render(window, session);
  }

  private clearCommand(session: MainWindowSession): void {
    const state = session.selectionPanel;
    session.window.clearTimeout(state.commandTimer);
    state.commandTimer = undefined;
    state.commandBuffer = '';
    this.renderFooter(session);
  }

  private select(session: MainWindowSession, index: number): void {
    const state = session.selectionPanel;
    if (!state.refs.length) {
      state.selected = 0;
      return;
    }
    state.selected = Math.max(0, Math.min(index, state.refs.length - 1));
    this.render(session.window, session);
  }

  private removeCurrent(window: MainWindow, session: MainWindowSession): void {
    const state = session.selectionPanel;
    const ref = state.refs[state.selected];
    if (!ref) return;
    const cursor = currentMainItemCursorRef(window);
    session.selection.remove(ref);
    projectMainSelection(window, session.selection.values(), cursor);
    this.refresh(window, session);
  }

  private clear(window: MainWindow, session: MainWindowSession): void {
    const cursor = currentMainItemCursorRef(window);
    session.selection.clear();
    projectMainSelection(window, [], cursor);
    this.refresh(window, session);
  }

  private reveal(window: MainWindow, session: MainWindowSession): void {
    const ref = session.selectionPanel.refs[session.selectionPanel.selected];
    if (!ref) return;
    if (!itemForRef(ref)) {
      this.renderFooter(session, 'Unavailable item cannot be revealed');
      return;
    }
    const pane = mainHost(window).ZoteroPane;
    const selectItem = pane?.selectItem;
    if (!selectItem) {
      this.renderFooter(session, 'Reveal is unavailable in this Zotero view');
      return;
    }
    this.#returnContext.capture(window, session);
    this.close(session);
    try {
      void Promise.resolve(selectItem.call(pane, ref.itemID)).catch((error) =>
        this.#logger.debug(`Selection reveal failed: ${String(error)}`),
      );
    } catch (error) {
      this.#logger.debug(`Selection reveal failed: ${String(error)}`);
    }
  }

  private render(window: MainWindow, session: MainWindowSession): void {
    const state = session.selectionPanel;
    const entries = selectionPanelEntries(window, state.refs);
    const visible = entries.filter((entry) => entry.state === 'visible').length;
    const hidden = entries.filter((entry) => entry.state === 'hidden').length;
    const unavailable = entries.length - visible - hidden;

    if (state.count) {
      state.count.textContent = `${entries.length} selected · ${visible} visible${hidden ? ` · ${hidden} hidden` : ''}${unavailable ? ` · ${unavailable} unavailable` : ''}`;
    }

    const list = state.list;
    if (list) {
      list.replaceChildren();
      if (!entries.length) {
        const empty = window.document.createElementNS(H, 'div');
        empty.textContent = 'Selection is empty';
        empty.style.cssText = `padding:12px 14px;color:${THEME_VARS.muted}`;
        list.append(empty);
      } else {
        entries.forEach((entry, index) => {
          const row = window.document.createElementNS(H, 'div');
          row.dataset.index = String(index);
          row.style.cssText = `padding:7px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${index === state.selected ? `background:${THEME_VARS.selected};color:${THEME_VARS.selectedText};` : ''}`;
          const marker = entry.state === 'visible' ? 'V' : entry.state === 'hidden' ? 'H' : '!';
          row.textContent = `[${marker}] ${entry.title}`;
          list.append(row);
        });
        const selected = list.children[state.selected] as HTMLElement | undefined;
        selected?.scrollIntoView?.({ block: 'nearest' });
      }
    }

    if (state.details) {
      const entry = entries[state.selected];
      state.details.textContent = entry
        ? `${entry.title}\n\nStatus: ${entry.state}\nLibrary: ${entry.ref.libraryID}\nItem: ${entry.ref.itemID}\n\nReveal is explicit and may change the current Zotero View when the item is hidden.`
        : 'No explicit Selection members.';
    }

    this.renderFooter(session);
  }

  private renderFooter(session: MainWindowSession, override?: string): void {
    const footer = session.selectionPanel.footer;
    if (!footer) return;
    footer.textContent =
      override ?? 'j/k move · gg/G ends · x remove · c clear · Enter reveal · r refresh · q close';
  }
}
