import { CleanupFailure, type Cleanup } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { neoCommandLanguage } from '../core/preferences';
import { compositionOwnsKey } from '../input/composition';
import type { KeyGuideLanguage } from '../input/key-guide-config';
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
import {
  displayAttributeValue,
  encodeAttributeChoices,
  normalizeAttributeKey,
  normalizeAttributeValue,
  readAttributeChoices,
  readAttributeValue,
} from './extra';
import type { ItemAttributesCommand, ItemAttributesModel } from './react-model';
import { ItemAttributeStore } from './store';
import {
  isChoiceAttribute,
  MAX_ITEM_ATTRIBUTE_OPTIONS,
  type ItemAttributeDefinition,
  type ItemAttributeOption,
  type ItemAttributeSchema,
  type ItemAttributeState,
  type ItemAttributeType,
} from './types';

type AttributeDestination = NonNullable<ItemAttributesModel['discard']>;

function newAttributeIdentity(
  definitions: readonly ItemAttributeDefinition[],
  key: string,
): Pick<ItemAttributeDefinition, 'id' | 'key'> {
  const ids = new Set(definitions.map((definition) => definition.id));
  const keys = new Set(definitions.map((definition) => normalizeAttributeKey(definition.key)));
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = `neo-attribute-${Zotero.Utilities.randomString(20).toLowerCase()}`;
    if (!ids.has(id) && (key || !keys.has(normalizeAttributeKey(id)))) {
      return { id, key: key || id };
    }
  }
  throw new Error('Could not generate a unique attribute identity');
}

function newOptionID(
  options: readonly ItemAttributeOption[],
  original: readonly ItemAttributeOption[] | undefined,
): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = Zotero.Utilities.randomString(20).toLowerCase();
    if (
      !options.some((option) => option.id === id) &&
      !original?.some((option) => option.id === id)
    )
      return id;
  }
  throw new Error('Could not generate a unique attribute option ID');
}

function sameOptions(
  left: readonly ItemAttributeOption[],
  right: readonly ItemAttributeOption[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (option, index) => option.id === right[index].id && option.label === right[index].label,
    )
  );
}

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
    options: readonly ItemAttributeOption[];
    revision: string;
    original: ItemAttributeDefinition | null;
  } | null;
  removing: { definition: ItemAttributeDefinition; revision: string } | null;
  discard: {
    readonly destination: AttributeDestination;
    readonly focus: HTMLElement | null;
  } | null;
}

/** Application-owned native registrations and one owner-fenced, explicit-target editor. */
export class ItemAttributesController implements ItemAttributesPort {
  readonly #store: ItemAttributeStore;
  readonly #debug: (message: string) => void;
  readonly #language: () => KeyGuideLanguage;
  readonly #windows = new Map<MainWindow, WindowLease>();
  readonly #pendingDetaches = new Set<Cleanup>();
  #native: ItemAttributeNativeHost | null = null;
  #schema: ItemAttributeSchema | null = null;
  #unobserve: Cleanup | null = null;
  #view: AttributeView | null = null;
  #started = false;
  #disposed = false;
  #generation = 0;

  constructor(preferences: PreferenceStore, debug: (message: string) => void) {
    this.#store = new ItemAttributeStore(preferences, assertCustomExtraKey);
    this.#language = () => neoCommandLanguage(preferences, Zotero.locale ?? '');
    this.#debug = debug;
  }

  start(pluginID: string): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    void Promise.resolve(Zotero.initializationPromise)
      .then(() => {
        if (this.#disposed) return;
        this.#native = createItemAttributeNativeHost(
          pluginID,
          (error, window) => this.#report(error, window),
          this.#language,
        );
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
        const failure = new CleanupFailure();
        failure.run(() => {
          throw error;
        });
        failure.run(() => {
          this.#unobserve?.();
          this.#unobserve = null;
        });
        for (const lease of this.#windows.values())
          failure.run(() => this.#releaseNativeWindow(lease));
        failure.run(() => {
          this.#native?.dispose();
          this.#native = null;
        });
        try {
          failure.rethrow();
        } catch (firstError) {
          this.#report(firstError);
        }
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
    const failure = new CleanupFailure();
    failure.run(() => this.closeOwner(window));
    failure.run(() => {
      if (!isDeadObject(window)) window.removeEventListener('unload', lease.unload);
    });
    failure.run(() => this.#releaseNativeWindow(lease));
    failure.rethrow();
  }

  #releaseNativeWindow(lease: WindowLease): void {
    const detach = lease.detach;
    lease.detach = null;
    if (!detach) return;
    this.#pendingDetaches.add(detach);
    detach();
    this.#pendingDetaches.delete(detach);
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
            if (state.ambiguous || state.value === null) return '';
            if (!isChoiceAttribute(definition.type)) return state.value;
            const display = displayAttributeValue(definition, state.value);
            if (display.valid) return display.text;
            const chinese = this.#language() === 'zh-CN';
            return readAttributeChoices(definition, state.value) === null
              ? chinese
                ? '无法读取的选项值'
                : 'Unreadable selection'
              : (chinese ? '含不可用选项：' : 'Contains unavailable options: ') + display.text;
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
          (view.react?.getElement(view.discard ? 'keep-editing' : 'close') ?? root).focus();
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
      discard: null,
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
      try {
        this.#close();
      } catch {
        // The mounting failure remains primary; #close attempts every release.
        this.#debug('Item attributes interface cleanup failed');
      }
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
    const definitions = this.#schema?.definitions ?? [];
    const definition = definitions.find(({ id }) => id === view.selectedID) ?? definitions[0];
    view.selectedID = definition?.id ?? '';
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
    const draft = view.draft;
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
      draft: draft && {
        id: draft.id,
        key: draft.key,
        label: draft.label,
        type: draft.type,
        options: draft.options,
      },
      removing: view.removing?.definition ?? null,
      discard: view.discard?.destination ?? null,
    };
  }

  #render(view: AttributeView): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }

  #hasUnsavedChanges(view: AttributeView): boolean {
    if (view.mode === 'values') {
      const original = view.mixed ? '' : (view.targets[0]?.value ?? '');
      return view.review !== null || view.input !== original;
    }
    const draft = view.draft;
    return (
      draft !== null &&
      (draft.label !== (draft.original?.label ?? '') ||
        draft.type !== (draft.original?.type ?? 'text') ||
        draft.key !== (draft.original?.key ?? '') ||
        (isChoiceAttribute(draft.type) &&
          !sameOptions(draft.options, draft.original?.options ?? [])))
    );
  }

  #leave(view: AttributeView, destination: AttributeDestination): void {
    if (destination === 'close') {
      this.#close(true);
      return;
    }
    view.mode = destination;
    view.discard = null;
    view.draft = null;
    view.removing = null;
    view.review = null;
    view.status = '';
    view.error = false;
    if (destination === 'values') this.#captureValues(view);
    this.#render(view);
    view.react?.getElement('close')?.focus();
  }

  #dispatch(view: AttributeView, command: ItemAttributesCommand): void {
    if (view.busy) return;
    const pending = view.discard;
    if (pending) {
      if (command.type === 'confirm-discard') this.#leave(view, pending.destination);
      else if (command.type === 'keep-editing') {
        view.discard = null;
        this.#render(view);
        const focus = pending.focus;
        if (focus && view.root.contains(focus)) focus.focus();
        else view.react?.getElement('close')?.focus();
      }
      return;
    }
    if (command.type === 'close' || command.type === 'mode') {
      const destination = command.type === 'mode' ? command.value : 'close';
      if (destination === view.mode || (destination === 'values' && !view.items.length)) return;
      if (this.#hasUnsavedChanges(view)) {
        view.discard = {
          destination,
          focus: view.root.ownerDocument.activeElement as HTMLElement | null,
        };
        this.#render(view);
        view.react?.getElement('keep-editing')?.focus();
      } else this.#leave(view, destination);
      return;
    }
    if (command.type === 'keep-editing' || command.type === 'confirm-discard') return;
    const editingDefinition = view.draft !== null;
    const reviewingValues = view.review !== null;
    let focusPart: string | undefined;
    try {
      view.error = false;
      view.status = '';
      const schema = this.#schema;
      switch (command.type) {
        case 'select':
          if (!schema?.definitions.some(({ id }) => id === command.id)) break;
          view.selectedID = command.id;
          this.#captureValues(view);
          break;
        case 'refresh-values':
          this.#captureValues(view);
          break;
        case 'input': {
          const definition = schema?.definitions.find(({ id }) => id === view.selectedID);
          if (view.mode !== 'values' || !definition || isChoiceAttribute(definition.type)) break;
          view.input = command.value;
          view.review = null;
          break;
        }
        case 'select-choice':
        case 'toggle-choice':
        case 'repair-choices': {
          if (view.mode !== 'values' || !this.#model(view).canWrite) break;
          const definition = schema!.definitions.find(({ id }) => id === view.selectedID)!;
          if (!isChoiceAttribute(definition.type)) break;
          const options = definition.options ?? [];
          if (command.type === 'repair-choices') {
            const ids = readAttributeChoices(definition, view.input || null) ?? [];
            view.input =
              encodeAttributeChoices(
                ids.filter((id) => options.some((option) => option.id === id)),
              ) ?? '';
            focusPart = options.length ? 'value-input' : 'clear-value';
          } else {
            if (!options.some((option) => option.id === command.id)) break;
            if (command.type === 'select-choice' && definition.type === 'single-select') {
              view.input = encodeAttributeChoices([command.id])!;
            } else if (command.type === 'toggle-choice' && definition.type === 'multi-select') {
              const ids = readAttributeChoices(definition, view.input || null);
              if (!ids) break;
              if (ids.length >= MAX_ITEM_ATTRIBUTE_OPTIONS && !ids.includes(command.id))
                throw new Error(
                  this.#text(
                    view,
                    '请先移除不可用的选项，再添加更多选项。',
                    'Remove unavailable choices before adding more selections.',
                  ),
                );
              view.input =
                encodeAttributeChoices(
                  ids.includes(command.id)
                    ? ids.filter((id) => id !== command.id)
                    : [...ids, command.id],
                ) ?? '';
            } else break;
          }
          view.review = null;
          break;
        }
        case 'new-definition':
          if (schema) {
            view.draft = {
              id: null,
              key: '',
              label: '',
              type: 'text',
              options: [],
              revision: schema.revision,
              original: null,
            };
          }
          view.removing = null;
          break;
        case 'edit-definition': {
          const definition = schema?.definitions.find(({ id }) => id === command.id);
          if (definition && schema) {
            view.draft = {
              ...definition,
              options: definition.options ?? [],
              revision: schema.revision,
              original: definition,
            };
          }
          view.removing = null;
          break;
        }
        case 'draft-label':
          if (view.draft) view.draft.label = command.value;
          break;
        case 'draft-key':
          if (view.draft && !view.draft.id) view.draft.key = command.value;
          break;
        case 'draft-type': {
          const draft = view.draft;
          if (!draft) break;
          const previous = draft.original?.type;
          if (
            previous &&
            previous !== command.value &&
            (isChoiceAttribute(previous) || isChoiceAttribute(command.value))
          )
            throw new Error(
              this.#text(
                view,
                '现有单选或多选属性不能更改类型，也不能将现有属性转换为单选或多选。',
                'Existing choice attributes cannot change type, and other attributes cannot be converted to a choice type.',
              ),
            );
          draft.type = command.value;
          break;
        }
        case 'draft-add-option': {
          const draft = view.draft;
          if (
            !draft ||
            !isChoiceAttribute(draft.type) ||
            draft.options.length >= MAX_ITEM_ATTRIBUTE_OPTIONS
          )
            break;
          const id = newOptionID(draft.options, draft.original?.options);
          draft.options = [...draft.options, { id, label: '' }];
          focusPart = `definition-option-${id}`;
          break;
        }
        case 'draft-rename-option': {
          const draft = view.draft;
          if (draft && isChoiceAttribute(draft.type)) {
            draft.options = draft.options.map((option) =>
              option.id === command.id ? { ...option, label: command.value } : option,
            );
          }
          break;
        }
        case 'draft-remove-option': {
          const draft = view.draft;
          if (!draft || !isChoiceAttribute(draft.type)) break;
          const index = draft.options.findIndex(({ id }) => id === command.id);
          if (index < 0) break;
          draft.options = draft.options.filter(({ id }) => id !== command.id);
          const next = draft.options[index] ?? draft.options[index - 1];
          focusPart = next ? `definition-option-${next.id}` : 'definition-add-option';
          break;
        }
        case 'cancel-definition':
          view.draft = null;
          break;
        case 'save-definition': {
          const draft = view.draft;
          if (!schema || !draft) break;
          const identity = draft.original ?? newAttributeIdentity(schema.definitions, draft.key);
          const definition: ItemAttributeDefinition = {
            id: identity.id,
            key: identity.key,
            label: draft.label,
            type: draft.type,
            ...(isChoiceAttribute(draft.type) && {
              options: draft.options.map(({ id, label }) => ({
                id,
                label: label.trim().normalize('NFC'),
              })),
            }),
          };
          this.#store.write(
            draft.original
              ? schema.definitions.map((entry) => (entry.id === definition.id ? definition : entry))
              : [...schema.definitions, definition],
            draft.revision,
          );
          view.draft = null;
          this.#refreshSchema();
          view.status = this.#text(
            view,
            isChoiceAttribute(definition.type)
              ? '属性已保存。通过 Zotero 列表的列菜单显示该列；右键单击条目，选择「编辑自定义属性…」来设置值。'
              : '属性已保存。通过 Zotero 列表的列菜单显示该列，在条目的「信息」面板填写值。',
            isChoiceAttribute(definition.type)
              ? 'Attribute saved. Show its column from the Zotero item-list column menu; right-click an item and choose Edit Custom Attributes… to set its value.'
              : 'Attribute saved. Show its column from the Zotero item-list column menu; enter values in the item’s Info pane.',
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
              '属性已删除，原有值已保留。',
              'Attribute removed; existing values were kept.',
            );
          }
          break;
        case 'cancel-review':
          view.review = null;
          break;
        case 'set-value':
        case 'clear-value': {
          if (view.mode !== 'values') break;
          if (!this.#model(view).canWrite)
            throw new Error(
              this.#text(
                view,
                '请重新读取值并检查目标。',
                'Reload values and inspect the targets.',
              ),
            );
          const definition = schema!.definitions.find(({ id }) => id === view.selectedID)!;
          if (command.type === 'set-value' && isChoiceAttribute(definition.type) && !view.input)
            throw new Error(
              this.#text(
                view,
                '请选择替换选项，或使用「清除值」。',
                'Choose a replacement or use Clear value.',
              ),
            );
          const value = normalizeAttributeValue(
            definition,
            command.type === 'clear-value' ? null : view.input,
          );
          if (view.items.length > 1) view.review = { value };
          else this.#writeValues(view, definition, value);
          break;
        }
        case 'confirm-values': {
          if (view.mode !== 'values' || !view.review || !this.#model(view).canWrite) break;
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
    if (editingDefinition !== (view.draft !== null)) {
      view.react?.getElement(view.draft ? 'definition-label' : 'new-definition')?.focus();
    } else if (reviewingValues !== (view.review !== null)) {
      view.react?.getElement(view.review ? 'value-review' : 'value-input')?.focus();
    } else if (focusPart) {
      view.react?.getElement(focusPart)?.focus();
    }
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
          (view.react?.getElement('value-input') ?? view.root).focus();
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
      this.#dispatch(view, { type: view.discard ? 'keep-editing' : 'close' });
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      (view.react?.getElement(view.discard ? 'keep-editing' : 'close') ?? view.root).focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll('input,select,textarea,button,summary,[tabindex="0"]'),
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
    this.#view = null;
    const failure = new CleanupFailure();
    let ownedFocus = false;
    failure.run(() => {
      ownedFocus =
        !isDeadObject(view.root) && view.root.contains(view.root.ownerDocument.activeElement);
    });
    failure.run(() => {
      if (!isDeadObject(view.host.window))
        view.host.window.removeEventListener('keydown', view.capture, true);
    });
    failure.run(() => {
      if (!isDeadObject(view.host.window))
        view.host.window.removeEventListener('focusin', view.containFocus, true);
    });
    failure.run(() => {
      if (!isDeadObject(view.host.window))
        view.host.window.removeEventListener('unload', view.unload);
    });
    failure.run(() => {
      if (!isDeadObject(view.root))
        view.root.removeEventListener('compositionstart', view.compositionStart);
    });
    failure.run(() => {
      if (!isDeadObject(view.root))
        view.root.removeEventListener('compositionend', view.compositionEnd);
    });
    failure.run(() => view.react?.dispose());
    failure.run(() => view.untheme());
    failure.run(() => {
      if (!isDeadObject(view.backdrop)) view.backdrop.remove();
    });
    failure.run(() => {
      if (
        restore &&
        ownedFocus &&
        !isDeadObject(view.host.window) &&
        view.host.isCurrent() &&
        view.focus?.isConnected
      )
        view.focus.focus();
    });
    failure.rethrow();
  }

  dispose(): void {
    if (!this.#disposed) {
      this.#disposed = true;
      this.#generation++;
    }
    this.#schema = null;
    const failure = new CleanupFailure();
    const pendingDetaches = [...this.#pendingDetaches];
    failure.run(() => this.#close());
    failure.run(() => {
      this.#unobserve?.();
      this.#unobserve = null;
    });
    for (const window of [...this.#windows.keys()]) failure.run(() => this.#detachWindow(window));
    for (const detach of pendingDetaches)
      failure.run(() => {
        detach();
        this.#pendingDetaches.delete(detach);
      });
    failure.run(() => {
      this.#native?.dispose();
      this.#native = null;
    });
    failure.run(() => this.#store.dispose());
    failure.rethrow();
  }
}
