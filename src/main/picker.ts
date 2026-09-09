import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { citationKey } from '../platform/better-bibtex';
import { copyToClipboard } from '../platform/clipboard';
import { THEME_VARS } from '../ui/theme';
import type { PickerItem, PickerScope, MainWindowSession } from './session';
import { MainNavigation, selectedCollection, type TreeView } from './navigation';
type HandledKey = KeyboardEvent & { _zvPickerHandled?: boolean };
const H = 'http://www.w3.org/1999/xhtml';
const alphabet = 'asdfghjklqwertyuiopzxcvbnm1234567890';
export function isFuzzyPickerItem(item: Zotero.Item): boolean {
  return item.isRegularItem();
}

export function fuzzyPickerRowText(item: PickerItem, index: number, scope: PickerScope): string {
  const metadata = `${item.title || '(untitled)'}${
    item.author ? ` — ${item.author}${item.year ? `, ${item.year}` : ''}` : ''
  }`;
  if (scope === 'tabs') return `[${alphabet[index] ?? index + 1}]  ${metadata}`;
  return item.citekey ? `@${item.citekey}  ${metadata}` : metadata;
}

export class FuzzyPicker {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;

  constructor(logger: Logger, navigation: MainNavigation) {
    this.#logger = logger;
    this.#navigation = navigation;
  }
  async open(window: MainWindow, session: MainWindowSession, scope: PickerScope): Promise<void> {
    if (session.picker.open) return;
    if (session.notes.open) session.notes.overlay?.remove();
    const doc = window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const overlay = create('div');
    overlay.id = 'zv-picker-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:${THEME_VARS.backdrop};z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh`;
    const modal = create('div');
    modal.style.cssText = `background:${THEME_VARS.surface};color:${THEME_VARS.text};width:60vw;max-height:70vh;border:1px solid ${THEME_VARS.border};border-radius:8px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px ${THEME_VARS.shadow};font:13px/1.4 monospace`;
    const input = create('input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder =
      scope === 'tabs' ? 'Pick tab by hint or search tab title...' : 'Search items...';
    input.style.cssText = `margin:10px 12px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};outline:2px solid ${THEME_VARS.focusRing};outline-offset:1px;border-radius:4px;padding:6px 10px;font:13px/1 monospace`;
    const results = create('div');
    results.style.cssText = 'overflow-y:auto;flex:1;max-height:55vh';
    modal.append(input, results);
    overlay.append(modal);
    (doc.body ?? doc.documentElement).append(overlay);
    const themeCleanup = session.theme.add(overlay);
    // Zotero exposes the focused chrome window as mozIDOMWindowProxy.
    const focusedWindow = Services.focus?.focusedWindow as unknown as Window | null;
    session.picker = {
      ...session.picker,
      open: true,
      scope,
      overlay,
      input,
      results,
      selected: 0,
      filtered: [],
      items: [],
      previousElement: doc.activeElement,
      previousWindow: focusedWindow,
      themeCleanup,
    };
    const inputHandler = (): void => {
      session.picker.selected = 0;
      this.filter(session, input.value);
    };
    input.addEventListener('input', inputHandler);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close(session);
    });
    session.cleanup.add(() => input.removeEventListener('input', inputHandler));
    window.setTimeout(() => input.focus(), 30);
    try {
      session.picker.items = scope === 'tabs' ? this.tabs(window) : await this.items(window, scope);
      this.filter(session, '');
    } catch (error) {
      this.#logger.debug(`picker load error: ${String(error)}`);
      results.textContent = `Error loading items: ${String(error).slice(0, 80)}`;
    }
  }
  close(session: MainWindowSession): void {
    if (!session.picker.open) return;
    const { overlay, previousElement, previousWindow, yTimer, themeCleanup } = session.picker;
    clearTimeout(yTimer);
    session.picker.yTimer = undefined;
    themeCleanup?.();
    session.picker.themeCleanup = null;
    overlay?.remove();
    session.picker.open = false;
    session.picker.overlay = null;
    session.picker.input = null;
    session.picker.results = null;
    session.picker.filtered = [];
    try {
      if (previousElement?.isConnected) (previousElement as HTMLElement).focus();
      else previousWindow?.focus();
    } catch {}
  }
  onKeyDown(event: HandledKey, window: MainWindow, session: MainWindowSession): void {
    if (event._zvPickerHandled) return;
    event._zvPickerHandled = true;
    const picker = session.picker;
    const key = event.key;
    const max = Math.max(0, picker.filtered.length - 1);
    const stop = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (key === 'Escape') {
      stop();
      this.close(session);
      return;
    }
    if (key === 'Enter') {
      stop();
      this.select(window, session);
      return;
    }
    if (key === 'ArrowDown' || (event.ctrlKey && ['j', 'n'].includes(key.toLowerCase()))) {
      stop();
      picker.selected = Math.min(max, picker.selected + 1);
      this.render(session);
      return;
    }
    if (key === 'ArrowUp' || (event.ctrlKey && ['k', 'p'].includes(key.toLowerCase()))) {
      stop();
      picker.selected = Math.max(0, picker.selected - 1);
      this.render(session);
      return;
    }
    if (event.ctrlKey && key.toLowerCase() === 'o' && picker.scope !== 'tabs') {
      stop();
      this.select(window, session);
      void this.#navigation.openPDF(window, session);
      return;
    }
    if (
      picker.scope === 'tabs' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      key.length === 1 &&
      !picker.input?.value.trim()
    ) {
      const index = alphabet.indexOf(key.toLowerCase());
      if (index >= 0 && index < picker.filtered.length) {
        stop();
        picker.selected = index;
        this.select(window, session);
        return;
      }
    }
    if (key === 'y' && picker.scope !== 'tabs') {
      stop();
      if (picker.lastKey === 'y') this.yankKey(window, session);
      else {
        picker.lastKey = 'y';
        if (picker.yTimer) clearTimeout(picker.yTimer);
        picker.yTimer = window.setTimeout(() => this.yankCitation(window, session), 400);
      }
      return;
    }
    event.stopPropagation();
    picker.lastKey = null;
  }
  private filter(session: MainWindowSession, query: string): void {
    const lower = query.toLowerCase().trim();
    session.picker.filtered = (
      lower
        ? session.picker.items.filter((item) => {
            let offset = 0;
            for (const character of lower) {
              const match = item.search.indexOf(character, offset);
              if (match < 0) return false;
              offset = match + 1;
            }
            return true;
          })
        : session.picker.items
    ).slice(0, 100);
    this.render(session);
  }
  private render(session: MainWindowSession): void {
    const container = session.picker.results;
    if (!container) return;
    container.replaceChildren();
    const doc = container.ownerDocument;
    if (!session.picker.filtered.length) {
      container.style.color = THEME_VARS.muted;
      container.textContent = 'No results';
      return;
    }
    session.picker.filtered.forEach((item, index) => {
      const row = doc.createElementNS(H, 'div');
      const selected = index === session.picker.selected;
      row.style.cssText = `padding:6px 12px;cursor:pointer;color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'};background:${selected ? THEME_VARS.selected : 'transparent'}`;
      row.textContent = fuzzyPickerRowText(item, index, session.picker.scope);
      row.addEventListener('click', () => {
        session.picker.selected = index;
        this.select(session.window, session);
      });
      row.addEventListener('mouseenter', () => {
        session.picker.selected = index;
        this.render(session);
      });
      container.append(row);
    });
    container.children[session.picker.selected]?.scrollIntoView({ block: 'nearest' });
  }
  private select(window: MainWindow, session: MainWindowSession): void {
    const item = session.picker.filtered[session.picker.selected];
    if (!item) return;
    try {
      if (session.picker.scope === 'tabs') {
        const tabs = window as unknown as {
          Zotero_Tabs?: {
            select?(id: string): void;
            selectTab?(id: string): void;
            showTab?(id: string): void;
            selectedID?: string;
          };
        };
        (tabs.Zotero_Tabs?.select ?? tabs.Zotero_Tabs?.selectTab ?? tabs.Zotero_Tabs?.showTab)?.(
          String(item.id),
        );
        this.#navigation.afterTabSwitch(window);
      } else
        (
          window as unknown as { ZoteroPane?: { selectItem?(id: number): void } }
        ).ZoteroPane?.selectItem?.(Number(item.id));
    } catch (error) {
      this.#logger.debug(`picker select error: ${String(error)}`);
    }
    this.close(session);
  }
  private yankCitation(window: MainWindow, session: MainWindowSession): void {
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
    this.#navigation.status(session, `✓ ${item.citekey ? `@${item.citekey}` : item.title}`);
    this.close(session);
  }
  private yankKey(window: MainWindow, session: MainWindowSession): void {
    const item = session.picker.filtered[session.picker.selected];
    if (item?.citekey) {
      copyToClipboard(item.citekey);
      this.#navigation.status(session, `✓ @${item.citekey}`);
    } else this.#navigation.status(session, '✗ No citekey');
    this.close(session);
  }
  private async items(window: MainWindow, scope: PickerScope): Promise<PickerItem[]> {
    const library = Zotero.Libraries.userLibraryID;
    const collectionsView = (window as unknown as { ZoteroPane?: { collectionsView?: TreeView } })
      .ZoteroPane?.collectionsView;
    const collection = selectedCollection(collectionsView);
    const source =
      scope === 'collection' && collection
        ? collection.getChildItems(false, false)
        : await Zotero.Items.getAll(library, true, false);
    return source.filter(isFuzzyPickerItem).map((item) => {
      const citekey = citationKey(item);
      const title = item.getField('title') ?? '';
      const year = item.getField('year') ?? '';
      const creator = item.getCreators?.()[0];
      const creatorName = creator as (typeof creator & { name?: string }) | undefined;
      const author = creator?.lastName ?? creatorName?.name ?? '';
      return {
        id: item.id,
        title,
        citekey,
        year,
        author,
        search: `${citekey} ${title} ${author} ${year}`.toLowerCase(),
      };
    });
  }
  private tabs(window: MainWindow): PickerItem[] {
    const tabs = window as unknown as {
      Zotero_Tabs?: {
        _tabs?: {
          id?: string;
          tabID?: string;
          title?: string;
          label?: string;
          type?: string;
          dataset?: DOMStringMap;
        }[];
        tabs?: {
          id?: string;
          tabID?: string;
          title?: string;
          label?: string;
          type?: string;
          dataset?: DOMStringMap;
        }[];
        selectedID?: string;
        _selectedID?: string;
      };
    };
    const source = tabs.Zotero_Tabs?._tabs ?? tabs.Zotero_Tabs?.tabs ?? [];
    const selected = tabs.Zotero_Tabs?.selectedID ?? tabs.Zotero_Tabs?._selectedID;
    return source.flatMap((tab) => {
      const id = tab.id ?? tab.tabID ?? tab.dataset?.id;
      return id
        ? [
            {
              id,
              title: tab.title ?? tab.label ?? tab.dataset?.title ?? id,
              kind: tab.type ?? tab.dataset?.type ?? 'tab',
              selected: id === selected,
              search: `${tab.title ?? tab.label ?? id} ${id}`.toLowerCase(),
            },
          ]
        : [];
    });
  }
}
