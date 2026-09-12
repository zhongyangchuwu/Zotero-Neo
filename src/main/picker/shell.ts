import type { Logger } from '../../core/logging';
import type { CommandPaletteContext, MainWindow } from '../../core/contracts';
import { THEME_VARS } from '../../ui/theme';
import { asElement } from '../../platform/dom';
import type { MainWindowSession } from '../session';
import { MainNavigation } from '../navigation';
import type { PickerItem, PickerScope } from './model';
import type { PickerPane, PickerProvider, PickerProviderCommands } from './types';
import { fuzzyMatchScore } from './fuzzy';
import { createNotesProvider } from './providers/notes';
import { createItemsProvider } from './providers/items';
import { createTabsProvider } from './providers/tabs';
import { createTagsProvider } from './providers/tags';
import { createCommandsProvider } from './providers/commands';

type HandledKey = KeyboardEvent & { _zvPickerHandled?: boolean };
const H = 'http://www.w3.org/1999/xhtml';

function pickerRowFromEvent(event: Event, results: HTMLElement): HTMLElement | null {
  const target = asElement(event.target);
  if (!target) return null;
  const directTarget = (target as HTMLElement).dataset?.zvPickerRow === '1';
  const row = directTarget ? target : target.closest?.('[data-zv-picker-row="1"]');
  if (!row || !Array.from(results.children).includes(row)) return null;
  return row as HTMLElement;
}

function pickerRowIndex(event: Event, results: HTMLElement): number | null {
  const row = pickerRowFromEvent(event, results);
  if (!row) return null;
  const index = Number.parseInt(row.dataset.zvPickerIndex ?? '', 10);
  return Number.isInteger(index) ? index : null;
}

function isPrimaryMouseEvent(event: Event): boolean {
  const button = (event as MouseEvent).button;
  return typeof button !== 'number' || button === 0;
}

export function fuzzyPickerRowText(item: PickerItem, _index: number, _scope: PickerScope): string {
  const metadata = `${item.title || '(untitled)'}${
    item.author ? ` — ${item.author}${item.year ? `, ${item.year}` : ''}` : ''
  }`;
  return item.citekey ? `@${item.citekey}  ${metadata}` : metadata;
}

export class FuzzyPicker {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #mouseEnabled: () => boolean;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    mouseEnabled: () => boolean = () => false,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#mouseEnabled = mouseEnabled;
  }

  async open(
    window: MainWindow,
    session: MainWindowSession,
    scope: PickerScope,
    commandContext?: CommandPaletteContext,
  ): Promise<void> {
    if (session.picker.open) return;
    const generation = ++session.picker.generation;
    let orphanOverlay: HTMLElement | null = null;
    try {
      this.trace(`picker open scope=${scope}`);
      const provider = this.provider(window, session, scope, commandContext);
      const commands = this.createProviderCommands(session);
      session.picker.provider = provider;
      session.picker.commands = commands;
      session.picker.queue = Promise.resolve();
      session.picker.lastDeletedNoteID = null;
      const doc = window.document;
      const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
      const overlay = create('div');
      overlay.id = 'zv-picker-overlay';
      orphanOverlay = overlay;
      overlay.style.cssText = `position:fixed;inset:0;background:${THEME_VARS.backdrop};z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:5vh 3vw`;
      const modal = create('div');
      modal.style.cssText = `background:${THEME_VARS.surface};color:${THEME_VARS.text};width:min(1280px,94vw);height:min(780px,86vh);border:1px solid ${THEME_VARS.border};border-radius:8px;overflow:hidden;box-shadow:0 20px 60px ${THEME_VARS.shadow};font:13px/1.45 monospace`;
      const content = create('div');
      const single = (window.innerWidth || 1024) < 900;
      content.style.cssText = single
        ? 'display:grid;grid-template-columns:1fr;grid-template-rows:minmax(280px,1fr) minmax(180px,.65fr);height:100%;min-height:0'
        : 'display:grid;grid-template-columns:minmax(360px,48%) minmax(0,1fr);height:100%;min-height:0';
      const left = create('section');
      left.style.cssText = `display:flex;flex-direction:column;min-width:0;min-height:0;border-right:${single ? '0' : `1px solid ${THEME_VARS.border}`};border-bottom:${single ? `1px solid ${THEME_VARS.border}` : '0'}`;
      const leftHeader = create('header');
      leftHeader.style.cssText = `display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:4px 12px;color:${THEME_VARS.accent};background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border};font-weight:700`;
      const title = create('span');
      title.textContent = provider.title;
      title.style.gridColumn = '2';
      const count = create('span');
      count.style.cssText = `grid-column:3;justify-self:end;color:${THEME_VARS.muted}`;
      leftHeader.append(title, count);
      const input = create('input') as HTMLInputElement;
      input.type = 'text';
      input.placeholder = provider.placeholder;
      input.style.cssText = `margin:8px 10px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};outline:2px solid ${THEME_VARS.focusRing};outline-offset:1px;border-radius:3px;padding:7px 10px;font:13px/1 monospace`;
      const results = create('div');
      results.style.cssText = 'overflow:auto;flex:1;min-height:0;outline:none;padding:2px 0';
      results.tabIndex = -1;
      let shortcuts: HTMLElement | null = null;
      let queryHelp: HTMLElement | null = null;
      let listHelp: HTMLElement | null = null;
      const helpStyle = (): HTMLElement => {
        const help = create('div');
        help.style.cssText = `flex:0 0 auto;min-height:18px;padding:0 10px 6px;color:${THEME_VARS.muted};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
        return help;
      };
      if (provider.help) {
        queryHelp = helpStyle();
        listHelp = helpStyle();
        queryHelp.textContent = provider.help.query;
        listHelp.textContent = provider.help.list;
        left.append(leftHeader, input, queryHelp, results, listHelp);
      } else {
        shortcuts = helpStyle();
        shortcuts.textContent = this.shortcutReference();
        left.append(leftHeader, input, shortcuts, results);
      }

      const right = create('section');
      right.style.cssText = 'display:flex;flex-direction:column;min-width:0;min-height:0';
      const rightHeader = create('header');
      rightHeader.style.cssText = `padding:4px 12px;text-align:center;color:${THEME_VARS.accent};background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
      const previewTitle = create('span');
      previewTitle.textContent = 'Preview';
      rightHeader.append(previewTitle);
      const preview = create('div');
      preview.tabIndex = -1;
      preview.style.cssText = `overflow:auto;flex:1;min-height:0;outline:none;padding:14px 16px;white-space:pre-wrap;color:${THEME_VARS.text};background:${THEME_VARS.elevated}`;
      right.append(rightHeader, preview);
      content.append(left, right);
      modal.append(content);
      overlay.append(modal);
      (doc.body ?? doc.documentElement).append(overlay);
      const themeCleanup = session.theme.add(overlay);
      const focusedWindow = Services.focus?.focusedWindow as unknown as Window | null;
      session.picker = {
        ...session.picker,
        open: true,
        scope,
        overlay,
        input,
        results,
        preview,
        count,
        previewTitle,
        help: shortcuts,
        queryHelp,
        listHelp,
        selected: 0,
        filtered: [],
        items: [],
        focusPane: provider.initialFocusPane ?? 'search',
        layout: single ? 'single' : 'dual',
        previousElement: doc.activeElement,
        previousWindow: focusedWindow,
        themeCleanup,
      };
      provider.initialize?.(session.picker.commands!);
      orphanOverlay = null;
      this.trace(`picker mounted scope=${scope} layout=${single ? 'single' : 'dual'}`);
      const loadStartedAt = Date.now();
      const inputHandler = (): void => {
        const focusID = provider.filter
          ? String(session.picker.filtered[session.picker.selected]?.id ?? '')
          : '';
        if (provider.filter) provider.filter(input.value, session.picker.commands!, focusID);
        else {
          session.picker.selected = 0;
          this.filter(session, input.value);
        }
      };
      input.addEventListener('input', inputHandler);
      input.addEventListener('focus', () => {
        if (provider.searchFocusUpdates !== false) this.markFocus(session, 'search');
      });
      input.addEventListener('click', () => {
        if (provider.inputClick) provider.inputClick(session.picker.commands!);
        else this.markFocus(session, 'search');
      });
      const pointerRowHandler = (event: Event): void => {
        if (!this.#mouseEnabled() || session.picker.scope === 'tags' || !isPrimaryMouseEvent(event))
          return;
        const index = pickerRowIndex(event, results);
        if (index === null || index < 0 || index >= session.picker.filtered.length) return;
        event.preventDefault();
        event.stopPropagation();
        this.focusPane(session, 'list');
        this.selectRow(session, index);
      };
      const doubleClickRowHandler = (event: Event): void => {
        if (!this.#mouseEnabled() || session.picker.scope === 'tags' || !isPrimaryMouseEvent(event))
          return;
        const index = pickerRowIndex(event, results);
        const item = index === null ? undefined : session.picker.filtered[index];
        if (index === null || !item) return;
        const generation = session.picker.generation;
        const itemID = item.id;
        event.preventDefault();
        event.stopPropagation();
        this.focusPane(session, 'list');
        this.selectRow(session, index);
        void this.enqueue(session, 'pointer select result', async () => {
          if (!this.isCurrent(session, generation)) return;
          const currentIndex = session.picker.filtered.findIndex(
            (candidate) => candidate.id === itemID,
          );
          if (currentIndex < 0) return;
          this.selectRow(session, currentIndex);
          await this.select(window, session, false);
        });
      };
      results.addEventListener('click', pointerRowHandler);
      results.addEventListener('dblclick', doubleClickRowHandler);
      session.picker.inputCleanup = () => {
        input.removeEventListener('input', inputHandler);
        results.removeEventListener('click', pointerRowHandler);
        results.removeEventListener('dblclick', doubleClickRowHandler);
      };
      results.addEventListener('focus', () => this.markFocus(session, 'list'));
      preview.addEventListener('focus', () => this.markFocus(session, 'preview'));
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) this.close(session);
      });
      if (provider.loadingText) {
        results.style.color = THEME_VARS.muted;
        results.textContent = provider.loadingText;
      }
      window.setTimeout(() => {
        if (!this.isCurrent(session, generation)) return;
        session.picker.commands!.focusPane(provider.initialFocusPane ?? 'search');
      }, 30);
      try {
        const items = await provider.load();
        if (!this.isCurrent(session, generation)) {
          this.trace(`picker load discarded scope=${scope} generation=${generation}`);
          return;
        }
        session.picker.items = items;
        if (provider.filter) provider.filter('', session.picker.commands!);
        else this.filter(session, '');
        this.trace(
          `picker loaded scope=${scope} items=${items.length} duration=${Date.now() - loadStartedAt}ms`,
        );
      } catch (error) {
        if (!this.isCurrent(session, generation)) {
          this.trace(`picker load failure discarded scope=${scope} generation=${generation}`);
          return;
        }
        this.failure(`picker load scope=${scope}`, error);
        results.textContent = `Error loading ${scope}: ${String(error).slice(0, 80)}`;
      }
    } catch (error) {
      this.failure(`picker open scope=${scope}`, error);
      if (session.picker.open) this.close(session);
      else {
        orphanOverlay?.remove();
        session.picker.inputCleanup?.();
        session.picker.inputCleanup = null;
        session.picker.provider = null;
        session.picker.commands = null;
        session.picker.queue = Promise.resolve();
        session.picker.lastDeletedNoteID = null;
      }
      this.#navigation.status(session, `✗ Unable to open ${scope} picker`);
    }
  }
  close(session: MainWindowSession): void {
    if (!session.picker.open) return;
    session.picker.provider?.onClose?.();
    this.trace(`picker close scope=${session.picker.scope}`);
    const { overlay, previousElement, previousWindow, yTimer, commandTimer, themeCleanup } =
      session.picker;
    session.picker.provider = null;
    session.picker.commands = null;
    session.picker.queue = Promise.resolve();
    session.picker.lastDeletedNoteID = null;
    clearTimeout(yTimer);
    clearTimeout(commandTimer);
    session.picker.inputCleanup?.();
    session.picker.inputCleanup = null;
    themeCleanup?.();
    overlay?.remove();
    session.picker.generation += 1;
    session.picker.open = false;
    session.picker.help = null;
    session.picker.queryHelp = null;
    session.picker.listHelp = null;
    session.picker.input = null;
    session.picker.results = null;
    session.picker.preview = null;
    session.picker.count = null;
    session.picker.previewTitle = null;
    session.picker.items = [];
    session.picker.filtered = [];
    session.picker.selected = 0;
    session.picker.lastKey = null;
    session.picker.yTimer = undefined;
    session.picker.command = '';
    session.picker.themeCleanup = null;
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
    const lower = key.toLowerCase();
    const stop = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };
    const max = Math.max(0, picker.filtered.length - 1);
    if (event.ctrlKey && ['j', 'n'].includes(lower)) {
      stop();
      picker.selected = Math.min(max, picker.selected + 1);
      this.render(session);
      return;
    }
    if (event.ctrlKey && ['k', 'p'].includes(lower)) {
      stop();
      picker.selected = Math.max(0, picker.selected - 1);
      this.render(session);
      return;
    }
    if (event.ctrlKey && (lower === 'd' || lower === 'u')) {
      stop();
      const amount = Math.max(120, Math.floor((picker.preview?.clientHeight || 480) / 2));
      picker.preview?.scrollBy({ top: lower === 'd' ? amount : -amount });
      return;
    }
    if (key === 'Escape') {
      stop();
      if (session.picker.provider?.onEscape?.(session.picker.commands!)) return;
      this.close(session);
      return;
    }
    if (session.picker.provider?.onKeyDown?.(event, session.picker.commands!)) return;
    if (event.target !== picker.input && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (key === 'ArrowDown' || lower === 'j') {
        stop();
        picker.selected = Math.min(max, picker.selected + 1);
        this.render(session);
        return;
      }
      if (key === 'ArrowUp' || lower === 'k') {
        stop();
        picker.selected = Math.max(0, picker.selected - 1);
        this.render(session);
        return;
      }
    }
    if (key === 'Enter') {
      stop();
      void this.enqueue(session, 'select result', () =>
        this.select(window, session, event.shiftKey),
      );
      return;
    }
    event.stopPropagation();
    picker.lastKey = null;
  }

  private filter(session: MainWindowSession, query: string): void {
    const startedAt = Date.now();
    const ranked = session.picker.items.flatMap((item, index) => {
      const score = fuzzyMatchScore(item.search, query);
      return score === null ? [] : [{ item, index, score }];
    });
    if (query.trim()) ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    session.picker.filtered = ranked.slice(0, 100).map(({ item }) => item);
    session.picker.selected = Math.max(
      0,
      Math.min(session.picker.selected, Math.max(0, session.picker.filtered.length - 1)),
    );
    this.render(session);
    this.traceSlowFilter(session, query, ranked.length, startedAt);
  }

  private selectRow(session: MainWindowSession, index: number): void {
    if (index < 0 || index >= session.picker.filtered.length) return;
    session.picker.selected = index;
    this.refreshRowSelection(session);
    this.renderPreview(session);
  }

  private refreshRowSelection(session: MainWindowSession): void {
    const results = session.picker.results;
    if (!results) return;
    const mouseEnabled = this.#mouseEnabled() && session.picker.scope !== 'tags';
    Array.from(results.children).forEach((child, index) =>
      this.styleRow(child as HTMLElement, index === session.picker.selected, mouseEnabled),
    );
  }

  private styleRow(row: HTMLElement, selected: boolean, mouseEnabled: boolean): void {
    row.style.cssText = `padding:6px 12px;cursor:${mouseEnabled ? 'pointer' : 'default'};color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'};background:${selected ? THEME_VARS.selected : 'transparent'}`;
  }

  private render(session: MainWindowSession): void {
    const container = session.picker.results;
    if (!container) return;
    container.replaceChildren();
    const provider = session.picker.provider;
    if (session.picker.count)
      session.picker.count.textContent =
        provider?.countText?.(session.picker.filtered.length, session.picker.items.length) ??
        `${session.picker.filtered.length}/${session.picker.items.length}`;
    if (session.picker.help) session.picker.help.textContent = this.shortcutReference();
    const doc = container.ownerDocument;
    const query = session.picker.input?.value.trim() ?? '';
    if (!session.picker.filtered.length) {
      container.textContent = provider?.emptyText?.(query) ?? 'No results';
      this.renderPreview(session);
      return;
    }
    container.style.color = THEME_VARS.text;
    const mouseEnabled = this.#mouseEnabled() && session.picker.scope !== 'tags';
    session.picker.filtered.forEach((item, index) => {
      const row = doc.createElementNS(H, 'div');
      row.dataset.zvPickerRow = '1';
      row.dataset.zvPickerIndex = String(index);
      this.styleRow(row, index === session.picker.selected, mouseEnabled);
      const label = doc.createElementNS(H, 'span');
      label.textContent =
        provider?.rowText(item, index) ?? fuzzyPickerRowText(item, index, session.picker.scope);
      provider?.onRowRender?.(row, item);
      row.append(label);
      container.append(row);
    });
    container.children[session.picker.selected]?.scrollIntoView({ block: 'nearest' });
    this.renderPreview(session);
  }

  private renderPreview(session: MainWindowSession): void {
    const preview = session.picker.preview;
    const title = session.picker.previewTitle;
    if (!preview || !title) return;
    preview.replaceChildren();
    const item = session.picker.filtered[session.picker.selected];
    if (!item) {
      title.textContent = 'Preview';
      preview.textContent = 'No result selected.';
      return;
    }
    const content = session.picker.provider?.preview(item);
    title.textContent = (content?.title ?? item.title) || '(untitled)';
    preview.textContent = content?.body ?? item.title;
  }

  private async select(
    window: MainWindow,
    session: MainWindowSession,
    openInWindow: boolean,
    closeWhenDone = true,
  ): Promise<boolean> {
    const item = session.picker.filtered[session.picker.selected];
    if (!item) return false;
    const provider = session.picker.provider;
    if (!provider) return false;
    const generation = session.picker.generation;
    const closeBeforeActivate = provider.closeBeforeActivate === true && closeWhenDone;
    if (closeBeforeActivate) this.close(session);
    try {
      const pending = provider.activate(item, openInWindow);
      if (pending) await pending;
    } catch (error) {
      this.failure(`picker select scope=${session.picker.scope}`, error);
      return false;
    }
    if (closeBeforeActivate) return true;
    if (!this.isCurrent(session, generation)) return false;
    if (closeWhenDone) this.close(session);
    return true;
  }

  private enqueue(
    session: MainWindowSession,
    label: string,
    operation: () => Promise<unknown> | void,
  ): Promise<void> {
    const generation = session.picker.generation;
    const previous = session.picker.queue;
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrent(session, generation)) {
          this.trace(`picker action discarded action=${label} generation=${generation}`);
          return;
        }
        this.trace(`picker action start action=${label}`);
        await operation();
      })
      .catch((error) => this.failure(`picker action=${label}`, error));
    session.picker.queue = next;
    return next;
  }
  private createProviderCommands(session: MainWindowSession): PickerProviderCommands {
    return {
      render: () => this.render(session),
      filter: (query, focusID) => this.filter(session, query ?? session.picker.input?.value ?? ''),
      focusPane: (pane: PickerPane) => this.focusPane(session, pane),
      select: (openInWindow: boolean, closeWhenDone = true) =>
        this.select(session.window, session, openInWindow, closeWhenDone),
      close: () => this.close(session),
      enqueue: (label: string, operation: () => Promise<unknown> | void) => {
        void this.enqueue(session, label, operation);
      },
      armCommand: (command: string) => this.armCommand(session.window, session, command),
      isCurrent: (generation: number) => this.isCurrent(session, generation),
    };
  }
  private traceSlowFilter(
    session: MainWindowSession,
    query: string,
    matches: number,
    startedAt: number,
  ): void {
    const duration = Date.now() - startedAt;
    if (duration >= 50)
      this.trace(
        `picker filter scope=${session.picker.scope} queryLength=${query.trim().length} matches=${matches} duration=${duration}ms`,
      );
  }

  private focusPane(session: MainWindowSession, pane: PickerPane): boolean {
    const target =
      pane === 'search'
        ? session.picker.input
        : pane === 'list'
          ? session.picker.results
          : session.picker.preview;
    if (!target) return false;
    target.focus();
    this.markFocus(session, pane);
    return true;
  }

  private markFocus(session: MainWindowSession, pane: PickerPane): void {
    session.picker.focusPane = pane;
    if (session.picker.results)
      session.picker.results.style.boxShadow =
        pane === 'list' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
    if (session.picker.preview)
      session.picker.preview.style.boxShadow =
        pane === 'preview' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
  }

  private armCommand(window: MainWindow, session: MainWindowSession, command: string): void {
    session.picker.command = command;
    clearTimeout(session.picker.commandTimer);
    session.picker.commandTimer = window.setTimeout(() => {
      session.picker.command = '';
      session.picker.commandTimer = undefined;
    }, 700);
  }

  private provider(
    window: MainWindow,
    session: MainWindowSession,
    scope: PickerScope,
    commandContext?: CommandPaletteContext,
  ): PickerProvider {
    switch (scope) {
      case 'all':
      case 'collection':
        return createItemsProvider(window, session, scope, this.#navigation);
      case 'tabs':
        return createTabsProvider(window, this.#navigation);
      case 'notes':
        return createNotesProvider(window, session, this.#navigation, this.#logger);
      case 'tags':
        return createTagsProvider(window, session, this.#navigation, this.#logger);
      case 'commands':
        if (!commandContext) throw new Error('Command palette context missing');
        return createCommandsProvider(commandContext);
      default: {
        const exhaustive: never = scope;
        return exhaustive;
      }
    }
  }

  private trace(message: string): void {
    this.#logger.debug(message);
    this.#logger.diagnostic(message);
  }

  private failure(context: string, error: unknown): void {
    const record =
      error && typeof error === 'object'
        ? (error as {
            readonly name?: unknown;
            readonly message?: unknown;
            readonly stack?: unknown;
          })
        : null;
    const summary = record?.message
      ? `${typeof record.name === 'string' ? `${record.name}: ` : ''}${String(record.message)}`
      : String(error);
    const stack =
      typeof record?.stack === 'string'
        ? record.stack
            .split(/\s*\n\s*/)
            .slice(1, 7)
            .join(' <- ')
        : '';
    this.trace(`${context} FAILED: ${summary}${stack ? ` | ${stack}` : ''}`);
  }

  private isCurrent(session: MainWindowSession, generation: number): boolean {
    return session.picker.open && session.picker.generation === generation;
  }

  private shortcutReference(): string {
    return 'Search · Ctrl+j/k select · Ctrl+d/u preview · Enter apply · Esc close';
  }
}
