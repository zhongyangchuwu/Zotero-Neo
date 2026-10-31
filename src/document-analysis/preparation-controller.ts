import { mineruCredentialField, type MinerUCredentialField } from '../ui/mineru-credentials';
import { CleanupFailure } from '../core/cleanup';
import { isDeadObject } from '../platform/cross-compartment';
import { asElement } from '../platform/dom';
import { t } from '../i18n';
import { bindCompositionState, compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { THEME_VARS } from '../ui/theme';
import {
  documentPreparationAbort,
  documentPreparationHost,
} from '../platform/document-preparation';
import {
  DocumentPreparationQueue,
  MAX_PREPARATION_FILES,
  type DocumentAttachment,
} from './preparation';

export interface PreparationPresentation {
  readonly window: Window;
  readonly targets: readonly DocumentAttachment[];
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly isCurrent: () => boolean;
}
export interface DocumentPreparationPort {
  open(presentation: PreparationPresentation): void;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
interface View {
  readonly host: PreparationPresentation;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly input: HTMLInputElement;
  readonly credentials: MinerUCredentialField;
  readonly results: HTMLElement;
  readonly status: HTMLElement;
  readonly start: HTMLButtonElement;
  readonly retry: HTMLButtonElement;
  readonly stop: HTMLButtonElement;
  readonly close: HTMLButtonElement;
  readonly composition: { active: boolean };
  readonly focus: HTMLElement | null;
  clean(): void;
  pending: boolean;
}

/** One application queue and one replaceable presentation; closing the presentation never cancels admitted work. */
export class DocumentPreparationController implements DocumentPreparationPort {
  readonly queue: DocumentPreparationQueue;
  readonly #debug: (message: string) => void;
  #view: View | null = null;
  constructor(debug: (message: string) => void) {
    this.#debug = debug;
    this.queue = new DocumentPreparationQueue(documentPreparationHost(debug));
  }
  #text(view: View, key: string): string {
    return t(`documentPreparation.${key}`, view.host.language());
  }
  #current(view: View): boolean {
    if (this.#view !== view) return false;
    if (!isDeadObject(view.root) && view.host.isCurrent() && view.root.isConnected) return true;
    this.close(false);
    return false;
  }
  open(host: PreparationPresentation): void {
    this.close(false);
    if (!host.isCurrent()) return;
    const doc = host.window.document,
      H = 'http://www.w3.org/1999/xhtml';
    const text = (key: string): string => t(`documentPreparation.${key}`, host.language());
    const node = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      value = '',
    ): HTMLElementTagNameMap[K] => {
      const e = doc.createElementNS(H, tag) as HTMLElementTagNameMap[K];
      e.textContent = value;
      return e;
    };
    const button = (label: string): HTMLButtonElement => {
      const b = node('button', text(label));
      b.type = 'button';
      b.style.cssText = `padding:6px 10px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:4px;font:inherit`;
      return b;
    };
    const backdrop = node('div');
    backdrop.style.cssText = `position:fixed;inset:0;z-index:2147483646;background:${THEME_VARS.backdrop};display:flex;align-items:center;justify-content:center`;
    const root = node('section');
    root.dataset.zvDocumentPreparation = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', text('title'));
    root.style.cssText = `display:flex;flex-direction:column;gap:10px;padding:18px;width:min(880px,90vw);max-height:90vh;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;font:menu`;
    const heading = node('h2', text('title'));
    heading.style.margin = '0';
    const help = node('p', text('help'));
    help.style.cssText = `margin:0;color:${THEME_VARS.muted};white-space:pre-wrap`;
    const draft = node('details'),
      summary = node('summary', `${text('selection')} ${host.targets.length}`),
      names = node('ul');
    for (const target of host.targets.slice(0, MAX_PREPARATION_FILES + 1))
      names.append(node('li', target.title));
    draft.append(summary, names);
    const credentials = mineruCredentialField(doc, host.language),
      input = credentials.input;
    const actions = node('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    const start = button('start'),
      retry = button('retry'),
      stop = button('stop'),
      close = button('close');
    actions.append(start, retry, stop, close);
    const status = node('p', text('loading'));
    status.setAttribute('role', 'status');
    status.style.margin = '0';
    const results = node('ol');
    results.style.cssText = 'margin:0;padding-inline-start:26px;overflow:auto;min-height:100px';
    root.append(heading, help, draft, credentials.root, actions, status, results);
    backdrop.append(root);
    const composition = { active: false },
      unbind = bindCompositionState(input, composition),
      untheme = host.themeRoot(backdrop);
    const unload = (): void => this.closeOwner(host.window);
    const unsubscribe = this.queue.subscribe(() => this.#render(view));
    const view: View = {
      host,
      root,
      backdrop,
      input,
      credentials,
      results,
      status,
      start,
      retry,
      stop,
      close,
      composition,
      focus: doc.activeElement as HTMLElement | null,
      pending: true,
      clean: () => {
        const failure = new CleanupFailure();
        failure.run(unsubscribe);
        if (!isDeadObject(root)) {
          failure.run(() => host.window.removeEventListener('unload', unload));
          failure.run(unbind);
        }
        failure.run(() => credentials.dispose());
        failure.run(untheme);
        failure.rethrow();
      },
    };
    this.#view = view;
    doc.documentElement.append(backdrop);
    close.addEventListener('click', () => this.close(true));
    stop.addEventListener('click', () => this.queue.stop());
    start.addEventListener('click', () => {
      void this.#run(view, true);
    });
    retry.addEventListener('click', () => {
      void this.#run(view, false);
    });
    root.addEventListener('keydown', (event) => this.handleKey(event));
    host.window.addEventListener('unload', unload, { once: true });
    this.#render(view);
    root.focus();
    void this.queue.init().then(() => {
      if (this.#current(view)) {
        view.pending = false;
        this.#render(view);
        (this.queue.running ? view.stop : view.input).focus();
      }
    });
  }
  #render(view: View): void {
    if (!this.#current(view)) return;
    const rows = this.queue.rows,
      done = rows.filter((r) => r.state === 'cached' || r.state === 'complete').length,
      failed = rows.filter((r) => r.state === 'failed').length;
    const busy = this.queue.running || view.pending;
    view.credentials.setDisabled(busy);
    view.start.disabled =
      busy || !view.host.targets.length || view.host.targets.length > MAX_PREPARATION_FILES;
    view.start.textContent = this.#text(view, rows.length ? 'replace' : 'start');
    view.retry.disabled = busy || !rows.some((r) => r.state !== 'cached' && r.state !== 'complete');
    view.stop.disabled = !this.queue.running;
    view.status.textContent = this.queue.storageFailed
      ? this.#text(view, 'storageError')
      : `${done}/${rows.length} ${this.#text(view, 'finished')} · ${failed} ${this.#text(view, 'failed')}`;
    if (view.host.targets.length > MAX_PREPARATION_FILES)
      view.status.textContent += ` · ${this.#text(view, 'limit')}`;
    const scrollTop = view.results.scrollTop;
    view.results.replaceChildren();
    for (const row of rows) {
      const node = view.results.ownerDocument.createElementNS(
        'http://www.w3.org/1999/xhtml',
        'li',
      ) as HTMLElement;
      node.style.cssText = `padding:8px 0;border-bottom:1px solid ${THEME_VARS.border};overflow-wrap:anywhere`;
      const progress =
        ['running', 'converting', 'complete', 'cached'].includes(row.state) &&
        row.completedPages !== undefined &&
        row.totalPages !== undefined
          ? ` ${row.completedPages}/${row.totalPages}`
          : '';
      node.textContent = `${row.target.title} — ${this.#text(view, `state.${row.state}`)}${progress}${row.failure ? ` · ${this.#text(view, `failure.${row.failure}`)}` : ''}`;
      if (row.remote) {
        const receipt = node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'small');
        receipt.textContent = `\n${this.#text(view, 'receipt')}: ${row.remote.batchID} / ${row.remote.dataID}`;
        receipt.style.cssText = `display:block;color:${THEME_VARS.muted}`;
        node.append(receipt);
      }
      view.results.append(node);
    }
    view.results.scrollTop = scrollTop;
  }
  async #run(view: View, replace: boolean): Promise<void> {
    if (
      !this.#current(view) ||
      view.pending ||
      this.queue.running ||
      (replace ? view.start.disabled : view.retry.disabled)
    )
      return;
    const token = view.credentials.token();
    view.input.value = '';
    view.pending = true;
    this.#render(view);
    try {
      if (!replace || (await this.queue.replace(view.host.targets))) {
        const work = this.queue.run(token, documentPreparationAbort);
        if (this.#current(view)) view.stop.focus();
        await work;
      }
    } catch {
      if (this.#current(view)) view.status.textContent = this.#text(view, 'storageError');
      this.#debug('Document preparation could not start');
    } finally {
      if (this.#current(view)) {
        view.pending = false;
        this.#render(view);
        (view.retry.disabled ? view.close : view.retry).focus();
      }
    }
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    const target = asElement(event.target);
    if (!view || !target) return false;
    const inside = view.root.contains(target);
    if (!inside && target.ownerDocument !== view.root.ownerDocument) return false;
    event.stopImmediatePropagation();
    if (!this.#current(view) || compositionOwnsKey(event, view.composition.active)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (!inside) {
      event.preventDefault();
      view.close.focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(view.root.querySelectorAll<HTMLElement>('input,button,summary')) as HTMLElement[]
      ).filter((n) => !(n as HTMLButtonElement).disabled && n.getClientRects().length > 0);
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
  closeOwner(window: Window): void {
    if (this.#view?.host.window === window) this.close(false);
  }
  close(focus = false): void {
    const view = this.#view;
    if (!view) return;
    this.#view = null;
    const alive = !isDeadObject(view.backdrop);
    const restore = alive && focus && view.host.isCurrent();
    const failure = new CleanupFailure();
    failure.run(view.clean);
    if (alive) failure.run(() => view.backdrop.remove());
    failure.rethrow();
    if (restore && view.focus?.isConnected) view.focus.focus();
  }
  dispose(): void {
    const failure = new CleanupFailure();
    failure.run(() => this.queue.dispose());
    failure.run(() => this.close(false));
    failure.rethrow();
  }
}
