import { CleanupFailure } from '../../core/cleanup';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import { keyString } from '../../input/keys';
import { mountNativeReactView } from '../../platform/native-ui';
import { FIGURES_BACKDROP_STYLE } from '../../ui/react/shells/reader';
import type { NativeReactView } from '../../ui/react/types';
import { readerWindow, type ReaderRegionPreview } from '../../toolkit/reader';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import type { ReaderCaptionTarget, ReaderCaptionSource } from '../reader-navigation';
import { filterFigureTargets } from './figure-search';
import type { ReaderFiguresReactCommand, ReaderFiguresReactModel } from './react-model';

const H = 'http://www.w3.org/1999/xhtml';
export interface ReaderFigurePickerHost {
  readonly reader: ReaderRuntime;
  readonly captions: ReaderCaptionSource;
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
  readonly composition: { active: boolean };
  readonly createAbort: () => AbortController;
  readonly untheme: () => void;
  react?: NativeReactView<ReaderFiguresReactModel>;
  unbind?: () => void;
  input?: HTMLInputElement;
  groups: readonly ReaderCaptionTarget[];
  bodies: readonly ReaderCaptionTarget[];
  filtered: readonly ReaderCaptionTarget[];
  model: ReaderFiguresReactModel;
  revision: number;
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
    const originalFocus = window.document.activeElement as HTMLElement | null;
    const backdrop = doc.createElementNS(H, 'div') as HTMLElement;
    backdrop.style.cssText = FIGURES_BACKDROP_STYLE;
    const root = doc.createElementNS(H, 'div') as HTMLElement;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const keys = [
      'title',
      'search',
      'kind',
      'part',
      'all',
      'figure',
      'table',
      'groups',
      'bodies',
      'close',
      'help',
      'loading',
      'list',
      'empty',
      'zoomOut',
      'zoomIn',
      'zoomReset',
      'jump',
      'preview',
      'results',
      'limited',
      'unavailable',
      'rendering',
      'previewUnavailable',
      'cache',
      'native',
      'page',
      'caption-only',
      'ambiguous',
    ];
    const text: Record<string, string> = {};
    for (const key of keys) text[key] = this.#host.text(key);
    const view: FigureView = {
      window,
      current,
      originalFocus,
      root,
      backdrop,
      composition: { active: false },
      createAbort: () => new (outer as Window & typeof globalThis).AbortController(),
      untheme: this.#host.themeRoot(backdrop),
      groups: [],
      bodies: [],
      filtered: [],
      revision: 0,
      model: {
        text,
        kind: 'all',
        part: 'groups',
        rows: [],
        selected: 0,
        status: text.loading!,
        previewText: '',
        image: null,
        zoom: 1,
        pending: false,
      },
    };
    this.#view = view;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) this.close(true);
    });
    root.addEventListener('keydown', (event) => this.handleKey(event));
    view.react = mountNativeReactView<ReaderFiguresReactModel, ReaderFiguresReactCommand>({
      surface: 'reader-figures',
      root,
      model: view.model,
      dispatch: (command) => this.#command(view, command),
      isCurrent: () => this.#current(view),
      loadingText: text.loading!,
      errorText: text.unavailable!,
      onError: (error) => this.#host.debug(`Reader figure view failed: ${String(error)}`),
    });
    void view.react.ready
      .then(() => {
        if (!this.#current(view)) return;
        const input = view.react?.getElement('query') as HTMLInputElement | null;
        if (!input) throw new Error('Reader figure view is missing its search input');
        view.input = input;
        view.unbind = bindCompositionState(input, view.composition);
        input.addEventListener('input', (event) => {
          if (isCommittedInput(event, view.composition.active)) this.#filter(view);
        });
        input.focus();
        void this.#load(view);
      })
      .catch((error: unknown) => {
        if (this.#current(view)) this.#host.debug(`Reader figure view failed: ${String(error)}`);
      });
  }

  #update(view: FigureView, change: Partial<ReaderFiguresReactModel>): void {
    view.model = { ...view.model, ...change };
    view.react?.update(view.model);
  }

  #command(view: FigureView, command: ReaderFiguresReactCommand): void {
    if (!this.#current(view)) return;
    switch (command.type) {
      case 'close':
        this.close(true);
        break;
      case 'confirm':
        void this.#confirm(view);
        break;
      case 'kind':
      case 'part':
        if (!view.model.pending) {
          this.#update(view, { [command.type]: command.value });
          this.#filter(view);
        }
        break;
      case 'select':
        this.#select(view, command.index);
        break;
      case 'zoom':
        this.#zoom(view, command.direction);
        break;
    }
  }

  async #load(view: FigureView): Promise<void> {
    try {
      const groups = await this.#host.captions.load();
      if (!this.#current(view)) return;
      view.groups = groups;
      view.bodies = this.#host.captions.bodies;
      if (!groups.length && view.bodies.length) this.#update(view, { part: 'bodies' });
      this.#filter(view);
    } catch (error) {
      if (this.#current(view)) {
        this.#update(view, { status: view.model.text.unavailable });
        this.#host.debug(`Reader figure targets failed: ${String(error)}`);
      }
    }
  }

  #filter(view: FigureView): void {
    if (!this.#current(view)) return;
    const targets = view.model.part === 'bodies' ? view.bodies : view.groups;
    view.filtered = filterFigureTargets(
      targets.filter((t) => view.model.kind === 'all' || t.kind === view.model.kind),
      view.input?.value ?? '',
    );
    const t = view.model.text;
    const rows = view.filtered.slice(0, 200).map((target) => {
      const source = t[target.source === 'cache' ? 'cache' : 'native'];
      const part = t[target.part === 'body' ? 'bodies' : 'groups'];
      const association =
        target.association === 'caption-only' || target.association === 'ambiguous'
          ? ` · ${t[target.association]}`
          : '';
      return `${t[target.kind]}${target.label ? ` ${target.label}` : ''} · ${t.page} ${target.location.position.pageIndex + 1} · ${source} · ${part}${association}\n${target.title}`;
    });
    this.#update(view, {
      rows,
      status:
        `${view.filtered.length} ${t.results}` +
        (view.filtered.length > 200 ? ` · ${t.limited}` : ''),
    });
    this.#select(view, 0);
  }

  #select(view: FigureView, index: number): void {
    if (!this.#current(view) || view.model.pending) return;
    const selected = Math.max(0, Math.min(index, Math.min(200, view.filtered.length) - 1));
    this.#update(view, { selected, zoom: 1 });
    view.react
      ?.getElement('list')
      ?.querySelector<HTMLElement>(`#zv-figure-choice-${selected}`)
      ?.scrollIntoView({ block: 'nearest' });
    void this.#preview(view, view.filtered[selected]);
  }

  async #preview(view: FigureView, target: ReaderCaptionTarget | undefined): Promise<void> {
    view.renderAbort?.abort();
    const revision = ++view.revision;
    this.#update(view, { image: null, previewText: target ? view.model.text.rendering : '' });
    if (!target) return;
    const abort = view.createAbort();
    view.renderAbort = abort;
    try {
      if (!(await this.#host.captions.sourceCurrent(target))) throw new Error('Analysis changed');
      if (!this.#current(view) || revision !== view.revision) return;
      const result = await this.#host.render(target, abort.signal);
      if (!this.#current(view) || revision !== view.revision || abort.signal.aborted) return;
      if (!(await this.#host.captions.sourceCurrent(target))) throw new Error('Analysis changed');
      if (!this.#current(view) || revision !== view.revision || abort.signal.aborted) return;
      this.#update(view, { image: { src: result.dataURL, alt: target.title }, previewText: '' });
    } catch (error) {
      if (this.#current(view) && revision === view.revision && !abort.signal.aborted) {
        this.#update(view, { previewText: view.model.text.previewUnavailable });
        this.#host.debug(`Reader figure preview failed: ${String(error)}`);
      }
    }
  }

  #zoom(view: FigureView, direction: -1 | 0 | 1): void {
    if (!this.#current(view)) return;
    const zoom =
      direction === 0
        ? 1
        : Math.max(0.5, Math.min(4, view.model.zoom * (direction > 0 ? 1.25 : 0.8)));
    this.#update(view, { zoom });
  }

  async #confirm(view: FigureView): Promise<void> {
    if (!this.#current(view) || view.model.pending) return;
    const target = view.filtered[view.model.selected];
    if (!target) return;
    this.#update(view, { pending: true });
    try {
      if (!(await this.#host.captions.sourceCurrent(target))) {
        if (this.#current(view)) this.#update(view, { status: view.model.text.unavailable });
        return;
      }
      if (!this.#current(view)) return;
      if (await this.#host.navigate(target, view.window)) {
        if (this.#current(view)) this.close(true);
      } else if (this.#current(view)) this.#update(view, { status: view.model.text.unavailable });
    } catch (error) {
      if (this.#current(view)) {
        this.#update(view, { status: view.model.text.unavailable });
        this.#host.debug(`Reader figure navigation failed: ${String(error)}`);
      }
    } finally {
      if (this.#current(view)) this.#update(view, { pending: false });
    }
  }

  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (!this.#current(view) || compositionOwnsKey(event, view.composition.active)) return true;
    const key = keyString(event),
      select = (event.target as Element).tagName?.toLowerCase() === 'select';
    const list = view.react?.getElement('list'),
      preview = view.react?.getElement('preview');
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (
      !select &&
      (key === 'arrowdown' || key === 'ctrl+n' || key === 'arrowup' || key === 'ctrl+p')
    ) {
      event.preventDefault();
      this.#select(view, view.model.selected + (key === 'arrowdown' || key === 'ctrl+n' ? 1 : -1));
    } else if (
      key === 'enter' &&
      (event.target === view.input ||
        event.target === list ||
        preview?.contains(event.target as Node))
    ) {
      event.preventDefault();
      if (!event.repeat) void this.#confirm(view);
    } else if (preview?.contains(event.target as Node) && ['+', '=', '-', '0'].includes(key)) {
      event.preventDefault();
      this.#zoom(view, key === '0' ? 0 : key === '-' ? -1 : 1);
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = Array.from(
        view.root.querySelectorAll<HTMLElement>(
          'input,select,button,[tabindex="0"]',
        ) as unknown as ArrayLike<HTMLElement>,
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
    cleanup.run(() => view.unbind?.());
    cleanup.run(() => view.react?.dispose());
    cleanup.run(view.untheme);
    cleanup.run(() => view.backdrop.remove());
    cleanup.rethrow();
    if (restore) {
      view.window.focus();
      if (view.originalFocus?.isConnected) view.originalFocus.focus();
    }
  }
}
