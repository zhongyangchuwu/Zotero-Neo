import { t } from '../../i18n';
import type { ActionId } from '../../input/actions';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import { keyString } from '../../input/keys';
import { serializeBindingTokens } from '../../input/key-sequence';
import { LocalBindingRuntime } from '../../input/local-binding-runtime';
import { nativeReservation } from '../../input/shortcut-catalog';
import { THEME_VARS } from '../../ui/theme';
import type { TabSidebarEntry, TabSidebarGroup, TabSidebarOptions, TabSidebarView } from './types';

const H = 'http://www.w3.org/1999/xhtml';
const DRAG_TYPE = 'application/x-zotero-neo-tab-sidebar';
const COLORS = [
  '#e06c75',
  '#e5a84b',
  '#e5c463',
  '#73b87a',
  '#58a9b5',
  '#6d9ee8',
  '#a887d4',
  '#bd83a6',
];
type Selection = { kind: 'group' | 'entry'; id: string };
type Drag = Selection & { token: string };

/** An owned projection of the group manager; all tab mutations go through callbacks. */
export class TabEnhancementsSidebar {
  readonly root: HTMLElement;
  readonly toolbarSlot: HTMLElement;
  readonly #options: TabSidebarOptions;
  readonly #search: HTMLInputElement;
  readonly #list: HTMLElement;
  readonly #status: HTMLElement;
  readonly #restoreStatus: HTMLElement;
  readonly #body: HTMLElement;
  readonly #toggle: HTMLButtonElement;
  readonly #create: HTMLButtonElement;
  readonly #runtime: LocalBindingRuntime;
  readonly #untheme: () => void;
  readonly #unsearchComposition: () => void;
  readonly #composition = { active: false };
  #editComposition = { active: false };
  #uneditComposition: (() => void) | null = null;
  #editor: HTMLInputElement | null = null;
  #contextMenu: HTMLElement | null = null;
  #contextOrigin: HTMLElement | null = null;
  readonly #dismissContextMenu = (event: MouseEvent): void => {
    if (this.#contextMenu && !this.#contextMenu.contains(event.target as Node)) {
      this.#closeContextMenu();
    }
  };
  #view: TabSidebarView = { library: null, groups: [], ungrouped: [] };
  #selection: Selection | null = null;
  #rows: { selection: Selection; node: HTMLElement }[] = [];
  #entryRows: {
    id: string;
    groupID: string | null;
    node: HTMLElement;
    button: HTMLButtonElement;
  }[] = [];
  #drag: Drag | null = null;
  #dragSerial = 0;
  #collapsed = false;
  #disposed = false;
  #signature = '';

  constructor(options: TabSidebarOptions) {
    this.#options = options;
    const doc = options.window.document;
    const node = (tag: string): HTMLElement => doc.createElementNS(H, tag) as HTMLElement;
    this.root = node('section');
    this.root.dataset.zvTabSidebar = '1';
    this.root.setAttribute('aria-label', this.#text('title'));
    this.root.style.cssText = `display:flex;flex-direction:column;min-width:0;height:100%;background:${THEME_VARS.surface};color:${THEME_VARS.text};font:menu;font-size:13px`;
    const style = node('style');
    style.textContent = `
      [data-zv-tab-sidebar] > header { padding: 4px 6px; }
      [data-zv-tab-sidebar] > header > button { min-width: 28px; min-height: 28px; border: 0; border-radius: 7px; background: transparent; color: inherit; }
      [data-zv-tab-sidebar] > header > button:hover { background: ${THEME_VARS.elevated}; }
      [data-zv-tab-sidebar] #zotero-tabs-toolbar { display: flex !important; align-items: center; }
      [data-zv-tab-sidebar] #zotero-tabs-toolbar > .zotero-tb-separator { width: 1px; height: 18px; flex: 0 0 1px; }
      [data-zv-tab-sidebar] input[type='search'] { margin: 2px 6px 6px; padding: 6px 9px; border: 1px solid ${THEME_VARS.border}; border-radius: 8px; }
      [data-zv-tab-sidebar] input[type='search']::placeholder { color: ${THEME_VARS.muted}; opacity: 1; }
      [data-zv-tab-sidebar] [data-neo-tab-list] { padding: 0 6px 6px; }
      [data-zv-tab-sidebar] [data-neo-tab-row] { display: flex; align-items: center; gap: 5px; min-height: 32px; margin: 2px 0; padding: 2px 6px; border-radius: 8px; }
      [data-zv-tab-sidebar] [data-neo-tab-row]:hover { background: ${THEME_VARS.elevated}; }
      [data-zv-tab-sidebar] [data-neo-tab-row] > button { appearance: none; border: 0; background: transparent; color: inherit; font: inherit; }
      [data-zv-tab-sidebar] [data-neo-tab-row] > button:focus-visible { outline: 2px solid ${THEME_VARS.focusRing}; outline-offset: -2px; border-radius: 6px; }
      [data-zv-tab-sidebar] [data-neo-tab-row] > [data-neo-tab-menu] { flex: 0 0 auto; padding: 3px 5px; border-radius: 6px; color: ${THEME_VARS.muted}; cursor: pointer; }
      [data-zv-tab-sidebar] [data-neo-tab-row] > [data-neo-tab-menu]:hover { background: ${THEME_VARS.elevated}; color: ${THEME_VARS.text}; }
      [data-zv-tab-sidebar] [data-neo-context-menu] > button { border: 0; border-radius: 6px; padding: 7px 10px; background: transparent; color: inherit; font: inherit; text-align: start; }
      [data-zv-tab-sidebar] [data-neo-context-menu] > button:hover, [data-zv-tab-sidebar] [data-neo-context-menu] > button:focus-visible { background: ${THEME_VARS.selected}; color: ${THEME_VARS.selectedText}; }
      [data-zv-tab-sidebar] [data-neo-tab-palette] { display: flex; flex-wrap: wrap; gap: 5px; max-width: 220px; padding: 6px 10px; }
      [data-zv-tab-sidebar] [data-neo-tab-color] { width: 20px; height: 20px; padding: 0; border: 1px solid ${THEME_VARS.border}; border-radius: 50%; }
      [data-zv-tab-sidebar] [data-neo-tab-members] { padding-inline-start: 18px; }
      [data-zv-tab-sidebar] [data-neo-tab-badge] { flex: 0 0 auto; font-size: 0.82em; color: ${THEME_VARS.muted}; }
      [data-zv-tab-sidebar] [role='status']:not(:empty) { margin: 4px 6px; padding: 8px; border: 1px solid ${THEME_VARS.border}; border-radius: 8px; background: ${THEME_VARS.elevated}; }
    `;
    const header = node('header');
    header.style.cssText = 'display:flex;align-items:center;gap:4px';
    this.#toggle = this.#button(this.#text('collapse'), () => options.callbacks.toggleSidebar());
    this.#create = this.#button(this.#text('newGroup'), () => this.#startEdit(null));
    header.append(this.#toggle, this.#create);
    this.#body = node('div');
    this.#body.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1';
    this.toolbarSlot = node('div');
    this.#search = node('input') as HTMLInputElement;
    this.#search.type = 'search';
    this.#search.placeholder = this.#text('search');
    this.#search.setAttribute('aria-label', this.#text('search'));
    this.#search.style.cssText = `min-width:0;background:${THEME_VARS.input};color:${THEME_VARS.text}`;
    this.#list = node('div');
    this.#list.tabIndex = 0;
    this.#list.setAttribute('aria-label', this.#text('title'));
    this.#list.style.cssText = 'overflow:auto;min-height:0;flex:1';
    this.#list.dataset.neoTabList = '1';
    this.#dropTarget(this.#list, null, null, true);
    this.#list.addEventListener('contextmenu', (event) => {
      this.#showContextMenu(event, (menu) => {
        menu.append(this.#button(this.#text('newGroup'), () => this.#startEdit(null)));
      });
    });
    doc.addEventListener('mousedown', this.#dismissContextMenu, true);
    this.#status = node('div');
    this.#status.setAttribute('role', 'status');
    this.#restoreStatus = node('div');
    this.#restoreStatus.setAttribute('role', 'status');
    this.#body.append(
      this.toolbarSlot,
      this.#search,
      this.#list,
      this.#restoreStatus,
      this.#status,
    );
    this.root.append(style, header, this.#body);
    this.#untheme = options.themeRoot(this.root);
    this.#unsearchComposition = bindCompositionState(this.#search, this.#composition);
    this.#search.addEventListener('input', (event) => {
      if (isCommittedInput(event, this.#composition.active)) this.#render(true);
    });
    this.#search.addEventListener('compositionend', () => this.#render(true));
    this.#runtime = new LocalBindingRuntime({
      bindings: options.bindings,
      execute: (action) => this.execute(action),
      schedule: (callback, delay) => options.window.setTimeout(callback, delay),
      clearTimer: (timer) => options.window.clearTimeout(timer),
    });
  }

  #text(key: string): string {
    return t(`tabs.${key}`, this.#options.language());
  }
  #icon(kind: 'folder' | 'folder-open' | 'document', color: string): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = this.root.ownerDocument.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '19');
    icon.setAttribute('height', '19');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = `flex:0 0 19px;color:${color}`;
    const path = this.root.ownerDocument.createElementNS(ns, 'path');
    path.setAttribute(
      'd',
      kind === 'document'
        ? 'M6 3.5h8l4 4V20H6z M14 3.5v4h4'
        : kind === 'folder-open'
          ? 'M3 7V5h6l2 2h9v2 M3 9h18l-2.5 10h-14z'
          : 'M3 6h6l2 2h10v11H3z',
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linejoin', 'round');
    icon.append(path);
    return icon;
  }
  #node(tag: string): HTMLElement {
    return this.root.ownerDocument.createElementNS(H, tag) as HTMLElement;
  }
  #button(label: string, run: (event: MouseEvent) => void): HTMLButtonElement {
    const button = this.#node('button') as HTMLButtonElement;
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', (event) => {
      if (!this.#disposed && this.#options.isCurrent()) run(event);
    });
    return button;
  }
  update(view: TabSidebarView, collapsed: boolean): void {
    if (this.#disposed) return;
    this.#view = view;
    this.#drag = null;
    this.#create.hidden = collapsed;
    this.#collapsed = collapsed;
    this.#body.hidden = collapsed;
    this.#body.style.display = collapsed ? 'none' : 'flex';
    this.#create.textContent = '+';
    this.#create.setAttribute('aria-label', this.#text('newGroup'));
    this.#create.title = this.#text('newGroup');
    this.#search.placeholder = this.#text('search');
    this.#search.setAttribute('aria-label', this.#text('search'));
    this.root.setAttribute('aria-label', this.#text('title'));
    this.#list.setAttribute('aria-label', this.#text('title'));
    this.#toggle.textContent = collapsed ? '≡' : '−';
    this.#toggle.setAttribute('aria-label', this.#text(collapsed ? 'expand' : 'collapse'));
    this.#toggle.title = this.#text(collapsed ? 'expand' : 'collapse');
    // Never detach an editor during composition or overwrite its uncommitted value.
    if (!this.#editor) this.#render();
  }
  ownsTarget(target: EventTarget | null): boolean {
    return (
      !!target && this.root.contains(target as Node) && !this.toolbarSlot.contains(target as Node)
    );
  }
  handleKey(event: KeyboardEvent): void {
    if (!this.#options.isCurrent() || !this.ownsTarget(event.target)) return;
    const target = event.target as HTMLElement;
    if (
      compositionOwnsKey(
        event,
        target === this.#editor ? this.#editComposition.active : this.#composition.active,
      ) ||
      event.getModifierState?.('AltGraph')
    ) {
      this.#runtime.deactivate();
      event.stopPropagation();
      return;
    }
    if (keyString(event) === 'escape' && this.#contextMenu?.contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#closeContextMenu();
      this.#list.focus();
      return;
    }
    const key = keyString(event);
    if (target === this.#editor) {
      if (key === 'enter' || key === 'escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (key === 'enter') this.#commitEdit();
        else this.#endEdit();
      } else event.stopPropagation();
      return;
    }
    if (
      target.localName === 'button' ||
      target.localName === 'summary' ||
      target.localName === 'select'
    ) {
      this.#runtime.deactivate();
      event.stopPropagation();
      return;
    }
    const context = target === this.#search ? 'tabs-input' : 'tabs-list';
    if (key && nativeReservation(context, serializeBindingTokens([key])) === 'exclusive') {
      this.#runtime.deactivate();
      event.stopPropagation();
      return;
    }
    if (this.#runtime.handle(event, context)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
  }
  execute(action: ActionId): boolean {
    if (this.#disposed || !this.#options.isCurrent()) return false;
    const selection = this.#selection;
    const group =
      selection?.kind === 'group'
        ? this.#view.groups.find((g) => g.id === selection.id)
        : undefined;
    const entry = selection?.kind === 'entry' ? this.#entry(selection.id) : undefined;
    const callbacks = this.#options.callbacks;
    switch (action) {
      case 'uiSearch':
        this.#search.focus();
        return true;
      case 'uiFocusList':
        this.#list.focus();
        return true;
      case 'uiNextPane':
      case 'uiPreviousPane':
      case 'uiCancel':
        callbacks.leave();
        return true;
      case 'uiNext':
        this.#moveSelection(1);
        return true;
      case 'uiPrevious':
        this.#moveSelection(-1);
        return true;
      case 'uiFirst':
        this.#moveSelection(-Infinity);
        return true;
      case 'uiLast':
        this.#moveSelection(Infinity);
        return true;
      case 'uiConfirm':
        if (entry && entry.kind !== 'other' && entry.status !== 'missing')
          callbacks.activate(entry.id);
        else if (group) callbacks.toggleGroup(group.id);
        else return false;
        return true;
      case 'tabCreateGroup':
        this.#startEdit(null);
        return true;
      case 'tabRenameGroup':
        if (!group) return false;
        this.#startEdit(group.id);
        return true;
      case 'tabCloseEntry':
        if (!entry || entry.kind === 'library' || entry.status !== 'open') return false;
        callbacks.close(entry.id);
        return true;
      case 'tabToggleGroup':
        if (!group) return false;
        callbacks.toggleGroup(group.id);
        return true;
      case 'tabOpenGroup':
        if (!group) return false;
        callbacks.openGroup(group.id);
        return true;
      case 'tabCloseGroup':
        if (!group) return false;
        callbacks.closeGroup(group.id);
        return true;
      case 'tabUngroup':
        if (!group) return false;
        callbacks.ungroup(group.id);
        return true;
      case 'tabRemoveFromGroup':
        if (!entry || !this.#view.groups.some((g) => g.entries.some((e) => e.id === entry.id)))
          return false;
        callbacks.removeMember(entry.id);
        return true;
      default:
        return false;
    }
  }
  focus(): void {
    if (this.#collapsed) this.#toggle.focus();
    else this.#list.focus();
  }
  status(message: string): void {
    if (this.#status.contains(this.root.ownerDocument.activeElement)) this.#list.focus();
    this.#status.textContent = message;
  }
  restorePreview(
    group: TabSidebarGroup,
    scheduled: number,
    start: () => void,
    cancel: () => void,
  ): void {
    const count = (status: TabSidebarEntry['status']) =>
      group.entries.filter((entry) => entry.status === status).length;
    const pending = Math.max(0, count('closed') - scheduled);
    this.#restoreStatus.textContent = `${this.#text('restorePreview')}: ${group.name}. ${this.#text('restoreClosed')}: ${scheduled}; ${this.#text('restorePending')}: ${pending}; ${this.#text('restoreHere')}: ${count('open')}; ${this.#text('otherWindow')}: ${count('other-window')}; ${this.#text('missing')}: ${count('missing')}. `;
    const startButton = this.#button(this.#text('restoreStart'), start);
    this.#restoreStatus.append(startButton, this.#button(this.#text('restoreCancel'), cancel));
    startButton.focus();
  }
  clearRestore(): void {
    if (this.#restoreStatus.contains(this.root.ownerDocument.activeElement)) this.#list.focus();
    this.#restoreStatus.textContent = '';
  }
  restoreProgress(message: string, stop?: () => void): void {
    const hadFocus = this.#restoreStatus.contains(this.root.ownerDocument.activeElement);
    this.#restoreStatus.textContent = message;
    if (stop) {
      const stopButton = this.#button(this.#text('restoreStop'), stop);
      this.#restoreStatus.append(stopButton);
      if (hadFocus) stopButton.focus();
    } else if (hadFocus) this.#list.focus();
  }
  dispose(): void {
    this.#closeContextMenu();
    this.root.ownerDocument.removeEventListener('mousedown', this.#dismissContextMenu, true);
    if (this.#disposed) return;
    this.#disposed = true;
    this.#runtime.dispose();
    this.#unsearchComposition();
    this.#uneditComposition?.();
    this.#untheme();
    this.#drag = null;
    this.root.remove();
  }
  #entry(id: string): TabSidebarEntry | undefined {
    return (
      [
        this.#view.library,
        ...this.#view.ungrouped,
        ...this.#view.groups.flatMap((g) => g.entries),
      ].find((e) => e?.id === id) ?? undefined
    );
  }
  #moveSelection(delta: number): void {
    const rows = this.#rows.filter((row) => !row.node.hidden);
    if (!rows.length) return;
    const index = rows.findIndex(
      (row) =>
        row.selection.kind === this.#selection?.kind && row.selection.id === this.#selection.id,
    );
    const next =
      delta === Infinity
        ? rows.length - 1
        : delta === -Infinity
          ? 0
          : Math.max(
              0,
              Math.min(
                rows.length - 1,
                (index < 0 ? (delta > 0 ? -1 : rows.length) : index) + delta,
              ),
            );
    this.#selection = rows[next].selection;
    rows[next].node.focus();
  }
  #select(selection: Selection, row: HTMLElement): void {
    row.addEventListener('focus', () => {
      this.#selection = selection;
    });
    row.addEventListener('click', () => {
      this.#selection = selection;
    });
    this.#rows.push({ selection, node: row });
  }
  #startEdit(groupID: string | null, memberID?: string): void {
    if (this.#editor) return;
    const group = groupID ? this.#view.groups.find((g) => g.id === groupID) : null;
    if (groupID && !group) return;
    const input = this.#node('input') as HTMLInputElement;
    input.type = 'text';
    input.value = group?.name ?? '';
    input.setAttribute('aria-label', this.#text('groupName'));
    input.dataset.groupId = groupID ?? '';
    input.dataset.memberId = memberID ?? '';
    this.#editor = input;
    this.#editComposition = { active: false };
    this.#uneditComposition = bindCompositionState(input, this.#editComposition);
    const target = groupID
      ? this.#rows.find((r) => r.selection.kind === 'group' && r.selection.id === groupID)?.node
      : this.#list;
    (target ?? this.#list).append(input);
    input.focus();
    input.select();
  }
  #commitEdit(): void {
    const input = this.#editor;
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      this.status(this.#text('emptyName'));
      return;
    }
    const id = input.dataset.groupId || null;
    const member = input.dataset.memberId || undefined;
    if (id && !this.#view.groups.some((g) => g.id === id)) {
      this.#endEdit();
      return;
    }
    if (member && !this.#entry(member)) {
      this.#endEdit();
      return;
    }
    this.#endEdit();
    if (id) this.#options.callbacks.renameGroup(id, name);
    else this.#options.callbacks.createGroup(name, member);
  }
  #endEdit(): void {
    this.#uneditComposition?.();
    this.#uneditComposition = null;
    this.#editor?.remove();
    this.#editor = null;
    this.#signature = '';
    this.#render();
    this.#list.focus();
  }
  #dragSource(row: HTMLElement, selection: Selection): void {
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      if (this.#search.value.trim() || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      const token = `${Date.now()}-${++this.#dragSerial}-${Math.random()}`;
      this.#drag = { ...selection, token };
      event.dataTransfer.setData(DRAG_TYPE, token);
      event.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      this.#drag = null;
    });
  }
  #dropTarget(
    node: HTMLElement,
    groupID: string | null,
    beforeID: string | null,
    groupTarget = false,
  ): void {
    const valid = (event: DragEvent): boolean => {
      if (
        !this.#drag ||
        this.#search.value.trim() ||
        !event.dataTransfer ||
        !Array.from(event.dataTransfer.types).includes(DRAG_TYPE)
      )
        return false;
      return groupTarget ? this.#drag.kind === 'group' : this.#drag.kind === 'entry';
    };
    node.addEventListener('dragover', (event) => {
      if (valid(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      }
    });
    node.addEventListener('drop', (event) => {
      if (!valid(event) || event.dataTransfer?.getData(DRAG_TYPE) !== this.#drag?.token) return;
      const drag = this.#drag;
      this.#drag = null;
      if (!drag || !this.#options.isCurrent()) return;
      if (drag.kind === 'group') {
        if (
          !this.#view.groups.some((g) => g.id === drag.id) ||
          (beforeID && !this.#view.groups.some((g) => g.id === beforeID)) ||
          drag.id === beforeID
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        this.#options.callbacks.moveGroup(drag.id, beforeID);
      } else {
        const entry = this.#entry(drag.id);
        if (
          !entry ||
          entry.kind === 'library' ||
          entry.kind === 'other' ||
          (groupID && !this.#view.groups.some((g) => g.id === groupID)) ||
          (beforeID && !this.#entry(beforeID)) ||
          drag.id === beforeID
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        this.#options.callbacks.moveMember(drag.id, groupID, beforeID);
      }
    });
  }
  #closeContextMenu(restoreFocus = false): void {
    const focused = this.#contextMenu?.contains(this.root.ownerDocument.activeElement);
    this.#contextMenu?.remove();
    this.#contextMenu = null;
    if (restoreFocus && focused && this.#options.isCurrent()) {
      (this.#contextOrigin?.isConnected ? this.#contextOrigin : this.#list).focus();
    }
    this.#contextOrigin = null;
  }
  #showContextMenu(
    event: MouseEvent,
    populate: (menu: HTMLElement) => void,
    label = 'entryActions',
  ): void {
    if (this.#disposed || this.#editor || !this.#options.isCurrent()) return;
    event.preventDefault();
    event.stopPropagation();
    this.#closeContextMenu();
    const menu = this.#node('div');
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', this.#text(label));
    menu.dataset.neoContextMenu = '1';
    menu.style.cssText = `position:fixed;z-index:2147483647;display:flex;flex-direction:column;min-width:160px;max-height:70vh;overflow:auto;padding:4px;border-radius:9px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};box-shadow:${THEME_VARS.shadow}`;
    populate(menu);
    menu.addEventListener('click', () => this.#closeContextMenu(true), true);
    this.root.append(menu);
    this.#contextMenu = menu;
    this.#contextOrigin = (event.currentTarget ?? event.target) as HTMLElement | null;
    const rect = menu.getBoundingClientRect();
    const anchor = this.#contextOrigin?.getBoundingClientRect();
    const win = this.#options.window;
    const fromKeyboard = !event.clientX && !event.clientY;
    const x = fromKeyboard ? (anchor?.left ?? 0) : event.clientX;
    const y = fromKeyboard ? (anchor?.bottom ?? 0) : event.clientY;
    menu.style.left = `${Math.max(0, Math.min(x, (win.innerWidth || x + rect.width) - rect.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, (win.innerHeight || y + rect.height) - rect.height))}px`;
    menu.querySelector('button')?.focus();
  }
  #render(force = false): void {
    if (this.#disposed || this.#editor) return;
    const signature = JSON.stringify(
      [this.#view, this.#search.value, this.#options.language()],
      (key, value: unknown) => (key === 'selected' ? undefined : value),
    );
    if (!force && signature === this.#signature) {
      this.#refreshSelection();
      return;
    }
    this.#closeContextMenu(true);
    this.#signature = signature;
    const active = this.root.ownerDocument.activeElement;
    const focused = this.#rows.find(
      (r) => r.node === active || (!!active && r.node.contains(active)),
    )?.selection;
    const query = this.#search.value.trim().toLocaleLowerCase();
    const matches = (text: string): boolean => !query || text.toLocaleLowerCase().includes(query);
    const matchesEntry = (entry: TabSidebarEntry): boolean =>
      matches(entry.title) || matches(entry.searchText);
    this.#rows = [];
    this.#entryRows = [];
    this.#list.replaceChildren();
    if (this.#view.library && matchesEntry(this.#view.library))
      this.#renderEntry(this.#view.library, null);
    for (const group of this.#view.groups) {
      const groupMatches = matches(group.name);
      const entries = group.entries.filter((entry) => groupMatches || matchesEntry(entry));
      if (query && !groupMatches && !entries.length) continue;
      this.#renderGroup(group, entries);
    }
    const ungrouped = this.#node('div');
    ungrouped.setAttribute('aria-label', this.#text('ungrouped'));
    this.#list.append(ungrouped);
    for (const entry of this.#view.ungrouped)
      if (matchesEntry(entry)) this.#renderEntry(entry, null, ungrouped);
    this.#dropTarget(ungrouped, null, null);
    this.#refreshSelection();
    if (focused)
      this.#rows
        .find((r) => r.selection.kind === focused.kind && r.selection.id === focused.id)
        ?.node.focus();
  }
  #renderGroup(group: TabSidebarGroup, entries: readonly TabSidebarEntry[]): void {
    const section = this.#node('section');
    const row = this.#node('div');
    row.tabIndex = 0;
    row.dataset.neoTabRow = 'group';
    const toggle = this.#button(
      `${group.collapsed ? '▸' : '▾'} ${group.name} (${group.entries.length})`,
      () => this.#options.callbacks.toggleGroup(group.id),
    );
    toggle.setAttribute('aria-expanded', String(!group.collapsed));
    const groupLabel = this.#node('span');
    groupLabel.textContent = toggle.textContent;
    groupLabel.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    toggle.textContent = '';
    toggle.style.cssText =
      'display:flex;align-items:center;gap:7px;flex:1;min-width:0;padding:3px 0;text-align:start;font-weight:600';
    toggle.append(
      this.#icon(group.collapsed ? 'folder' : 'folder-open', group.color || THEME_VARS.accent),
      groupLabel,
    );
    row.append(toggle);
    const menu = this.#button('⋯', (event) => this.#showGroupMenu(event, group));
    menu.dataset.neoTabMenu = '1';
    menu.title = this.#text('groupActions');
    menu.setAttribute('aria-label', this.#text('groupActions'));
    row.append(menu);
    section.append(row);
    this.#list.append(section);
    this.#select({ kind: 'group', id: group.id }, row);
    this.#dragSource(row, { kind: 'group', id: group.id });
    this.#dropTarget(row, null, group.id, true);
    row.addEventListener('contextmenu', (event) => this.#showGroupMenu(event, group));
    const members = this.#node('div');
    members.dataset.neoTabMembers = '1';
    section.append(members);
    for (const entry of entries) this.#renderEntry(entry, group.id, members);
    this.#dropTarget(members, group.id, null);
    this.#dropTarget(section, group.id, null);
  }
  #showGroupMenu(event: MouseEvent, group: TabSidebarGroup): void {
    this.#showContextMenu(
      event,
      (context) => {
        context.append(this.#button(this.#text('newGroup'), () => this.#startEdit(null)));
        this.#addGroupActions(context, group);
      },
      'groupActions',
    );
  }
  #addGroupActions(menu: HTMLElement, group: TabSidebarGroup): void {
    menu.append(this.#button(this.#text('rename'), () => this.#startEdit(group.id)));
    const palette = this.#node('div');
    palette.dataset.neoTabPalette = '1';
    palette.setAttribute('aria-label', this.#text('color'));
    for (const color of COLORS) {
      const button = this.#button(`${this.#text('color')} ${color}`, () =>
        this.#options.callbacks.setGroupColor(group.id, color),
      );
      button.style.background = color;
      button.dataset.neoTabColor = '1';
      button.title = `${this.#text('color')} ${color}`;
      button.textContent = '';
      palette.append(button);
    }
    menu.append(
      palette,
      this.#button(this.#text('openGroup'), () => this.#options.callbacks.openGroup(group.id)),
      this.#button(this.#text('closeGroup'), () => this.#options.callbacks.closeGroup(group.id)),
      this.#button(this.#text('ungroup'), () => this.#options.callbacks.ungroup(group.id)),
    );
  }
  #addEntryActions(menu: HTMLElement, entry: TabSidebarEntry, groupID: string | null): void {
    if (entry.status === 'open')
      menu.append(this.#button(this.#text('close'), () => this.#options.callbacks.close(entry.id)));
    if (groupID)
      menu.append(
        this.#button(this.#text('remove'), () => this.#options.callbacks.removeMember(entry.id)),
      );
    menu.append(this.#button(this.#text('newGroup'), () => this.#startEdit(null, entry.id)));
    for (const group of this.#view.groups)
      if (group.id !== groupID)
        menu.append(
          this.#button(`${this.#text('moveTo')}: ${group.name}`, () =>
            this.#options.callbacks.moveMember(entry.id, group.id, null),
          ),
        );
  }
  #refreshSelection(): void {
    const entries = new Map<string, TabSidebarEntry>();
    const groups = new Map(this.#view.groups.map((group) => [group.id, group]));
    if (this.#view.library) entries.set(this.#view.library.id, this.#view.library);
    for (const entry of this.#view.ungrouped) entries.set(entry.id, entry);
    for (const group of this.#view.groups)
      for (const entry of group.entries) entries.set(entry.id, entry);
    const filtering = !!this.#search.value.trim();
    for (const row of this.#entryRows) {
      const entry = entries.get(row.id);
      if (!entry) continue;
      const group = row.groupID && groups.get(row.groupID);
      row.node.hidden = !!group && group.collapsed && !entry.selected && !filtering;
      row.node.style.display = row.node.hidden ? 'none' : 'flex';
      row.node.style.background = entry.selected ? THEME_VARS.selected : '';
      row.node.style.color = entry.selected ? THEME_VARS.selectedText : THEME_VARS.text;
      if (entry.selected) row.button.setAttribute('aria-current', 'page');
      else row.button.removeAttribute('aria-current');
    }
  }
  #renderEntry(entry: TabSidebarEntry, groupID: string | null, parent = this.#list): void {
    const row = this.#node('div');
    row.tabIndex = 0;
    row.dataset.neoTabRow = 'entry';
    row.style.color = entry.selected ? THEME_VARS.selectedText : THEME_VARS.text;
    const open = this.#button(entry.title, () => this.#options.callbacks.activate(entry.id));
    open.style.cssText =
      'flex:1;min-width:0;padding:3px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start';
    open.disabled = entry.status === 'missing';
    open.title = entry.nativeTitle;
    if (entry.selected) open.setAttribute('aria-current', 'page');
    row.append(
      this.#icon(entry.kind === 'library' ? 'folder' : 'document', THEME_VARS.muted),
      open,
    );
    this.#entryRows.push({ id: entry.id, groupID, node: row, button: open });
    if (entry.status !== 'open') {
      const badge = this.#node('span');
      badge.dataset.neoTabBadge = '1';
      badge.textContent = this.#text(
        entry.status === 'other-window' ? 'otherWindow' : entry.status,
      );
      row.append(badge);
    }
    if (entry.kind !== 'library' && entry.kind !== 'other') {
      const menu = this.#button('⋯', (event) =>
        this.#showContextMenu(event, (context) => this.#addEntryActions(context, entry, groupID)),
      );
      menu.dataset.neoTabMenu = '1';
      menu.title = this.#text('entryActions');
      menu.setAttribute('aria-label', this.#text('entryActions'));
      row.append(menu);
      row.addEventListener('contextmenu', (event) => {
        this.#showContextMenu(event, (context) => this.#addEntryActions(context, entry, groupID));
      });
      this.#dragSource(row, { kind: 'entry', id: entry.id });
      this.#dropTarget(row, groupID, entry.id);
    }
    parent.append(row);
    this.#select({ kind: 'entry', id: entry.id }, row);
  }
}
