import { CleanupFailure } from '../core/cleanup';
import { bindCompositionState, compositionOwnsKey, isCommittedInput } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { THEME_VARS } from './theme';

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
  readonly confirm: (item: T) => Promise<boolean>;
  readonly debug: (error: unknown) => void;
  readonly onClose?: () => void;
}
interface SearchView<T> {
  readonly options: SearchDialogOptions<T>;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly input: HTMLInputElement;
  readonly scopes: HTMLSelectElement;
  readonly results: HTMLElement;
  readonly status: HTMLElement;
  readonly composition: { active: boolean };
  readonly dispose: () => void;
  items: readonly T[];
  filtered: readonly T[];
  selected: number;
  pending: boolean;
}

/** Small shared query/list surface. Callers own scope, matching, source validation and all mutations. */
export class SearchDialog<T> {
  #view: SearchView<T> | null = null;
  #current(view: SearchView<T>): boolean {
    if (this.#view !== view) return false;
    if (view.options.current() && !isDeadObject(view.root) && view.root.isConnected) return true;
    this.close();
    return false;
  }

  open(options: SearchDialogOptions<T>): void {
    this.close();
    if (!options.current()) return;
    const document = options.owner.document;
    const node = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      text = '',
    ): HTMLElementTagNameMap[K] => {
      const element = document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        tag,
      ) as HTMLElementTagNameMap[K];
      element.textContent = text;
      return element;
    };
    const root = node('section');
    const backdrop = node('div');
    backdrop.style.cssText = `position:fixed;inset:0;z-index:2147483645;background:${THEME_VARS.backdrop}`;
    root.dataset.zvSearchDialog = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', options.title);
    root.style.cssText = `position:absolute;inset:8%;display:flex;flex-direction:column;gap:10px;padding:18px;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 40px #0006;font:menu`;
    const title = node('h2', options.title);
    title.style.margin = '0';
    const controls = node('div');
    controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const scopes = node('select');
    scopes.setAttribute('aria-label', options.title);
    scopes.hidden = true;
    const input = node('input');
    input.type = 'search';
    input.placeholder = options.placeholder;
    input.setAttribute('aria-label', options.placeholder);
    input.style.cssText = 'flex:1;min-width:160px';
    const close = node('button', options.close);
    close.type = 'button';
    controls.append(scopes, input, close);
    const help = node('p', options.help);
    help.style.margin = '0';
    const status = node('p', options.loading);
    status.setAttribute('role', 'status');
    status.style.margin = '0';
    const results = node('div');
    results.setAttribute('role', 'listbox');
    results.tabIndex = 0;
    results.style.cssText = 'flex:1;overflow:auto;min-height:80px';
    root.append(title, controls, help, status, results);
    const composition = { active: false },
      unbind = bindCompositionState(input, composition),
      untheme = options.themeRoot(backdrop);
    const view: SearchView<T> = {
      options,
      root,
      backdrop,
      input,
      scopes,
      results,
      status,
      composition,
      items: [],
      filtered: [],
      selected: 0,
      pending: false,
      dispose: () => {
        const cleanup = new CleanupFailure();
        cleanup.run(unbind);
        cleanup.run(untheme);
        if (!isDeadObject(backdrop)) cleanup.run(() => backdrop.remove());
        cleanup.rethrow();
      },
    };
    this.#view = view;
    backdrop.append(root);
    document.documentElement.append(backdrop);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) this.close(true);
    });
    close.addEventListener('click', () => this.close(true));
    input.addEventListener('input', (event) => {
      if (isCommittedInput(event, composition.active)) this.#filter(view);
    });
    scopes.addEventListener('change', () => this.#filter(view));
    root.addEventListener('keydown', (event) => this.handleKey(event));
    input.focus();
    void options
      .load()
      .then((source) => {
        if (!this.#current(view)) return;
        view.items = source.items;
        for (const scope of source.scopes ?? []) {
          const option = node('option', scope.title);
          option.value = scope.id;
          scopes.append(option);
        }
        scopes.hidden = !source.scopes?.length;
        if (source.initialScope) scopes.value = source.initialScope;
        this.#filter(view);
      })
      .catch((error: unknown) => {
        if (this.#current(view)) {
          status.textContent = options.unavailable;
          options.debug(error);
        }
      });
  }

  #filter(view: SearchView<T>): void {
    if (!this.#current(view) || view.pending) return;
    view.filtered = view.options
      .filter(view.items, view.input.value, view.scopes.value)
      .slice(0, 100);
    view.status.textContent =
      String(view.filtered.length) + (view.filtered.length === 100 ? '+' : '');
    this.#select(view, 0);
  }
  #select(view: SearchView<T>, index: number): void {
    if (!this.#current(view) || view.pending) return;
    view.selected = Math.max(0, Math.min(index, view.filtered.length - 1));
    view.results.replaceChildren();
    view.filtered.forEach((item, i) => {
      const row = view.root.ownerDocument.createElementNS(
        'http://www.w3.org/1999/xhtml',
        'div',
      ) as HTMLElement;
      row.id = `zv-search-result-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === view.selected));
      row.style.cssText = `padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;cursor:pointer;border-bottom:1px solid ${THEME_VARS.border};background:${i === view.selected ? THEME_VARS.selected : 'transparent'}`;
      row.textContent = view.options.label(item);
      row.addEventListener('click', () => {
        if (view.selected === i) void this.#confirm(view);
        else this.#select(view, i);
      });
      view.results.append(row);
      if (i === view.selected) {
        view.results.setAttribute('aria-activedescendant', row.id);
        row.scrollIntoView({ block: 'nearest' });
      }
    });
    if (!view.filtered.length) {
      view.results.removeAttribute('aria-activedescendant');
      view.results.textContent = view.options.empty;
    }
  }
  async #confirm(view: SearchView<T>): Promise<void> {
    const item = view.filtered[view.selected];
    if (!this.#current(view) || view.pending || item === undefined) return;
    view.pending = true;
    view.input.disabled = view.scopes.disabled = true;
    try {
      if (await view.options.confirm(item)) {
        if (this.#current(view)) this.close(true);
      } else if (this.#current(view)) view.status.textContent = view.options.unavailable;
    } catch (error) {
      if (this.#current(view)) {
        view.status.textContent = view.options.unavailable;
        view.options.debug(error);
      }
    } finally {
      if (this.#current(view)) {
        view.pending = false;
        view.input.disabled = view.scopes.disabled = false;
      }
    }
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (!this.#current(view) || compositionOwnsKey(event, view.composition.active)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (
      event.target !== view.scopes &&
      ['arrowdown', 'arrowup', 'ctrl+n', 'ctrl+p'].includes(key)
    ) {
      event.preventDefault();
      this.#select(view, view.selected + (key === 'arrowdown' || key === 'ctrl+n' ? 1 : -1));
    } else if (key === 'enter' && (event.target === view.input || event.target === view.results)) {
      event.preventDefault();
      if (!event.repeat) void this.#confirm(view);
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,button,[tabindex="0"]'),
        ) as HTMLElement[]
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
    const focus = restore && view.options.current();
    try {
      view.dispose();
    } finally {
      view.options.onClose?.();
    }
    if (focus) view.options.restoreFocus();
  }
}
