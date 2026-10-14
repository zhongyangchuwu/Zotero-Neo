import type { Logger } from '../../core/logging';
import type { CommandPaletteContext, MainWindow } from '../../core/contracts';
import { THEME_VARS } from '../../ui/theme';
import { asElement } from '../../platform/dom';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import type { MainWindowSession } from '../session';
import { MainNavigation } from '../navigation';
import type { PickerItem, PickerScope } from './model';
import type { PickerCloseReason, PickerOpenOptions, PickerPane, PickerProvider } from './types';
import { fuzzyMatchScore } from './fuzzy';
import { createNotesProvider } from './providers/notes';
import { createItemsProvider } from './providers/items';
import { createTabsProvider } from './providers/tabs';
import { createCommandsProvider } from './providers/commands';

import { ACTION_LABELS, type ActionId } from '../../input/actions';
import { DEFAULT_BINDINGS, type BindingContext, type BindingMap } from '../../input/bindings';
import { LocalBindingRuntime } from '../../input/local-binding-runtime';
import { nativeReservation, shortcutsForAction } from '../../input/shortcut-catalog';
import { keyString } from '../../input/keys';
import { serializeBindingTokens } from '../../input/key-sequence';
import { PICKER_INPUT_ACTIONS, PICKER_LIST_ACTIONS } from './action-capabilities';
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
  readonly #bindings: () => BindingMap;
  readonly #sessions = new WeakSet<MainWindowSession>();

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    mouseEnabled: () => boolean = () => false,
    bindings: () => BindingMap = () => DEFAULT_BINDINGS,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#mouseEnabled = mouseEnabled;
    this.#bindings = bindings;
  }

  async open(
    window: MainWindow,
    session: MainWindowSession,
    scope: PickerScope,
    options: PickerOpenOptions = {},
  ): Promise<void> {
    if (session.picker.open) return;
    this.#navigation.panel(window, session);
    const generation = ++session.picker.generation;
    if (!this.#sessions.has(session)) {
      this.#sessions.add(session);
      session.cleanup.add(() => this.close(session));
    }
    let orphanOverlay: HTMLElement | null = null;
    try {
      this.trace(`picker open scope=${scope}`);
      const provider = options.source ?? this.provider(window, scope, options.commandContext);
      session.picker.provider = provider;
      session.picker.confirm = options.confirm ?? null;
      session.picker.closeBeforeConfirm = options.closeBeforeConfirm ?? false;
      session.picker.onClose = options.onClose ?? null;
      session.picker.queue = Promise.resolve();
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
      const sourceButton = provider.alternateSource
        ? (create('button') as HTMLButtonElement)
        : null;
      if (sourceButton) {
        sourceButton.type = 'button';
        sourceButton.style.cssText = `grid-column:1;grid-row:1;justify-self:start;font:inherit;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:3px;padding:2px 6px`;
        leftHeader.append(sourceButton);
      }
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
        shortcuts.textContent = this.shortcutReference('picker-input');
        left.append(leftHeader, input, shortcuts, results);
      }
      const operationStatus = create('div');
      operationStatus.setAttribute('role', 'status');
      operationStatus.setAttribute('aria-live', 'polite');
      operationStatus.setAttribute('aria-atomic', 'true');
      operationStatus.style.cssText = `padding:0 10px 6px;color:${THEME_VARS.text};font-size:12px`;
      operationStatus.hidden = true;
      left.append(operationStatus);

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
      Object.assign(session.picker, {
        open: true,
        scope,
        overlay,
        input,
        composition: { active: false },
        committedQuery: '',
        confirming: false,
        sourceTitle: title,
        sourceButton,
        operationStatus,
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
      });
      session.picker.localBindings = new LocalBindingRuntime({
        bindings: this.#bindings,
        execute: (action, event) =>
          this.isCurrent(session, generation) && this.execute(action, event, session),
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        clearTimer: (timer) => window.clearTimeout(timer),
      });
      orphanOverlay = null;
      this.trace(`picker mounted scope=${scope} layout=${single ? 'single' : 'dual'}`);
      this.refreshSource(session);
      const compositionCleanup = bindCompositionState(input, session.picker.composition);
      const localBindings = session.picker.localBindings;
      const deactivate = (): void => localBindings?.deactivate();
      const compositionStart = (): void => {
        localBindings?.deactivate();
        this.refreshSource(session);
      };
      const compositionEnd = (): void => this.refreshSource(session);
      input.addEventListener('compositionstart', compositionStart);
      input.addEventListener('compositionend', compositionEnd);
      overlay.addEventListener('focusout', deactivate);
      const inputHandler = (event: Event): void => {
        if (!this.isCurrent(session, generation)) return;
        if (!isCommittedInput(event, session.picker.composition.active)) return;
        session.picker.selected = 0;
        session.picker.committedQuery = input.value;
        this.filter(session, input.value);
      };
      input.addEventListener('input', inputHandler);
      const focusSearch = (): void => {
        if (this.isCurrent(session, generation)) this.markFocus(session, 'search');
      };
      const focusList = (): void => {
        if (this.isCurrent(session, generation)) this.markFocus(session, 'list');
      };
      const focusPreview = (): void => {
        if (this.isCurrent(session, generation)) this.markFocus(session, 'preview');
      };
      input.addEventListener('focus', focusSearch);
      input.addEventListener('click', focusSearch);
      results.addEventListener('focus', focusList);
      preview.addEventListener('focus', focusPreview);
      const pointerRowHandler = (event: Event): void => {
        if (!this.isCurrent(session, generation)) return;
        if (!this.#mouseEnabled() || !isPrimaryMouseEvent(event)) return;
        const index = pickerRowIndex(event, results);
        if (index === null || index < 0 || index >= session.picker.filtered.length) return;
        session.picker.localBindings?.deactivate();
        event.preventDefault();
        event.stopPropagation();
        this.focusPane(session, 'list');
        this.selectRow(session, index);
      };
      const doubleClickRowHandler = (event: Event): void => {
        if (!this.isCurrent(session, generation)) return;
        if (!this.#mouseEnabled() || !isPrimaryMouseEvent(event)) return;
        const index = pickerRowIndex(event, results);
        const item = index === null ? undefined : session.picker.filtered[index];
        if (index === null || !item) return;
        session.picker.localBindings?.deactivate();
        // Selection previews may change while a previously admitted operation is pending.
        event.preventDefault();
        event.stopPropagation();
        this.focusPane(session, 'list');
        this.selectRow(session, index);
        this.admitConfirmation(session, (event as MouseEvent).shiftKey ?? false);
      };
      results.addEventListener('click', pointerRowHandler);
      results.addEventListener('dblclick', doubleClickRowHandler);
      const sourceHandler = (event: Event): void => {
        if (!this.isCurrent(session, generation)) return;
        // Native button keyboard activation has detail=0; pointer activation obeys mouse policy.
        if ((event as MouseEvent).detail !== 0 && !this.#mouseEnabled()) return;
        if (!isPrimaryMouseEvent(event)) return;
        event.stopPropagation();
        this.switchSource(session);
      };
      sourceButton?.addEventListener('click', sourceHandler);
      const backdropHandler = (event: Event): void => {
        if (this.isCurrent(session, generation) && event.target === overlay) this.cancel(session);
      };
      overlay.addEventListener('mousedown', backdropHandler);
      session.picker.inputCleanup = () => {
        compositionCleanup();
        input.removeEventListener('compositionstart', compositionStart);
        input.removeEventListener('compositionend', compositionEnd);
        overlay.removeEventListener('focusout', deactivate);
        input.removeEventListener('input', inputHandler);
        input.removeEventListener('focus', focusSearch);
        input.removeEventListener('click', focusSearch);
        results.removeEventListener('focus', focusList);
        preview.removeEventListener('focus', focusPreview);
        results.removeEventListener('click', pointerRowHandler);
        results.removeEventListener('dblclick', doubleClickRowHandler);
        sourceButton?.removeEventListener('click', sourceHandler);
        overlay.removeEventListener('mousedown', backdropHandler);
      };
      const sourceRevision = ++session.picker.sourceRevision;
      window.setTimeout(() => {
        if (!this.isCurrent(session, generation)) return;
        this.focusPane(session, session.picker.provider?.initialFocusPane ?? 'search');
      }, 30);
      await this.loadSource(session, provider, generation, sourceRevision);
    } catch (error) {
      this.failure(`picker open scope=${scope}`, error);
      if (session.picker.open) this.close(session);
      else {
        orphanOverlay?.remove();
        session.picker.inputCleanup?.();
        session.picker.inputCleanup = null;
        session.picker.provider = null;
        session.picker.confirm = null;
        session.picker.closeBeforeConfirm = false;
        const onClose = session.picker.onClose;
        session.picker.onClose = null;
        session.picker.queue = Promise.resolve();
        try {
          onClose?.('retire');
        } catch (closeError) {
          this.failure('picker onClose after open failure', closeError);
        }
      }
      this.#navigation.status(session, `✗ Unable to open ${scope} picker`);
    }
  }
  close(session: MainWindowSession, reason: PickerCloseReason = 'retire'): void {
    if (!session.picker.open) return;
    session.picker.localBindings?.dispose();
    session.picker.localBindings = null;
    this.trace(`picker close scope=${session.picker.scope}`);
    const { overlay, previousElement, previousWindow, themeCleanup, onClose } = session.picker;
    session.picker.provider = null;
    session.picker.confirm = null;
    session.picker.closeBeforeConfirm = false;
    session.picker.onClose = null;
    session.picker.queue = Promise.resolve();
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
    session.picker.composition.active = false;
    session.picker.committedQuery = '';
    session.picker.confirming = false;
    session.picker.sourceTitle = null;
    session.picker.sourceButton = null;
    session.picker.operationStatus = null;
    session.picker.results = null;
    session.picker.preview = null;
    session.picker.count = null;
    session.picker.previewTitle = null;
    session.picker.items = [];
    session.picker.filtered = [];
    session.picker.selected = 0;
    session.picker.themeCleanup = null;
    try {
      if (previousElement?.isConnected) (previousElement as HTMLElement).focus();
      else previousWindow?.focus();
    } catch {}
    try {
      onClose?.(reason);
    } catch (error) {
      this.failure('picker onClose', error);
    }
  }

  onKeyDown(event: HandledKey, window: MainWindow, session: MainWindowSession): void {
    if (event._zvPickerHandled || !session.picker.open) return;
    const picker = session.picker;
    let target = asElement(event.target);
    while (
      target &&
      target !== picker.input &&
      target !== picker.results &&
      target !== picker.preview &&
      target !== picker.sourceButton
    )
      target = target.parentElement;
    if (!target) {
      picker.localBindings?.deactivate();
      return;
    }
    event._zvPickerHandled = true;
    if (
      compositionOwnsKey(event, picker.composition.active) ||
      event.getModifierState?.('AltGraph')
    ) {
      picker.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    const sourceButtonFocused = target === picker.sourceButton;
    if (
      sourceButtonFocused &&
      (event.key === 'Enter' || event.key === 'Return' || event.key === ' ' || event.key === 'Tab')
    ) {
      picker.localBindings?.deactivate();
      return;
    }
    const context = target === picker.input || sourceButtonFocused ? 'picker-input' : 'picker-list';
    const key = keyString(event);
    if (key && nativeReservation(context, serializeBindingTokens([key])) === 'exclusive') {
      picker.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    if (!sourceButtonFocused)
      this.markFocus(
        session,
        target === picker.input ? 'search' : target === picker.results ? 'list' : 'preview',
      );
    if (picker.localBindings?.handle(event, context)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
    event.stopPropagation();
    void window;
  }

  private execute(
    action: ActionId,
    event: KeyboardEvent | null,
    session: MainWindowSession,
  ): boolean {
    const picker = session.picker;
    const actions: readonly ActionId[] =
      picker.focusPane === 'search' ? PICKER_INPUT_ACTIONS : PICKER_LIST_ACTIONS;
    if (!actions.includes(action)) return false;
    switch (action) {
      case 'uiNext':
        this.moveSelection(session, 1);
        break;
      case 'uiPrevious':
        this.moveSelection(session, -1);
        break;
      case 'uiFirst':
        this.selectRow(session, 0);
        break;
      case 'uiLast':
        this.selectRow(session, picker.filtered.length - 1);
        break;
      case 'uiConfirm':
        this.admitConfirmation(session, event?.shiftKey ?? false);
        break;
      case 'uiCancel':
        this.cancel(session);
        break;
      case 'uiSearch':
        this.focusPane(session, 'search');
        picker.input?.select();
        break;
      case 'uiFocusList':
        this.focusPane(session, 'list');
        break;
      case 'uiPreviewDown':
      case 'uiPreviewUp': {
        const amount = Math.max(120, Math.floor((picker.preview?.clientHeight || 480) / 2));
        picker.preview?.scrollBy({ top: action === 'uiPreviewDown' ? amount : -amount });
        break;
      }
      case 'uiNextPane':
      case 'uiPreviousPane': {
        const panes: readonly PickerPane[] = ['search', 'list', 'preview'];
        const offset = action === 'uiNextPane' ? 1 : 2;
        this.focusPane(session, panes[(panes.indexOf(picker.focusPane) + offset) % panes.length]!);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  private filter(session: MainWindowSession, query: string): void {
    const startedAt = Date.now();
    const provider = session.picker.provider;
    if (provider?.filterItems) {
      const filtered = provider.filterItems(session.picker.items, query).slice(0, 100);
      session.picker.filtered = filtered;
      session.picker.selected = Math.max(
        0,
        Math.min(session.picker.selected, Math.max(0, filtered.length - 1)),
      );
      this.render(session);
      this.traceSlowFilter(session, query, filtered.length, startedAt);
      return;
    }
    const needle = query.trim();
    let matches = session.picker.items.length;
    if (!needle) {
      session.picker.filtered = session.picker.items.slice(0, 100);
    } else {
      const ranked: Array<{ item: PickerItem; score: number }> = [];
      matches = 0;
      for (const item of session.picker.items) {
        const score = fuzzyMatchScore(item.search, needle);
        if (score === null) continue;
        matches += 1;
        if (ranked.length === 100 && score <= ranked[99]!.score) continue;
        let start = 0;
        let end = ranked.length;
        while (start < end) {
          const middle = (start + end) >>> 1;
          if (score > ranked[middle]!.score) end = middle;
          else start = middle + 1;
        }
        // Insert after equal scores to preserve source order, including at the result cap.
        ranked.splice(start, 0, { item, score });
        if (ranked.length > 100) ranked.pop();
      }
      session.picker.filtered = ranked.map(({ item }) => item);
    }
    session.picker.selected = Math.max(
      0,
      Math.min(session.picker.selected, Math.max(0, session.picker.filtered.length - 1)),
    );
    this.render(session);
    this.traceSlowFilter(session, query, matches, startedAt);
  }

  private moveSelection(session: MainWindowSession, direction: -1 | 1): void {
    const max = Math.max(0, session.picker.filtered.length - 1);
    this.selectRow(session, Math.max(0, Math.min(max, session.picker.selected + direction)));
    session.picker.results?.children[session.picker.selected]?.scrollIntoView({ block: 'nearest' });
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
    const mouseEnabled = this.#mouseEnabled();
    Array.from(results.children).forEach((child, index) =>
      this.styleRow(child as HTMLElement, index === session.picker.selected, mouseEnabled),
    );
  }

  private styleRow(row: HTMLElement, selected: boolean, mouseEnabled: boolean): void {
    row.style.cssText = `padding:6px 12px;cursor:${mouseEnabled ? 'pointer' : 'default'};color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'};background:${selected ? THEME_VARS.selected : 'transparent'}`;
    row.style.borderTop =
      row.dataset.zvPickerBoundary === '1' ? `1px solid ${THEME_VARS.border}` : '0';
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
    this.refreshHints(session);
    const doc = container.ownerDocument;
    const query = session.picker.committedQuery.trim();
    if (!session.picker.filtered.length) {
      container.textContent = provider?.emptyText?.(query) ?? 'No results';
      this.renderPreview(session);
      return;
    }
    container.style.color = THEME_VARS.text;
    const mouseEnabled = this.#mouseEnabled();
    session.picker.filtered.forEach((item, index) => {
      const row = doc.createElementNS(H, 'div');
      row.dataset.zvPickerRow = '1';
      row.dataset.zvPickerIndex = String(index);
      const previousGroup = session.picker.filtered[index - 1]?.group;
      if (item.group && previousGroup && item.group !== previousGroup)
        row.dataset.zvPickerBoundary = '1';
      this.styleRow(row, index === session.picker.selected, mouseEnabled);
      const label = doc.createElementNS(H, 'span');
      label.textContent =
        provider?.rowText(item, index) ?? fuzzyPickerRowText(item, index, session.picker.scope);
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

  private admitConfirmation(session: MainWindowSession, openInWindow: boolean): void {
    const picker = session.picker;
    if (picker.confirming || picker.composition.active) return;
    const candidate = picker.filtered[picker.selected];
    const provider = picker.provider;
    if (!candidate || !provider) return;
    // Admission is synchronous: later previews and repeated activation cannot change this target.
    const itemID = candidate.id;
    const itemTitle = candidate.title || '(untitled)';
    const generation = picker.generation;
    const sourceRevision = picker.sourceRevision;
    const confirm = picker.confirm;
    const closeBeforeConfirm = picker.closeBeforeConfirm;
    const scope = picker.scope;
    picker.confirming = true;
    this.refreshSource(session);
    this.setOperationStatus(session, `Confirming “${itemTitle}”…`);
    picker.queue = picker.queue
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrentSource(session, generation, sourceRevision, provider)) {
          this.trace(`picker action discarded action=select result generation=${generation}`);
          return;
        }
        const item = picker.filtered.find((candidate) => candidate.id === itemID);
        if (!item) {
          this.setOperationStatus(session, 'Result is no longer available. Select another result.');
          return;
        }
        this.trace('picker action start action=select result');
        const refinement = provider.refineQuery?.(item);
        if (refinement !== undefined && refinement !== null) {
          const input = picker.input;
          if (!input) return;
          input.value = refinement;
          picker.committedQuery = refinement;
          picker.selected = 0;
          this.filter(session, refinement);
          this.focusPane(session, 'search');
          input.select();
          this.setOperationStatus(session, '');
          return;
        }
        if (!confirm) {
          this.setOperationStatus(session, '');
          return;
        }
        if (closeBeforeConfirm) this.close(session, 'confirm');
        await confirm(item, openInWindow);
        if (!closeBeforeConfirm && this.isCurrent(session, generation))
          this.close(session, 'confirm');
      })
      .catch((error) => {
        this.failure(`picker confirm scope=${scope}`, error);
        const message = `Unable to confirm “${itemTitle}”: ${String(error).slice(0, 160)}`;
        if (this.isCurrentSource(session, generation, sourceRevision, provider))
          this.setOperationStatus(session, message);
        else if (closeBeforeConfirm && !picker.open && picker.generation === generation + 1)
          this.#navigation.status(session, `✗ ${message}`);
      })
      .finally(() => {
        if (!this.isCurrent(session, generation)) return;
        picker.confirming = false;
        this.refreshSource(session);
      });
  }

  private cancel(session: MainWindowSession): void {
    if (session.picker.confirming) return;
    this.close(session, 'cancel');
  }

  private setOperationStatus(session: MainWindowSession, message: string): void {
    const status = session.picker.operationStatus;
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  private refreshSource(session: MainWindowSession): void {
    const picker = session.picker;
    const provider = picker.provider;
    if (!provider) return;
    if (picker.sourceTitle) picker.sourceTitle.textContent = provider.title;
    if (picker.input) picker.input.placeholder = provider.placeholder;
    if (picker.sourceButton) {
      picker.sourceButton.textContent = provider.alternateSource?.label ?? '';
      picker.sourceButton.hidden = !provider.alternateSource;
      picker.sourceButton.disabled = picker.confirming || picker.composition.active;
    }
  }

  private switchSource(session: MainWindowSession): void {
    const picker = session.picker;
    if (picker.confirming || picker.composition.active) return;
    const alternate = picker.provider?.alternateSource;
    if (!alternate) return;
    try {
      const provider = alternate.provider();
      picker.localBindings?.deactivate();
      picker.provider = provider;
      const sourceRevision = ++picker.sourceRevision;
      picker.items = [];
      picker.filtered = [];
      picker.selected = 0;
      this.setOperationStatus(session, '');
      this.refreshSource(session);
      this.render(session);
      void this.loadSource(session, provider, picker.generation, sourceRevision);
    } catch (error) {
      this.failure(`picker switch source scope=${picker.scope}`, error);
      this.setOperationStatus(session, `Unable to switch source: ${String(error).slice(0, 160)}`);
    }
  }

  private async loadSource(
    session: MainWindowSession,
    provider: PickerProvider,
    generation: number,
    sourceRevision: number,
  ): Promise<void> {
    const scope = session.picker.scope;
    const loadStartedAt = Date.now();
    const results = session.picker.results;
    if (results && provider.loadingText) {
      results.style.color = THEME_VARS.muted;
      results.textContent = provider.loadingText;
    }
    try {
      const items = await provider.load();
      if (!this.isCurrentSource(session, generation, sourceRevision, provider)) {
        this.trace(`picker load discarded scope=${scope} generation=${generation}`);
        return;
      }
      session.picker.items = items;
      this.filter(session, session.picker.committedQuery);
      this.trace(
        `picker loaded scope=${scope} items=${items.length} duration=${Date.now() - loadStartedAt}ms`,
      );
    } catch (error) {
      if (!this.isCurrentSource(session, generation, sourceRevision, provider)) {
        this.trace(`picker load failure discarded scope=${scope} generation=${generation}`);
        return;
      }
      this.failure(`picker load scope=${scope}`, error);
      results?.replaceChildren();
      this.setOperationStatus(session, `Error loading ${scope}: ${String(error).slice(0, 160)}`);
    }
  }

  private isCurrentSource(
    session: MainWindowSession,
    generation: number,
    sourceRevision: number,
    provider: PickerProvider,
  ): boolean {
    return (
      this.isCurrent(session, generation) &&
      session.picker.sourceRevision === sourceRevision &&
      session.picker.provider === provider
    );
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
    if (session.picker.focusPane !== pane) session.picker.localBindings?.deactivate();
    session.picker.focusPane = pane;
    this.refreshHints(session);
    if (session.picker.results)
      session.picker.results.style.boxShadow =
        pane === 'list' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
    if (session.picker.preview)
      session.picker.preview.style.boxShadow =
        pane === 'preview' ? `inset 0 0 0 2px ${THEME_VARS.focusRing}` : 'none';
  }

  private provider(
    window: MainWindow,
    scope: PickerScope,
    commandContext?: CommandPaletteContext,
  ): PickerProvider {
    switch (scope) {
      case 'all':
      case 'collection':
        return createItemsProvider(window, scope);
      case 'tabs':
        return createTabsProvider(window);
      case 'notes':
        return createNotesProvider(window, this.#logger);
      case 'tags':
        throw new Error('Tag chooser requires an explicit candidate source');
      case 'collections':
        throw new Error('Collection chooser requires an explicit candidate source');
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

  private shortcutReference(context: BindingContext): string {
    const actions = context === 'picker-input' ? PICKER_INPUT_ACTIONS : PICKER_LIST_ACTIONS;
    const bindings = this.#bindings();
    return actions
      .flatMap((action) => {
        const keys = shortcutsForAction(bindings, context, action);
        return keys.length ? [`${keys.join('/')} ${ACTION_LABELS[action].en}`] : [];
      })
      .join(' · ');
  }

  private refreshHints(session: MainWindowSession): void {
    const picker = session.picker;
    if (picker.help)
      picker.help.textContent = this.shortcutReference(
        picker.focusPane === 'search' ? 'picker-input' : 'picker-list',
      );
    if (picker.queryHelp)
      picker.queryHelp.textContent = [
        picker.provider?.help?.query,
        this.shortcutReference('picker-input'),
      ]
        .filter(Boolean)
        .join(' · ');
    if (picker.listHelp)
      picker.listHelp.textContent = [
        picker.provider?.help?.list,
        this.shortcutReference('picker-list'),
      ]
        .filter(Boolean)
        .join(' · ');
  }
}
