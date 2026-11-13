import { CleanupFailure } from '../core/cleanup';
import { bindCompositionState, compositionOwnsKey, isCommittedInput } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import type { NativeReactView } from './react/types';
import type { SearchDialogReactCommand, SearchDialogReactModel } from './search-dialog-react-model';

export interface SearchDialogSource<T> {
  readonly items: readonly T[];
  readonly scopes?: readonly { readonly id: string; readonly title: string }[];
  readonly initialScope?: string;
}
export interface SearchDialogOptions<T> {
  readonly owner: Window;
  readonly current: () => boolean;
  readonly restoreFocus: () => void;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly title: string;
  readonly placeholder: string;
  readonly help: string;
  readonly loading: string;
  readonly unavailable: string;
  readonly close: string;
  readonly empty: string;
  readonly load: () => Promise<SearchDialogSource<T>>;
  readonly filter: (items: readonly T[], query: string, scope: string) => readonly T[];
  readonly label: (item: T) => string;
  readonly confirm: (item: T) => Promise<boolean | { readonly status: string }>;
  readonly debug: (error: unknown) => void;
  readonly onClose?: () => void;
  readonly preview?: (
    item: T,
    signal: AbortSignal,
  ) => Promise<{
    readonly text?: string;
    readonly images?: readonly { readonly dataURL: string; readonly alt: string }[];
  }>;
  readonly actions?: readonly {
    readonly label: string;
    readonly run: (item: T) => Promise<boolean | { readonly status: string }>;
    readonly available?: (item: T) => boolean;
  }[];
}
interface SearchView<T> {
  readonly options: SearchDialogOptions<T>;
  readonly root: HTMLElement;
  readonly document: Document;
  readonly composition: { active: boolean };
  readonly react: NativeReactView<SearchDialogReactModel>;
  readonly dispose: () => void;
  model: SearchDialogReactModel;
  items: readonly T[];
  filtered: readonly T[];
  selected: number;
  pending: boolean;
  previewRevision: number;
  previewAbort?: AbortController;
}

/** Small shared query/list surface. Callers own scope, matching, source validation and all mutations. */
export class SearchDialog<T> {
  #view: SearchView<T> | null = null;
  #current(view: SearchView<T>): boolean {
    if (this.#view !== view) return false;
    if (
      view.options.current() &&
      !isDeadObject(view.options.owner) &&
      view.options.owner.document === view.document &&
      !isDeadObject(view.root) &&
      view.root.isConnected
    )
      return true;
    this.close();
    return false;
  }

  open(options: SearchDialogOptions<T>): void {
    this.close();
    if (!options.current()) return;
    const document = options.owner.document;
    const root = document.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    root.tabIndex = -1;
    document.documentElement.append(root);
    let untheme: () => void;
    try {
      untheme = options.themeRoot(root);
    } catch (error) {
      root.remove();
      throw error;
    }
    const model: SearchDialogReactModel = {
      title: options.title,
      placeholder: options.placeholder,
      help: options.help,
      close: options.close,
      empty: options.empty,
      status: options.loading,
      loaded: false,
      scopes: [],
      scope: '',
      rows: [],
      selected: 0,
      pending: false,
      actions: (options.actions ?? []).map((action) => ({ label: action.label, disabled: false })),
      hasPreview: !!options.preview,
      previewText: '',
      previewImages: [],
    };
    let unbind = (): void => {};
    let view: SearchView<T>;
    let react: NativeReactView<SearchDialogReactModel>;
    try {
      react = mountNativeReactView<SearchDialogReactModel, SearchDialogReactCommand>({
        surface: 'search-dialog',
        root,
        model,
        isCurrent: () => this.#current(view),
        loadingText: options.loading,
        errorText: options.unavailable,
        onError: (error) => {
          options.debug(error);
          if (this.#current(view)) root.focus();
        },
        dispatch: (command) => {
          if (!this.#current(view)) return;
          if (command.type === 'close') this.close(true);
          else if (
            command.type === 'scope' &&
            view.model.scopes.some((scope) => scope.id === command.value)
          ) {
            view.model = { ...view.model, scope: command.value };
            this.#filter(view);
          } else if (
            command.type === 'select' &&
            Number.isInteger(command.index) &&
            command.index >= 0 &&
            command.index < view.filtered.length
          ) {
            if (view.selected === command.index) void this.#confirm(view);
            else this.#select(view, command.index);
          } else if (command.type === 'action' && Number.isInteger(command.index)) {
            const action = options.actions?.[command.index];
            const item = view.filtered[view.selected];
            if (action && item !== undefined && action.available?.(item) !== false)
              void this.#confirm(view, action.run);
          }
        },
      });
    } catch (error) {
      try {
        untheme();
      } catch {}
      root.remove();
      throw error;
    }
    view = {
      options,
      root,
      document,
      react,
      model,
      composition: { active: false },
      items: [],
      filtered: [],
      selected: 0,
      pending: false,
      previewRevision: 0,
      dispose: () => {
        const cleanup = new CleanupFailure();
        cleanup.run(unbind);
        cleanup.run(untheme);
        cleanup.run(() => {
          if (view.previewAbort && !isDeadObject(view.previewAbort)) view.previewAbort.abort();
        });
        cleanup.run(() => react.dispose());
        if (!isDeadObject(root)) cleanup.run(() => root.remove());
        cleanup.rethrow();
      },
    };
    this.#view = view;
    root.addEventListener('keydown', (event) => this.handleKey(event));
    void react.ready
      .then(() => {
        if (!this.#current(view)) return;
        const input = react.getElement('input') as HTMLInputElement | null;
        if (!input) return;
        unbind = bindCompositionState(input, view.composition);
        input.addEventListener('input', (event) => {
          if (isCommittedInput(event, view.composition.active)) this.#filter(view);
        });
        input.focus();
      })
      .catch(() => undefined);
    void options
      .load()
      .then((source) => {
        if (!this.#current(view)) return;
        view.items = source.items;
        const scopes = (source.scopes ?? []).map(({ id, title }) => ({ id, title }));
        const scope = scopes.some((item) => item.id === source.initialScope)
          ? source.initialScope!
          : (scopes[0]?.id ?? '');
        view.model = { ...view.model, scopes, scope };
        this.#filter(view);
      })
      .catch((error: unknown) => {
        if (this.#current(view)) {
          this.#update(view, { status: options.unavailable });
          options.debug(error);
        }
      });
  }

  #update(view: SearchView<T>, changes: Partial<SearchDialogReactModel>): void {
    view.model = { ...view.model, ...changes };
    view.react.update(view.model);
  }
  #filter(view: SearchView<T>): void {
    if (!this.#current(view) || view.pending) return;
    const input = view.react.getElement('input') as HTMLInputElement | null;
    view.filtered = view.options
      .filter(view.items, input?.value ?? '', view.model.scope)
      .slice(0, 100);
    view.model = {
      ...view.model,
      loaded: true,
      status: String(view.filtered.length) + (view.filtered.length === 100 ? '+' : ''),
    };
    this.#select(view, 0);
  }
  #select(view: SearchView<T>, index: number): void {
    if (!this.#current(view) || view.pending) return;
    view.selected = Math.max(0, Math.min(index, view.filtered.length - 1));
    const selected = view.filtered[view.selected];
    this.#update(view, {
      rows: view.filtered.map(view.options.label),
      selected: view.selected,
      actions: (view.options.actions ?? []).map((action) => ({
        label: action.label,
        disabled: selected === undefined || action.available?.(selected) === false,
      })),
    });
    view.react
      .getElement('results')
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
    void this.#preview(view, selected);
  }
  async #preview(view: SearchView<T>, item: T | undefined): Promise<void> {
    view.previewAbort?.abort();
    const revision = ++view.previewRevision;
    this.#update(view, { previewText: '', previewImages: [] });
    if (item === undefined || !view.options.preview) return;
    const abort = new (view.options.owner as Window & typeof globalThis).AbortController();
    view.previewAbort = abort;
    this.#update(view, { previewText: view.options.loading });
    try {
      const result = await view.options.preview(item, abort.signal);
      if (!this.#current(view) || revision !== view.previewRevision || abort.signal.aborted) return;
      this.#update(view, {
        previewText: result.text ?? '',
        previewImages: (result.images ?? []).map(({ dataURL, alt }) => ({ dataURL, alt })),
      });
    } catch (error) {
      if (this.#current(view) && revision === view.previewRevision && !abort.signal.aborted) {
        this.#update(view, { previewText: view.options.unavailable });
        view.options.debug(error);
      }
    }
  }
  async #confirm(view: SearchView<T>, run = view.options.confirm): Promise<void> {
    const item = view.filtered[view.selected];
    if (!this.#current(view) || view.pending || item === undefined) return;
    view.pending = true;
    this.#update(view, {
      pending: true,
      actions: view.model.actions.map((action) => ({ ...action, disabled: true })),
    });
    try {
      const result = await run(item);
      if (!this.#current(view)) return;
      if (typeof result === 'object') this.#update(view, { status: result.status });
      else if (result) this.close(true);
      else this.#update(view, { status: view.options.unavailable });
    } catch (error) {
      if (this.#current(view)) {
        this.#update(view, { status: view.options.unavailable });
        view.options.debug(error);
      }
    } finally {
      if (this.#current(view)) {
        view.pending = false;
        this.#update(view, {
          pending: false,
          actions: (view.options.actions ?? []).map((action) => ({
            label: action.label,
            disabled: action.available?.(item) === false,
          })),
        });
      }
    }
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (!this.#current(view) || compositionOwnsKey(event, view.composition.active)) return true;
    const key = keyString(event);
    const input = view.react.getElement('input');
    const scopes = view.react.getElement('scopes');
    const results = view.react.getElement('results');
    const preview = view.react.getElement('preview');
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (
      event.target !== scopes &&
      ['arrowdown', 'arrowup', 'ctrl+n', 'ctrl+p'].includes(key)
    ) {
      event.preventDefault();
      this.#select(view, view.selected + (key === 'arrowdown' || key === 'ctrl+n' ? 1 : -1));
    } else if (
      key === 'enter' &&
      (event.target === input ||
        event.target === results ||
        preview?.contains(event.target as Node))
    ) {
      event.preventDefault();
      if (!event.repeat) void this.#confirm(view);
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = Array.from(
        view.root.querySelectorAll<HTMLElement>('input,select,button,[tabindex="0"]'),
        (node) => node as HTMLElement,
      ).filter((n) => !n.hidden && !(n as HTMLInputElement).disabled);
      if (key === 'tab' && event.target === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      } else if (key === 'shift+tab' && event.target === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
    }
    return true;
  }
  close(restore = false): void {
    const view = this.#view;
    if (!view) return;
    this.#view = null;
    const focus =
      restore &&
      view.options.current() &&
      !isDeadObject(view.options.owner) &&
      view.options.owner.document === view.document;
    try {
      view.dispose();
    } finally {
      view.options.onClose?.();
    }
    if (focus) view.options.restoreFocus();
  }
}
