import type { Cleanup } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { setItemAttribute } from '../operations/item-attributes';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import {
  assertCustomExtraKey,
  createItemAttributeNativeHost,
  type ItemAttributeNativeHost,
  type NativeItemAttribute,
} from '../toolkit/main';
import type { NativeReactView } from '../ui/react/types';
import { PREPARATION_BACKDROP_STYLE, PREPARATION_PANEL_STYLE } from '../ui/react/shells/reader';
import type { ItemAttributesPort, ItemAttributesPresentation } from './contracts';
import { normalizeAttributeValue, readAttributeValue } from './extra';
import type { ItemAttributesCommand, ItemAttributesModel } from './react-model';
import { ItemAttributeStore } from './store';
import type {
  ItemAttributeDefinition,
  ItemAttributeSchema,
  ItemAttributeState,
  ItemAttributeType,
} from './types';

interface WindowLease {
  readonly leases: Set<symbol>;
  readonly unload: () => void;
  detach: Cleanup | null;
}
interface AttributeView {
  readonly host: ItemAttributesPresentation;
  readonly items: readonly Zotero.Item[];
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly focus: HTMLElement | null;
  readonly untheme: Cleanup;
  readonly capture: (event: KeyboardEvent) => void;
  readonly containFocus: (event: FocusEvent) => void;
  readonly unload: () => void;
  readonly compositionStart: () => void;
  readonly compositionEnd: () => void;
  react: NativeReactView<ItemAttributesModel> | null;
  mode: 'definitions' | 'values';
  selectedID: string;
  expected: ReadonlyMap<number, ItemAttributeState>;
  baselineRevision: string | null;
  targets: ItemAttributesModel['targets'];
  input: string;
  mixed: boolean;
  admitted: boolean;
  busy: boolean;
  composition: boolean;
  status: string;
  error: boolean;
  review: { readonly value: string | null } | null;
  draft: {
    id: string | null;
    key: string;
    label: string;
    type: ItemAttributeType;
    revision: string;
  } | null;
  removing: { definition: ItemAttributeDefinition; revision: string } | null;
}

/** Application-owned native registrations and one owner-fenced, explicit-target editor. */
export class ItemAttributesController implements ItemAttributesPort {
  readonly #store: ItemAttributeStore;
  readonly #debug: (message: string) => void;
  readonly #windows = new Map<MainWindow, WindowLease>();
  #native: ItemAttributeNativeHost | null = null;
  #schema: ItemAttributeSchema | null = null;
  #unobserve: Cleanup | null = null;
  #view: AttributeView | null = null;
  #started = false;
  #disposed = false;
  #generation = 0;

  constructor(preferences: PreferenceStore, debug: (message: string) => void) {
    this.#store = new ItemAttributeStore(preferences, assertCustomExtraKey);
    this.#debug = debug;
  }

  start(pluginID: string): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    void Promise.resolve(Zotero.initializationPromise)
      .then(() => {
        if (this.#disposed) return;
        this.#native = createItemAttributeNativeHost(pluginID, (error, window) => {
          this.#report(error, window);
        });
        this.#unobserve = this.#store.observe(() => this.#refreshSchema());
        this.#refreshSchema();
        for (const [window, lease] of this.#windows) {
          if (!isDeadObject(window)) lease.detach = this.#native.attachWindow(window);
        }
      })
      .catch((error: unknown) => {
        if (this.#disposed) return;
        this.#generation++;
        this.#schema = null;
        this.#unobserve?.();
        this.#unobserve = null;
        this.#native?.dispose();
        this.#native = null;
        for (const lease of this.#windows.values()) lease.detach = null;
        this.#report(error);
      });
  }

  attachWindow(window: MainWindow): Cleanup {
    if (this.#disposed || isDeadObject(window)) return () => {};
    let lease = this.#windows.get(window);
    if (!lease) {
      lease = { leases: new Set(), detach: null, unload: () => this.#detachWindow(window) };
      this.#windows.set(window, lease);
      window.addEventListener('unload', lease.unload, { once: true });
      try {
        lease.detach = this.#native?.attachWindow(window) ?? null;
      } catch (error) {
        this.#report(error, window);
      }
    }
    const token = Symbol();
    lease.leases.add(token);
    return () => {
      if (this.#windows.get(window) !== lease) return;
      lease.leases.delete(token);
      if (!lease.leases.size) this.#detachWindow(window);
    };
  }

  #detachWindow(window: MainWindow): void {
    const lease = this.#windows.get(window);
    if (!lease) return;
    this.#windows.delete(window);
    this.closeOwner(window);
    if (!isDeadObject(window)) window.removeEventListener('unload', lease.unload);
    lease.detach?.();
  }

  #text(view: AttributeView, cn: string, en: string): string {
    return view.host.language() === 'zh-CN' ? cn : en;
  }

  #current(view: AttributeView): boolean {
    return (
      !this.#disposed &&
      this.#view === view &&
      !isDeadObject(view.root) &&
      view.root.isConnected &&
      view.host.isCurrent()
    );
  }

  #definitionCurrent(
    definition: ItemAttributeDefinition,
    revision: string,
    generation: number,
  ): boolean {
    if (this.#disposed || generation !== this.#generation || this.#schema?.revision !== revision)
      return false;
    try {
      return (
        this.#store.read().revision === revision && this.#schema.definitions.includes(definition)
      );
    } catch {
      return false;
    }
  }

  #writable(item: Zotero.Item): boolean {
    try {
      const library = Zotero.Libraries.get(item.libraryID);
      return (
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        Zotero.Items.get(item.id) === item &&
        Number.isSafeInteger(item.libraryID) &&
        item.libraryID > 0 &&
        item.isRegularItem() &&
        !item.deleted &&
        !item.isFeedItem &&
        item.isEditable() &&
        !!library &&
        library.editable &&
        !library.archived &&
        library.libraryType !== 'feed'
      );
    } catch {
      return false;
    }
  }

  #report(error: unknown, window?: MainWindow): void {
    this.#debug('Item attributes operation failed');
    const detail = error instanceof Error ? error.message : String(error);
    const view = this.#view;
    if (view && this.#current(view) && (!window || window === view.host.window)) {
      view.error = true;
      view.status = this.#text(view, '属性操作失败：', 'Attribute operation failed: ') + detail;
      this.#render(view);
      return;
    }
    const owners = window ? [window] : [...this.#windows.keys()];
    for (const owner of owners) {
      if (!isDeadObject(owner))
        owner.alert(`自定义属性不可用 / Item attributes unavailable\n${detail}`);
    }
  }

  #refreshSchema(): void {
    if (this.#disposed || !this.#native) return;
    try {
      const schema = this.#store.read();
      if (schema.revision === this.#schema?.revision) return;
      const generation = ++this.#generation;
      this.#schema = schema;
      const definitions: NativeItemAttribute[] = schema.definitions.map((definition) => {
        const current = () => this.#definitionCurrent(definition, schema.revision, generation);
        return {
          id: definition.id,
          label: definition.label,
          type: definition.type,
          read: (item) => {
            if (!current() || !item.isRegularItem() || item.deleted) return '';
            const state = readAttributeValue(String(item.getField('extra') ?? ''), definition.key);
            return state.ambiguous ? '' : (state.value ?? '');
          },
          canEdit: (item) => current() && this.#writable(item),
          write: async (item, input, expectedExtra, isCurrent) => {
            const expected = new Map([
              [item.id, readAttributeValue(expectedExtra, definition.key)],
            ]);
            await setItemAttribute([item], definition, input, {
              expected,
              isCurrent: () => current() && isCurrent(),
            });
          },
        };
      });
      this.#native.replace(definitions);
      const view = this.#view;
      if (view && this.#current(view)) {
        view.review = null;
        if (!view.selectedID && schema.definitions.length && view.baselineRevision === null) {
          view.selectedID = schema.definitions[0].id;
          this.#captureValues(view);
        } else if (view.baselineRevision !== schema.revision && view.mode === 'values') {
          view.status = this.#text(
            view,
            '定义已更改；请重新读取值，开始新编辑。',
            'Definitions changed; reload values to start a new edit.',
          );
          view.error = true;
        }
        this.#render(view);
      }
    } catch (error) {
      this.#generation++;
      this.#schema = null;
      try {
        this.#native.replace([]);
      } catch {
        this.#debug('Item attributes native retirement failed');
      }
      if (this.#view) this.#view.review = null;
      this.#report(error);
    }
  }

  open(host: ItemAttributesPresentation): Cleanup | null {
    if (this.#disposed || !host.isCurrent() || isDeadObject(host.window)) return null;
    if (
      host.items.some((item) => !this.#writable(item)) ||
      (host.mode === 'values' && !host.items.length)
    ) {
      this.#report(
        new Error(
          host.language() === 'zh-CN'
            ? '目标必须是可写的普通文献条目；未修改任何值。'
            : 'Targets must be writable ordinary bibliographic items; no values were changed.',
        ),
        host.window,
      );
      return null;
    }
    this.#close();
    const doc = host.window.document;
    const backdrop = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    backdrop.style.cssText = PREPARATION_BACKDROP_STYLE;
    const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'section') as HTMLElement;
    root.style.cssText = PREPARATION_PANEL_STYLE;
    root.className = 'neo-ui';
    root.dataset.neoItemAttributes = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute(
      'aria-label',
      host.language() === 'zh-CN' ? '条目自定义属性' : 'Item attributes',
    );
    const focus = doc.activeElement as HTMLElement | null;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const view: AttributeView = {
      host,
      items: Object.freeze([...host.items]),
      root,
      backdrop,
      focus,
      untheme: host.themeRoot(backdrop),
      capture: (event) => {
        this.handleKey(event);
      },
      containFocus: (event) => {
        if (this.#current(view) && event.target && !root.contains(event.target as Node))
          (view.react?.getElement('close') ?? root).focus();
      },
      unload: () => this.closeOwner(host.window),
      compositionStart: () => {
        view.composition = true;
      },
      compositionEnd: () => {
        view.composition = false;
      },
      react: null,
      mode: host.mode,
      selectedID: this.#schema?.definitions[0]?.id ?? '',
      expected: new Map(),
      baselineRevision: null,
      targets: [],
      input: '',
      mixed: false,
      admitted: false,
      busy: false,
      composition: false,
      status: '',
      error: false,
      review: null,
      draft: null,
      removing: null,
    };
    this.#view = view;
    this.#captureValues(view);
    if (!this.#schema) {
      view.error = true;
      view.status = this.#text(
        view,
        '属性尚未就绪，或定义无效。无效定义不会被自动重置。',
        'Attributes are not ready, or definitions are invalid. Invalid definitions are never reset automatically.',
      );
    }
    root.addEventListener('compositionstart', view.compositionStart);
    root.addEventListener('compositionend', view.compositionEnd);
    host.window.addEventListener('keydown', view.capture, true);
    host.window.addEventListener('focusin', view.containFocus, true);
    host.window.addEventListener('unload', view.unload, { once: true });
    try {
      view.react = mountNativeReactView<ItemAttributesModel, ItemAttributesCommand>({
        surface: 'item-attributes',
        root,
        model: this.#model(view),
        isCurrent: () => this.#current(view),
        loadingText: this.#text(view, '正在载入…', 'Loading…'),
        errorText: this.#text(view, '属性界面不可用', 'Attribute interface unavailable'),
        onError: () => this.#debug('Item attributes interface failed'),
        dispatch: (command) => {
          if (this.#current(view)) this.#dispatch(view, command);
        },
      });
    } catch (error) {
      this.#close();
      this.#report(error, host.window);
      return null;
    }
    root.focus();
    void view.react.ready
      .then(() => {
        if (this.#current(view) && root.contains(doc.activeElement))
          view.react?.getElement('close')?.focus();
      })
      .catch(() => this.#debug('Item attributes interface failed'));
    return () => {
      if (this.#view === view) this.#close();
    };
  }

  #captureValues(view: AttributeView): void {
    const definition = this.#schema?.definitions.find(({ id }) => id === view.selectedID);
    const expected = new Map<number, ItemAttributeState>();
    view.admitted =
      !!view.items.length && new Set(view.items.map(({ id }) => id)).size === view.items.length;
    view.targets = view.items.map((item) => {
      const state = definition
        ? readAttributeValue(String(item.getField('extra') ?? ''), definition.key)
        : { value: null, ambiguous: false };
      expected.set(item.id, state);
      if (!this.#writable(item) || state.ambiguous) view.admitted = false;
      return { id: item.id, title: String(item.getField('title') ?? ''), ...state };
    });
    view.expected = expected;
    view.baselineRevision = this.#schema?.revision ?? null;
    view.mixed = view.targets.some(({ value }) => value !== view.targets[0]?.value);
    view.input = view.mixed ? '' : (view.targets[0]?.value ?? '');
    view.review = null;
    if (definition && view.items.length && !view.admitted) {
      view.error = true;
      view.status = this.#text(
        view,
        '目标包含不可写的非普通文献条目，或属性存在歧义；未接纳任何写入。',
        'Targets include an unwritable/non-bibliographic item, or an ambiguous attribute; no writes are admitted.',
      );
    }
  }

  #model(view: AttributeView): ItemAttributesModel {
    return {
      chinese: view.host.language() === 'zh-CN',
      mode: view.mode,
      definitions: this.#schema?.definitions ?? [],
      available: !!this.#schema,
      busy: view.busy,
      status: view.status,
      error: view.error,
      selectedID: view.selectedID,
      targets: view.targets,
      mixed: view.mixed,
      input: view.input,
      canWrite:
        !view.busy &&
        view.admitted &&
        !!this.#schema &&
        view.baselineRevision === this.#schema.revision &&
        this.#schema.definitions.some(({ id }) => id === view.selectedID),
      review: view.review,
      draft: view.draft,
      removing: view.removing?.definition ?? null,
    };
  }

  #render(view: AttributeView): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }

  #dispatch(view: AttributeView, command: ItemAttributesCommand): void {
    if (command.type === 'close') {
      this.#close(true);
      return;
    }
    if (view.busy) return;
    try {
      view.error = false;
      view.status = '';
      const schema = this.#schema;
      switch (command.type) {
        case 'mode':
          if (command.value === 'values' && !view.items.length) break;
          view.mode = command.value;
          if (command.value === 'values') this.#captureValues(view);
          view.review = null;
          break;
        case 'select':
          if (!schema?.definitions.some(({ id }) => id === command.id)) break;
          view.selectedID = command.id;
          this.#captureValues(view);
          break;
        case 'refresh-values':
          this.#captureValues(view);
          break;
        case 'input':
          view.input = command.value;
          view.review = null;
          break;
        case 'new-definition':
          if (schema)
            view.draft = { id: null, key: '', label: '', type: 'text', revision: schema.revision };
          view.removing = null;
          break;
        case 'edit-definition': {
          const definition = schema?.definitions.find(({ id }) => id === command.id);
          if (definition && schema) view.draft = { ...definition, revision: schema.revision };
          view.removing = null;
          break;
        }
        case 'draft-label':
          if (view.draft) view.draft.label = command.value;
          break;
        case 'draft-key':
          if (view.draft && !view.draft.id) view.draft.key = command.value;
          break;
        case 'draft-type':
          if (view.draft) view.draft.type = command.value;
          break;
        case 'cancel-definition':
          view.draft = null;
          break;
        case 'save-definition': {
          const draft = view.draft;
          if (!schema || !draft) break;
          const definition: ItemAttributeDefinition = {
            id: draft.id ?? `neo-attribute-${Zotero.Utilities.randomString(20)}`,
            key: draft.key,
            label: draft.label,
            type: draft.type,
          };
          this.#store.write(
            draft.id
              ? schema.definitions.map((entry) => (entry.id === draft.id ? definition : entry))
              : [...schema.definitions, definition],
            draft.revision,
          );
          view.draft = null;
          this.#refreshSchema();
          view.status = this.#text(
            view,
            '定义已保存；已有条目值未改写。',
            'Definition saved; existing item values were not rewritten.',
          );
          break;
        }
        case 'remove-definition': {
          const definition = schema?.definitions.find(({ id }) => id === command.id);
          if (definition && schema) view.removing = { definition, revision: schema.revision };
          view.draft = null;
          break;
        }
        case 'cancel-remove':
          view.removing = null;
          break;
        case 'confirm-remove':
          if (schema && view.removing) {
            this.#store.write(
              schema.definitions.filter(({ id }) => id !== view.removing!.definition.id),
              view.removing.revision,
            );
            view.removing = null;
            this.#refreshSchema();
            view.status = this.#text(
              view,
              '定义已删除；所有 Extra 值已保留。',
              'Definition removed; all Extra values were kept.',
            );
          }
          break;
        case 'cancel-review':
          view.review = null;
          break;
        case 'set-value':
        case 'clear-value': {
          if (!this.#model(view).canWrite)
            throw new Error(
              this.#text(
                view,
                '请重新读取值并检查目标。',
                'Reload values and inspect the targets.',
              ),
            );
          const definition = schema!.definitions.find(({ id }) => id === view.selectedID)!;
          const value = normalizeAttributeValue(
            definition,
            command.type === 'clear-value' ? null : view.input,
          );
          if (view.items.length > 1) view.review = { value };
          else this.#writeValues(view, definition, value);
          break;
        }
        case 'confirm-values': {
          if (!view.review || !this.#model(view).canWrite) break;
          const definition = schema!.definitions.find(({ id }) => id === view.selectedID)!;
          this.#writeValues(view, definition, view.review.value);
          break;
        }
      }
    } catch (error) {
      view.error = true;
      view.status = error instanceof Error ? error.message : String(error);
    }
    this.#render(view);
  }

  #writeValues(
    view: AttributeView,
    definition: ItemAttributeDefinition,
    value: string | null,
  ): void {
    const expected = view.expected;
    const revision = view.baselineRevision!;
    const generation = this.#generation;
    view.busy = true;
    this.#render(view);
    void setItemAttribute(view.items, definition, value, {
      expected,
      isCurrent: () =>
        this.#current(view) &&
        view.expected === expected &&
        this.#definitionCurrent(definition, revision, generation),
    })
      .then((count) => {
        if (!this.#current(view)) return;
        view.error = false;
        view.status = this.#text(view, `已更新 ${count} 个条目。`, `Updated ${count} items.`);
        this.#captureValues(view);
      })
      .catch((error: unknown) => {
        if (!this.#current(view)) return;
        view.error = true;
        view.status = error instanceof Error ? error.message : String(error);
        view.review = null;
      })
      .finally(() => {
        if (this.#current(view)) {
          view.busy = false;
          this.#render(view);
        }
      });
  }

  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    const target = event.target as Node | null;
    if (
      !view ||
      !this.#current(view) ||
      !target ||
      target.ownerDocument !== view.root.ownerDocument
    )
      return false;
    event.stopImmediatePropagation();
    if (compositionOwnsKey(event, view.composition)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.#close(true);
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      (view.react?.getElement('close') ?? view.root).focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,textarea,button,[tabindex="0"]'),
        ) as HTMLElement[]
      ).filter((element) => !element.matches(':disabled') && element.getClientRects().length);
      if (
        !controls.length ||
        (key === 'tab' && (target === controls.at(-1) || target === view.root))
      ) {
        event.preventDefault();
        (controls[0] ?? view.root).focus();
      } else if (key === 'shift+tab' && (target === controls[0] || target === view.root)) {
        event.preventDefault();
        (controls.at(-1) ?? view.root).focus();
      }
    }
    return true;
  }

  closeOwner(window: Window): void {
    if (this.#view?.host.window === window) this.#close();
  }

  #close(restore = false): void {
    const view = this.#view;
    if (!view) return;
    const ownedFocus =
      !isDeadObject(view.root) && view.root.contains(view.root.ownerDocument.activeElement);
    this.#view = null;
    if (!isDeadObject(view.host.window)) {
      view.host.window.removeEventListener('keydown', view.capture, true);
      view.host.window.removeEventListener('focusin', view.containFocus, true);
      view.host.window.removeEventListener('unload', view.unload);
    }
    if (!isDeadObject(view.root)) {
      view.root.removeEventListener('compositionstart', view.compositionStart);
      view.root.removeEventListener('compositionend', view.compositionEnd);
    }
    try {
      view.react?.dispose();
    } finally {
      view.untheme();
      if (!isDeadObject(view.backdrop)) view.backdrop.remove();
    }
    if (
      restore &&
      ownedFocus &&
      !isDeadObject(view.host.window) &&
      view.host.isCurrent() &&
      view.focus?.isConnected
    )
      view.focus.focus();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    this.#close();
    this.#unobserve?.();
    this.#unobserve = null;
    for (const window of [...this.#windows.keys()]) this.#detachWindow(window);
    this.#native?.dispose();
    this.#native = null;
    this.#schema = null;
    this.#store.dispose();
  }
}
