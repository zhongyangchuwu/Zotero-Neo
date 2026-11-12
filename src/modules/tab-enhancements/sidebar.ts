import { t } from '../../i18n';
import type { ActionId } from '../../input/actions';
import { compositionOwnsKey, isCommittedInput } from '../../input/composition';
import { keyString } from '../../input/keys';
import { serializeBindingTokens } from '../../input/key-sequence';
import { LocalBindingRuntime } from '../../input/local-binding-runtime';
import { nativeReservation } from '../../input/shortcut-catalog';
import { asElement } from '../../platform/dom';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type { TabSidebarReactCommand, TabSidebarReactModel } from './react-model';
import type { TabSidebarEntry, TabSidebarGroup, TabSidebarOptions, TabSidebarView } from './types';

const H = 'http://www.w3.org/1999/xhtml';
const DRAG_TYPE = 'application/x-zotero-neo-tab-sidebar';
type Selection = { kind: 'group' | 'entry'; id: string };
type Drag = Selection & { token: string };

/** Owns one window's input and presentation; React only projects the group manager's view. */
export class TabEnhancementsSidebar {
  readonly root: HTMLElement;
  readonly toolbarSlot: HTMLElement;
  readonly #content: HTMLElement;
  readonly #options: TabSidebarOptions;
  readonly #runtime: LocalBindingRuntime;
  readonly #untheme: () => void;
  #react: NativeReactView<TabSidebarReactModel> | null = null;
  #view: TabSidebarView = { library: null, groups: [], ungrouped: [] };
  #editing: TabSidebarReactModel['editing'] = null;
  #menu: TabSidebarReactModel['menu'] = null;
  #menuOrigin: HTMLElement | null = null;
  #selection: Selection | null = null;
  #drag: Drag | null = null;
  #dragSerial = 0;
  #query = '';
  #status = '';
  #collapsed = false;
  #searchComposing = false;
  #editComposing = false;
  #disposed = false;
  #pendingFocus: Element | null | undefined;

  constructor(options: TabSidebarOptions) {
    this.#options = options;
    const doc = options.window.document;
    this.root = doc.createElementNS(H, 'section') as HTMLElement;
    this.root.dataset.zvTabSidebar = '1';
    this.root.style.cssText =
      'display:grid;grid-template-rows:auto auto minmax(0,1fr);min-width:0;height:100%;background:var(--zotero-neo-surface);color:var(--zotero-neo-text);font:menu;font-size:13px';
    this.#content = doc.createElementNS(H, 'div') as HTMLElement;
    this.#content.style.display = 'contents';
    this.toolbarSlot = doc.createElementNS(H, 'div') as HTMLElement;
    this.toolbarSlot.style.gridRow = '2';
    this.root.append(this.#content, this.toolbarSlot);
    this.#untheme = options.themeRoot(this.root);
    this.#runtime = new LocalBindingRuntime({
      bindings: options.bindings,
      execute: (action) => this.execute(action),
      schedule: (callback, delay) => options.window.setTimeout(callback, delay),
      clearTimer: (timer) => options.window.clearTimeout(timer),
    });
    this.root.addEventListener('click', this.#click);
    this.root.addEventListener('contextmenu', this.#contextMenu);
    this.root.addEventListener('focusin', this.#focusIn);
    this.root.addEventListener('input', this.#input);
    this.root.addEventListener('compositionstart', this.#compositionStart);
    this.root.addEventListener('compositionend', this.#compositionEnd);
    this.root.addEventListener('dragstart', this.#dragStart);
    this.root.addEventListener('dragend', this.#dragEnd);
    this.root.addEventListener('dragover', this.#dragOver);
    this.root.addEventListener('drop', this.#drop);
    doc.addEventListener('mousedown', this.#dismissMenu, true);
  }

  /** Mount only after the native rail is connected; failure restores the native layout. */
  mount(onError: (error: unknown) => void): void {
    if (this.#disposed || this.#react) return;
    const view = mountNativeReactView<TabSidebarReactModel, TabSidebarReactCommand>({
      surface: 'tab-sidebar',
      root: this.#content,
      model: this.#model(),
      dispatch: () => {},
      isCurrent: () => !this.#disposed && this.#options.isCurrent(),
      loadingText: this.#text('title'),
      errorText: this.#text('operationFailed'),
      onError,
    });
    this.#react = view;
    void view.ready
      .then(() => {
        if (this.#disposed || this.#react !== view || !this.#options.isCurrent()) return;
        if (
          this.#pendingFocus !== undefined &&
          this.root.ownerDocument.activeElement === this.#pendingFocus
        )
          this.focus();
        this.#pendingFocus = undefined;
      })
      .catch(() => {});
  }

  #text(key: string): string {
    return t(`tabs.${key}`, this.#options.language());
  }
  #model(): TabSidebarReactModel {
    return {
      view: this.#view,
      language: this.#options.language(),
      collapsed: this.#collapsed,
      query: this.#query,
      editing: this.#editing,
      menu: this.#menu,
      status: this.#status,
    };
  }
  #render(): void {
    if (this.#disposed) return;
    this.root.setAttribute('aria-label', this.#text('title'));
    this.toolbarSlot.hidden = this.#collapsed;
    this.#react?.update(this.#model());
  }
  #part(name: string): HTMLElement | null {
    return this.#react?.getElement(name) ?? null;
  }
  #entry(id: string): TabSidebarEntry | undefined {
    if (this.#view.library?.id === id) return this.#view.library;
    for (const entry of this.#view.ungrouped) if (entry.id === id) return entry;
    for (const group of this.#view.groups) {
      const entry = group.entries.find((candidate) => candidate.id === id);
      if (entry) return entry;
    }
    return undefined;
  }
  #group(id: string): TabSidebarGroup | undefined {
    return this.#view.groups.find((group) => group.id === id);
  }
  update(view: TabSidebarView, collapsed: boolean): void {
    if (this.#disposed) return;
    this.#view = view;
    this.#collapsed = collapsed;
    this.#drag = null;
    if (this.#menu) this.#closeMenu(true);
    this.#render();
  }
  ownsTarget(target: EventTarget | null): boolean {
    return (
      !!target && this.root.contains(target as Node) && !this.toolbarSlot.contains(target as Node)
    );
  }
  handleKey(event: KeyboardEvent): void {
    if (this.#disposed || !this.#options.isCurrent() || !this.ownsTarget(event.target)) return;
    const target = event.target as HTMLElement;
    const editor = this.#part('editor');
    const query = this.#part('query');
    if (
      compositionOwnsKey(event, target === editor ? this.#editComposing : this.#searchComposing) ||
      event.getModifierState?.('AltGraph')
    ) {
      this.#runtime.deactivate();
      event.stopPropagation();
      return;
    }
    const key = keyString(event);
    if (key === 'escape' && this.#part('menu')?.contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#closeMenu(false);
      this.#part('list')?.focus();
      return;
    }
    if (target === editor) {
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
    const context = target === query ? 'tabs-input' : 'tabs-list';
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
    const group = selection?.kind === 'group' ? this.#group(selection.id) : undefined;
    const entry = selection?.kind === 'entry' ? this.#entry(selection.id) : undefined;
    const callbacks = this.#options.callbacks;
    switch (action) {
      case 'uiSearch':
        this.#part('query')?.focus();
        return true;
      case 'uiFocusList':
        this.#part('list')?.focus();
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
        if (entry && entry.kind !== 'other') callbacks.activate(entry.id);
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
    if (this.#disposed) return;
    const element = this.#part(this.#collapsed ? 'toggle' : 'list');
    if (element) element.focus();
    else this.#pendingFocus = this.root.ownerDocument.activeElement;
  }
  status(message: string): void {
    this.#status = message;
    this.#render();
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#runtime.dispose();
    this.root.ownerDocument.removeEventListener('mousedown', this.#dismissMenu, true);
    this.root.removeEventListener('click', this.#click);
    this.root.removeEventListener('contextmenu', this.#contextMenu);
    this.root.removeEventListener('focusin', this.#focusIn);
    this.root.removeEventListener('input', this.#input);
    this.root.removeEventListener('compositionstart', this.#compositionStart);
    this.root.removeEventListener('compositionend', this.#compositionEnd);
    this.root.removeEventListener('dragstart', this.#dragStart);
    this.root.removeEventListener('dragend', this.#dragEnd);
    this.root.removeEventListener('dragover', this.#dragOver);
    this.root.removeEventListener('drop', this.#drop);
    this.#react?.dispose();
    this.#react = null;
    this.#untheme();
    this.#drag = null;
    this.root.remove();
  }
  #moveSelection(delta: number): void {
    const list = this.#part('list');
    if (!list) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-neo-tab-row]'),
      (row) => row as HTMLElement,
    ).filter((row) => !row.hidden);
    if (!rows.length) return;
    const index = rows.findIndex(
      (row) =>
        row.dataset.neoTabRow === this.#selection?.kind &&
        (row.dataset.groupId === this.#selection?.id ||
          row.dataset.entryId === this.#selection?.id),
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
    rows[next]!.focus();
  }
  #startEdit(groupID: string | null, memberID?: string): void {
    if (this.#editing) return;
    const group = groupID ? this.#group(groupID) : undefined;
    if (groupID && !group) return;
    this.#closeMenu(false);
    this.#editing = { groupID, memberID, initialName: group?.name ?? '' };
    this.#editComposing = false;
    this.#render();
    const input = this.#part('editor') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
  #commitEdit(): void {
    const editor = this.#part('editor') as HTMLInputElement | null;
    const editing = this.#editing;
    if (!editor || !editing) return;
    const name = editor.value.trim();
    if (!name) {
      this.status(this.#text('emptyName'));
      return;
    }
    if (
      (editing.groupID && !this.#group(editing.groupID)) ||
      (editing.memberID && !this.#entry(editing.memberID))
    ) {
      this.#endEdit();
      return;
    }
    this.#endEdit();
    if (editing.groupID) this.#options.callbacks.renameGroup(editing.groupID, name);
    else this.#options.callbacks.createGroup(name, editing.memberID);
  }
  #endEdit(): void {
    this.#editing = null;
    this.#editComposing = false;
    this.#render();
    this.#part('list')?.focus();
  }
  #focusIn = (event: FocusEvent): void => {
    const row = asElement(event.target)?.closest<HTMLElement>('[data-neo-tab-row]');
    if (!row || !this.root.contains(row)) return;
    const kind = row.dataset.neoTabRow;
    const id = kind === 'group' ? row.dataset.groupId : row.dataset.entryId;
    if ((kind === 'group' || kind === 'entry') && id) this.#selection = { kind, id };
  };
  #input = (event: Event): void => {
    if (event.target === this.#part('query') && isCommittedInput(event, this.#searchComposing)) {
      this.#query = (event.target as HTMLInputElement).value;
      this.#render();
    }
  };
  #compositionStart = (event: Event): void => {
    if (event.target === this.#part('query')) this.#searchComposing = true;
    if (event.target === this.#part('editor')) this.#editComposing = true;
  };
  #compositionEnd = (event: Event): void => {
    if (event.target === this.#part('editor')) this.#editComposing = false;
    if (event.target === this.#part('query')) {
      this.#searchComposing = false;
      this.#query = (event.target as HTMLInputElement).value;
      this.#render();
    }
  };
  #click = (event: MouseEvent): void => {
    if (this.#disposed || !this.#options.isCurrent()) return;
    const element = asElement(event.target)?.closest<HTMLElement>('[data-action]');
    if (!element || !this.root.contains(element)) return;
    const action = element.dataset.action;
    const groupID = element.dataset.groupId || '';
    const entryID = element.dataset.entryId || '';
    if (action === 'group-menu' || action === 'entry-menu') {
      this.#showMenu(
        event,
        action === 'group-menu' ? 'group' : 'entry',
        groupID || null,
        entryID || undefined,
        element,
      );
      return;
    }
    if (this.#menu) this.#closeMenu(false);
    const callbacks = this.#options.callbacks;
    switch (action) {
      case 'toggle-sidebar':
        callbacks.toggleSidebar();
        break;
      case 'new-group':
        this.#startEdit(null);
        break;
      case 'new-group-for-entry':
        if (this.#entry(entryID)) this.#startEdit(null, entryID);
        break;
      case 'toggle-group':
        if (this.#group(groupID)) callbacks.toggleGroup(groupID);
        break;
      case 'activate':
        if (this.#entry(entryID)) callbacks.activate(entryID);
        break;
      case 'close':
        if (this.#entry(entryID)?.status === 'open') callbacks.close(entryID);
        break;
      case 'remove':
        if (this.#entry(entryID)) callbacks.removeMember(entryID);
        break;
      case 'move-member':
        if (this.#entry(entryID) && this.#group(groupID))
          callbacks.moveMember(entryID, groupID, null);
        break;
      case 'rename':
        if (this.#group(groupID)) this.#startEdit(groupID);
        break;
      case 'color':
        if (this.#group(groupID) && element.dataset.color)
          callbacks.setGroupColor(groupID, element.dataset.color);
        break;
      case 'close-group':
        if (this.#group(groupID)) callbacks.closeGroup(groupID);
        break;
      case 'ungroup':
        if (this.#group(groupID)) callbacks.ungroup(groupID);
        break;
    }
  };
  #contextMenu = (event: MouseEvent): void => {
    if (this.#disposed || this.#editing || !this.#options.isCurrent()) return;
    const target = asElement(event.target);
    const list = this.#part('list');
    if (!target || !list?.contains(target)) return;
    const row = target.closest<HTMLElement>('[data-neo-tab-row]');
    const kind = row?.dataset.neoTabRow;
    const groupID = row?.dataset.groupId || null;
    const entryID = row?.dataset.entryId;
    if (kind === 'entry') {
      const entry = entryID && this.#entry(entryID);
      if (entry && entry.kind !== 'library' && entry.kind !== 'other') {
        this.#showMenu(event, 'entry', groupID, entryID, row!);
        return;
      }
    }
    if (kind === 'group' && groupID && this.#group(groupID))
      this.#showMenu(event, 'group', groupID, undefined, row!);
    else this.#showMenu(event, 'blank', null, undefined, list);
  };
  #showMenu(
    event: MouseEvent,
    kind: 'blank' | 'group' | 'entry',
    groupID: string | null,
    entryID: string | undefined,
    origin: HTMLElement,
  ): void {
    if (this.#editing) return;
    event.preventDefault();
    event.stopPropagation();
    this.#menuOrigin = origin;
    const anchor = origin.getBoundingClientRect();
    this.#menu = {
      kind,
      groupID,
      entryID,
      x: event.clientX || anchor.left,
      y: event.clientY || anchor.bottom,
    };
    this.#render();
    const menu = this.#part('menu');
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(
        this.#menu.x,
        (this.#options.window.innerWidth || this.#menu.x + rect.width) - rect.width,
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        this.#menu.y,
        (this.#options.window.innerHeight || this.#menu.y + rect.height) - rect.height,
      ),
    );
    if (x !== this.#menu.x || y !== this.#menu.y) {
      this.#menu = { ...this.#menu, x, y };
      this.#render();
    }
    this.#part('menu')?.querySelector<HTMLElement>('button')?.focus();
  }
  #closeMenu(restoreFocus: boolean): void {
    if (!this.#menu) return;
    const focused = !!this.#part('menu')?.contains(this.root.ownerDocument.activeElement);
    this.#menu = null;
    this.#render();
    if (restoreFocus && focused && this.#options.isCurrent())
      (this.#menuOrigin?.isConnected ? this.#menuOrigin : this.#part('list'))?.focus();
    this.#menuOrigin = null;
  }
  #dismissMenu = (event: MouseEvent): void => {
    const menu = this.#part('menu');
    if (menu && !menu.contains(event.target as Node)) this.#closeMenu(false);
  };
  #dragStart = (event: DragEvent): void => {
    const row = asElement(event.target)?.closest<HTMLElement>('[data-neo-tab-row]');
    if (!row || !row.draggable || this.#query.trim() || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const kind = row.dataset.neoTabRow;
    const id = kind === 'group' ? row.dataset.groupId : row.dataset.entryId;
    if ((kind !== 'group' && kind !== 'entry') || !id) {
      event.preventDefault();
      return;
    }
    const token = `${Date.now()}-${++this.#dragSerial}-${Math.random()}`;
    this.#drag = { kind, id, token };
    event.dataTransfer.setData(DRAG_TYPE, token);
    event.dataTransfer.effectAllowed = 'move';
  };
  #dragEnd = (): void => {
    this.#drag = null;
  };
  #dragOver = (event: DragEvent): void => {
    if (
      !this.#drag ||
      this.#query.trim() ||
      !event.dataTransfer ||
      !Array.from(event.dataTransfer.types).includes(DRAG_TYPE) ||
      !this.#part('list')?.contains(event.target as Node)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  };
  #drop = (event: DragEvent): void => {
    const drag = this.#drag;
    if (
      !drag ||
      this.#query.trim() ||
      !event.dataTransfer ||
      event.dataTransfer.getData(DRAG_TYPE) !== drag.token ||
      !this.#options.isCurrent()
    )
      return;
    const target = asElement(event.target);
    if (!target || !this.#part('list')?.contains(target)) return;
    const row = target.closest<HTMLElement>('[data-neo-tab-row]');
    if (drag.kind === 'group') {
      const before = row?.dataset.neoTabRow === 'group' ? row.dataset.groupId || null : null;
      if (!this.#group(drag.id) || (before && !this.#group(before)) || drag.id === before) return;
      event.preventDefault();
      event.stopPropagation();
      this.#drag = null;
      this.#options.callbacks.moveGroup(drag.id, before);
      return;
    }
    const entry = this.#entry(drag.id);
    const section = target.closest<HTMLElement>('[data-drop-group]');
    const groupID = row?.dataset.groupId || section?.dataset.dropGroup || null;
    const before = row?.dataset.neoTabRow === 'entry' ? row.dataset.entryId || null : null;
    if (
      !entry ||
      entry.kind === 'library' ||
      entry.kind === 'other' ||
      (groupID && !this.#group(groupID)) ||
      (before && !this.#entry(before)) ||
      drag.id === before
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.#drag = null;
    this.#options.callbacks.moveMember(drag.id, groupID, before);
  };
}
