import { CleanupFailure } from '../../core/cleanup';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import { keyString } from '../../input/keys';
import { THEME_VARS } from '../../ui/theme';
import { readerWindow, type ReaderRegionPreview } from '../../toolkit/reader';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import type { ReaderCaptionTarget, ReaderCaptionTargets } from './caption-targets';
import { filterFigureTargets } from './figure-search';

const H = 'http://www.w3.org/1999/xhtml';
export interface ReaderFigurePickerHost {
  readonly reader: ReaderRuntime;
  readonly captions: ReaderCaptionTargets;
  readonly text: (key: string) => string;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly isCurrent: () => boolean;
  readonly render: (
    target: ReaderCaptionTarget,
    signal: AbortSignal,
  ) => Promise<ReaderRegionPreview>;
  readonly navigate: (target: ReaderCaptionTarget, window: PdfWindow) => Promise<boolean>;
  readonly debug: (message: string) => void;
}
interface FigureView {
  readonly window: PdfWindow;
  readonly current: () => boolean;
  readonly originalFocus: HTMLElement | null;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly input: HTMLInputElement;
  readonly kind: HTMLSelectElement;
  readonly part: HTMLSelectElement;
  readonly list: HTMLElement;
  readonly preview: HTMLElement;
  readonly status: HTMLElement;
  readonly jump: HTMLButtonElement;
  readonly clean: () => void;
  readonly composition: { active: boolean };
  readonly createAbort: () => AbortController;
  groups: readonly ReaderCaptionTarget[];
  bodies: readonly ReaderCaptionTarget[];
  filtered: readonly ReaderCaptionTarget[];
  selected: number;
  revision: number;
  zoom: number;
  pending: boolean;
  renderAbort?: AbortController;
}

/** Reader-owned chooser: browsing only renders detached crops; confirmation alone navigates. */
export class ReaderFigurePicker {
  readonly #host: ReaderFigurePickerHost;
  #view: FigureView | null = null;
  constructor(host: ReaderFigurePickerHost) {
    this.#host = host;
  }

  #current(view: FigureView): boolean {
    if (this.#view !== view) return false;
    if (this.#host.isCurrent() && view.current() && view.root.isConnected) return true;
    this.close(false);
    return false;
  }

  open(window: PdfWindow): void {
    this.close(false);
    const outer = readerWindow(this.#host.reader),
      current = this.#host.captureView(window);
    if (!outer || !current() || !this.#host.isCurrent()) return;
    const doc = outer.document;
    const node = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      text = '',
    ): HTMLElementTagNameMap[K] => {
      const element = doc.createElementNS(H, tag) as HTMLElementTagNameMap[K];
      element.textContent = text;
      return element;
    };
    const button = (text: string): HTMLButtonElement => {
      const b = node('button', text);
      b.type = 'button';
      return b;
    };
    const backdrop = node('div');
    backdrop.style.cssText = `position:fixed;inset:0;z-index:2147483645;background:${THEME_VARS.backdrop}`;
    const root = node('section');
    root.dataset.zvFigurePicker = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', this.#host.text('title'));
    root.style.cssText = `position:fixed;inset:4%;z-index:2147483645;padding:16px;display:flex;flex-direction:column;gap:10px;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 40px #0006;font:menu`;
    const heading = node('h2', this.#host.text('title'));
    heading.style.margin = '0';
    const controls = node('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    const input = node('input');
    input.type = 'search';
    input.placeholder = this.#host.text('search');
    input.setAttribute('aria-label', input.placeholder);
    input.style.cssText = 'flex:1;min-width:160px';
    const select = (label: string, values: readonly string[]): HTMLSelectElement => {
      const s = node('select');
      s.setAttribute('aria-label', this.#host.text(label));
      for (const value of values) {
        const option = node('option', this.#host.text(value));
        option.value = value;
        s.append(option);
      }
      s.value = values[0];
      return s;
    };
    const kind = select('kind', ['all', 'figure', 'table']),
      part = select('part', ['groups', 'bodies']);
    const close = button(this.#host.text('close'));
    controls.append(input, kind, part, close);
    const help = node('p', this.#host.text('help'));
    help.style.cssText = `margin:0;color:${THEME_VARS.muted}`;
    const status = node('p', this.#host.text('loading'));
    status.setAttribute('role', 'status');
    status.style.margin = '0';
    const content = node('div');
    content.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;flex:1;min-height:0';
    const list = node('div');
    list.tabIndex = 0;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', this.#host.text('list'));
    list.style.cssText = `flex:1 1 260px;min-height:120px;overflow:auto;border:1px solid ${THEME_VARS.border}`;
    const right = node('section');
    right.style.cssText =
      'flex:2 1 360px;display:flex;flex-direction:column;min-width:0;min-height:160px';
    const tools = node('div');
    tools.style.cssText = 'display:flex;gap:8px';
    const minus = button('−'),
      plus = button('+'),
      reset = button('100%'),
      jump = button(this.#host.text('jump'));
    minus.setAttribute('aria-label', this.#host.text('zoomOut'));
    plus.setAttribute('aria-label', this.#host.text('zoomIn'));
    reset.setAttribute('aria-label', this.#host.text('zoomReset'));
    jump.disabled = true;
    tools.append(minus, plus, reset, jump);
    const preview = node('div');
    preview.tabIndex = 0;
    preview.setAttribute('aria-label', this.#host.text('preview'));
    preview.style.cssText = `flex:1;min-height:120px;overflow:auto;background:${THEME_VARS.elevated};margin-top:8px`;
    right.append(tools, preview);
    content.append(list, right);
    root.append(heading, controls, help, status, content);
    const composition = { active: false },
      unbind = bindCompositionState(input, composition),
      untheme = this.#host.themeRoot(backdrop);
    const view: FigureView = {
      window,
      current,
      originalFocus: window.document.activeElement as HTMLElement | null,
      root,
      backdrop,
      input,
      kind,
      part,
      list,
      preview,
      status,
      jump,
      composition,
      clean: () => {
        const failure = new CleanupFailure();
        failure.run(unbind);
        failure.run(untheme);
        failure.rethrow();
      },
      createAbort: () => new (outer as Window & typeof globalThis).AbortController(),
      groups: [],
      bodies: [],
      filtered: [],
      selected: 0,
      revision: 0,
      zoom: 1,
      pending: false,
    };
    this.#view = view;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) this.close(true);
    });
    close.addEventListener('click', () => this.close(true));
    input.addEventListener('input', (event) => {
      if (isCommittedInput(event, composition.active)) this.#filter(view);
    });
    kind.addEventListener('change', () => this.#filter(view));
    part.addEventListener('change', () => this.#filter(view));
    list.addEventListener('click', (event) => {
      const row = (event.target as Element).closest('[data-zv-figure-row]') as HTMLElement | null;
      if (row) this.#select(view, Number(row.dataset.zvFigureRow));
    });
    minus.addEventListener('click', () => this.#zoom(view, -1));
    plus.addEventListener('click', () => this.#zoom(view, 1));
    reset.addEventListener('click', () => this.#zoom(view, 0));
    jump.addEventListener('click', () => {
      void this.#confirm(view);
    });
    root.addEventListener('keydown', (event) => this.handleKey(event));
    input.focus();
    void this.#load(view);
  }

  async #load(view: FigureView): Promise<void> {
    try {
      const groups = await this.#host.captions.load();
      if (!this.#current(view)) return;
      view.groups = groups;
      view.bodies = this.#host.captions.bodies;
      if (!groups.length && view.bodies.length) view.part.value = 'bodies';
      this.#filter(view);
    } catch (error) {
      if (this.#current(view)) {
        view.status.textContent = this.#host.text('unavailable');
        this.#host.debug(`Reader figure targets failed: ${String(error)}`);
      }
    }
  }

  #filter(view: FigureView): void {
    if (!this.#current(view)) return;
    const targets = view.part.value === 'bodies' ? view.bodies : view.groups;
    view.filtered = filterFigureTargets(
      targets.filter((t) => view.kind.value === 'all' || t.kind === view.kind.value),
      view.input.value,
    );
    view.status.textContent =
      `${view.filtered.length} ${this.#host.text('results')}` +
      (view.filtered.length > 200 ? ` · ${this.#host.text('limited')}` : '');
    this.#select(view, 0);
  }

  #select(view: FigureView, index: number): void {
    if (!this.#current(view) || view.pending) return;
    view.selected = Math.max(0, Math.min(index, Math.min(200, view.filtered.length) - 1));
    view.list.replaceChildren();
    view.filtered.slice(0, 200).forEach((target, i) => {
      const row = view.list.ownerDocument.createElementNS(H, 'div') as HTMLElement;
      row.id = `zv-figure-choice-${i}`;
      row.dataset.zvFigureRow = String(i);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === view.selected));
      row.style.cssText = `padding:8px;cursor:pointer;white-space:pre-wrap;overflow-wrap:anywhere;border-bottom:1px solid ${THEME_VARS.border};background:${i === view.selected ? THEME_VARS.selected : 'transparent'}`;
      const source = this.#host.text(target.source === 'cache' ? 'cache' : 'native');
      const part = this.#host.text(target.part === 'body' ? 'bodies' : 'groups');
      const association =
        target.association === 'caption-only' || target.association === 'ambiguous'
          ? ` · ${this.#host.text(target.association)}`
          : '';
      row.textContent = `${this.#host.text(target.kind)}${target.label ? ` ${target.label}` : ''} · ${this.#host.text('page')} ${target.location.position.pageIndex + 1} · ${source} · ${part}${association}\n${target.title}`;
      view.list.append(row);
      if (i === view.selected) {
        view.list.setAttribute('aria-activedescendant', row.id);
        row.scrollIntoView({ block: 'nearest' });
      }
    });
    if (!view.filtered.length) {
      view.list.removeAttribute('aria-activedescendant');
      view.list.textContent = this.#host.text('empty');
    }
    const selected = view.filtered[view.selected];
    view.jump.disabled = !selected;
    view.zoom = 1;
    void this.#preview(view, selected);
  }

  async #preview(view: FigureView, target: ReaderCaptionTarget | undefined): Promise<void> {
    view.renderAbort?.abort();
    const revision = ++view.revision;
    view.preview.replaceChildren();
    if (!target) return;
    const abort = view.createAbort();
    view.renderAbort = abort;
    view.preview.textContent = this.#host.text('rendering');
    try {
      if (!(await this.#host.captions.sourceCurrent(target))) throw new Error('Analysis changed');
      if (!this.#current(view) || revision !== view.revision) return;
      const result = await this.#host.render(target, abort.signal);
      if (!this.#current(view) || revision !== view.revision || abort.signal.aborted) return;
      if (!(await this.#host.captions.sourceCurrent(target))) throw new Error('Analysis changed');
      if (!this.#current(view) || revision !== view.revision) return;
      const image = view.preview.ownerDocument.createElementNS(H, 'img') as HTMLImageElement;
      image.src = result.dataURL;
      image.alt = target.title;
      image.style.cssText = 'display:block;width:100%;height:auto;max-width:none';
      view.preview.replaceChildren(image);
    } catch (error) {
      if (this.#current(view) && revision === view.revision && !abort.signal.aborted) {
        view.preview.textContent = this.#host.text('previewUnavailable');
        this.#host.debug(`Reader figure preview failed: ${String(error)}`);
      }
    }
  }

  #zoom(view: FigureView, direction: -1 | 0 | 1): void {
    if (!this.#current(view)) return;
    view.zoom =
      direction === 0 ? 1 : Math.max(0.5, Math.min(4, view.zoom * (direction > 0 ? 1.25 : 0.8)));
    const image = view.preview.querySelector('img');
    if (image) image.style.width = `${view.zoom * 100}%`;
  }

  async #confirm(view: FigureView): Promise<void> {
    if (!this.#current(view) || view.pending) return;
    const target = view.filtered[view.selected];
    if (!target) return;
    view.pending = true;
    view.jump.disabled = true;
    view.input.disabled = view.kind.disabled = view.part.disabled = true;
    try {
      if (!(await this.#host.captions.sourceCurrent(target))) {
        if (this.#current(view)) view.status.textContent = this.#host.text('unavailable');
        return;
      }
      if (!this.#current(view)) return;
      if (await this.#host.navigate(target, view.window)) {
        if (this.#current(view)) this.close(true);
      } else if (this.#current(view)) view.status.textContent = this.#host.text('unavailable');
    } catch (error) {
      if (this.#current(view)) {
        view.status.textContent = this.#host.text('unavailable');
        this.#host.debug(`Reader figure navigation failed: ${String(error)}`);
      }
    } finally {
      if (this.#current(view)) {
        view.pending = false;
        view.jump.disabled = false;
        view.input.disabled = view.kind.disabled = view.part.disabled = false;
      }
    }
  }

  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (!this.#current(view) || compositionOwnsKey(event, view.composition.active)) return true;
    const key = keyString(event),
      select = (event.target as Element).tagName?.toLowerCase() === 'select';
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (
      !select &&
      (key === 'arrowdown' || key === 'ctrl+n' || key === 'arrowup' || key === 'ctrl+p')
    ) {
      event.preventDefault();
      this.#select(view, view.selected + (key === 'arrowdown' || key === 'ctrl+n' ? 1 : -1));
    } else if (
      key === 'enter' &&
      (event.target === view.input ||
        event.target === view.list ||
        view.preview.contains(event.target as Node))
    ) {
      event.preventDefault();
      if (!event.repeat) void this.#confirm(view);
    } else if (view.preview.contains(event.target as Node) && ['+', '=', '-', '0'].includes(key)) {
      event.preventDefault();
      this.#zoom(view, key === '0' ? 0 : key === '-' ? -1 : 1);
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,button,[tabindex="0"]'),
        ) as HTMLElement[]
      ).filter((n) => !(n as HTMLButtonElement).disabled && n.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (key === 'shift+tab' && event.target === first) {
        event.preventDefault();
        last?.focus();
      } else if (key === 'tab' && event.target === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    return true;
  }

  releaseView(window: PdfWindow): void {
    if (this.#view?.window === window) this.close(false);
  }
  close(focus = false): void {
    const view = this.#view;
    if (!view) return;
    const restore = focus && this.#host.isCurrent() && view.current();
    this.#view = null;
    const cleanup = new CleanupFailure();
    cleanup.run(() => view.renderAbort?.abort());
    cleanup.run(view.clean);
    cleanup.run(() => view.backdrop.remove());
    cleanup.rethrow();
    if (restore) {
      view.window.focus();
      if (view.originalFocus?.isConnected) view.originalFocus.focus();
    }
  }
}
