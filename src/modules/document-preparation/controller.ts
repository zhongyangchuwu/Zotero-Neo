import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import { isDeadObject } from '../../platform/cross-compartment';
import { asElement } from '../../platform/dom';
import { readMinerUToken, saveMinerUToken } from '../../platform/document-credentials';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import { t } from '../../i18n';
import { bindCompositionState, compositionOwnsKey } from '../../input/composition';
import { keyString } from '../../input/keys';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { PREPARATION_BACKDROP_STYLE, PREPARATION_PANEL_STYLE } from '../../ui/react/shells/reader';
import {
  documentPreparationAbort,
  documentPreparationHost,
} from '../../platform/document-preparation';
import {
  DocumentPreparationQueue,
  MAX_PREPARATION_FILES,
  type DocumentAttachment,
} from '../../document-analysis/preparation';
import type { PreparationReactCommand, PreparationReactModel } from './react-model';

export interface PreparationPresentation {
  readonly window: Window;
  readonly targets: readonly DocumentAttachment[];
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly isCurrent: () => boolean;
}
export interface DocumentPreparationPort {
  open(presentation: PreparationPresentation): Cleanup | null;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
interface View {
  host: PreparationPresentation;
  root: HTMLElement;
  backdrop: HTMLElement;
  react: NativeReactView<PreparationReactModel> | null;
  composition: { active: boolean };
  focus: HTMLElement | null;
  clean(): void;
  pending: boolean;
  credentialPending: boolean;
  credentialStatus: string;
  statusError: boolean;
}

/** One application queue and one replaceable presentation; closing never cancels admitted work. */
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
  #credential(view: View, key: string): string {
    return t(`documentCredentials.${key}`, view.host.language());
  }
  #current(view: View): boolean {
    if (this.#view !== view) return false;
    if (!isDeadObject(view.root) && view.host.isCurrent() && view.root.isConnected) return true;
    this.close(false);
    return false;
  }
  #part(view: View, name: string): HTMLElement | null {
    return view.react?.getElement(name) ?? null;
  }
  open(host: PreparationPresentation): Cleanup | null {
    if (!host.isCurrent()) return null;
    this.close(false);
    const doc = host.window.document;
    const backdrop = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    backdrop.style.cssText = PREPARATION_BACKDROP_STYLE;
    const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'section') as HTMLElement;
    root.className = 'neo-ui';
    root.dataset.zvDocumentPreparation = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', t('documentPreparation.title', host.language()));
    root.style.cssText = PREPARATION_PANEL_STYLE;
    const focus = doc.activeElement as HTMLElement | null;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const composition = { active: false };
    const untheme = host.themeRoot(backdrop);
    const unload = (): void => this.closeOwner(host.window);
    let unbind = (): void => {};
    let unsubscribe = (): void => {};
    const view: View = {
      host,
      root,
      backdrop,
      react: null,
      composition,
      focus,
      pending: true,
      credentialPending: false,
      credentialStatus: t('documentCredentials.hint', host.language()),
      statusError: false,
      clean: () => {
        const failure = new CleanupFailure();
        failure.run(unsubscribe);
        if (!isDeadObject(root)) {
          failure.run(() => host.window.removeEventListener('unload', unload));
          failure.run(unbind);
          const input = this.#part(view, 'token') as HTMLInputElement | null;
          if (input) input.value = '';
        }
        failure.run(() => view.react?.dispose());
        failure.run(untheme);
        failure.rethrow();
      },
    };
    this.#view = view;
    const react = mountNativeReactView<PreparationReactModel, PreparationReactCommand>({
      surface: 'document-preparation',
      root,
      model: this.#model(view),
      isCurrent: () => this.#view === view && host.isCurrent(),
      loadingText: t('documentPreparation.loading', host.language()),
      errorText: t('documentPreparation.storageError', host.language()),
      onError: () => this.#debug('Document preparation UI unavailable'),
      dispatch: (command) => {
        if (!this.#current(view)) return;
        switch (command.type) {
          case 'close':
            this.close(true);
            break;
          case 'stop':
            this.queue.stop();
            break;
          case 'start':
            void this.#run(view, true);
            break;
          case 'retry':
            void this.#run(view, false);
            break;
          case 'save':
            void this.#save(view, false);
            break;
          case 'clear':
            void this.#save(view, true);
            break;
        }
      },
    });
    view.react = react;
    unsubscribe = this.queue.subscribe(() => this.#render(view));
    root.addEventListener('keydown', (event) => this.handleKey(event));
    host.window.addEventListener('unload', unload, { once: true });
    this.#render(view);
    root.focus();
    void react.ready
      .then(() => {
        if (!this.#current(view)) return;
        const input = this.#part(view, 'token') as HTMLInputElement | null;
        if (input) unbind = bindCompositionState(input, composition);
        (this.queue.running ? this.#part(view, 'stop') : input)?.focus();
      })
      .catch(() => {});
    void this.queue.init().then(() => {
      if (this.#current(view)) {
        view.pending = false;
        this.#render(view);
        (this.queue.running ? this.#part(view, 'stop') : this.#part(view, 'token'))?.focus();
      }
    });
    return () => {
      if (this.#view === view) this.close(false);
    };
  }
  #model(view: View): PreparationReactModel {
    const rows = this.queue.rows;
    const done = rows.filter((r) => r.state === 'cached' || r.state === 'complete').length;
    const failed = rows.filter((r) => r.state === 'failed').length;
    const busy = this.queue.running || view.pending || view.credentialPending;
    let status =
      this.queue.storageFailed || view.statusError
        ? this.#text(view, 'storageError')
        : `${done}/${rows.length} ${this.#text(view, 'finished')} · ${failed} ${this.#text(view, 'failed')}`;
    if (view.host.targets.length > MAX_PREPARATION_FILES)
      status += ` · ${this.#text(view, 'limit')}`;
    return {
      title: this.#text(view, 'title'),
      help: this.#text(view, 'help'),
      selection: `${this.#text(view, 'selection')} ${view.host.targets.length}`,
      names: view.host.targets.slice(0, MAX_PREPARATION_FILES + 1).map((target) => target.title),
      token: this.#credential(view, 'token'),
      save: this.#credential(view, 'save'),
      clear: this.#credential(view, 'clear'),
      credentialStatus: view.credentialStatus,
      start: this.#text(view, rows.length ? 'replace' : 'start'),
      retry: this.#text(view, 'retry'),
      stop: this.#text(view, 'stop'),
      close: this.#text(view, 'close'),
      status,
      busy,
      startDisabled:
        busy || !view.host.targets.length || view.host.targets.length > MAX_PREPARATION_FILES,
      retryDisabled: busy || !rows.some((r) => r.state !== 'cached' && r.state !== 'complete'),
      stopDisabled: !this.queue.running,
      rows: rows.map((row) => {
        const progress =
          ['running', 'converting', 'complete', 'cached'].includes(row.state) &&
          row.completedPages !== undefined &&
          row.totalPages !== undefined
            ? ` ${row.completedPages}/${row.totalPages}`
            : '';
        return {
          text: `${row.target.title} — ${this.#text(view, `state.${row.state}`)}${progress}${row.failure ? ` · ${this.#text(view, `failure.${row.failure}`)}` : ''}`,
          receipt: row.remote
            ? `${this.#text(view, 'receipt')}: ${row.remote.batchID} / ${row.remote.dataID}`
            : '',
        };
      }),
    };
  }
  #render(view: View): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }
  async #save(view: View, clear: boolean): Promise<void> {
    if (!this.#current(view) || view.pending || view.credentialPending || this.queue.running)
      return;
    const input = this.#part(view, 'token') as HTMLInputElement | null;
    if (!input) return;
    const doc = view.root.ownerDocument;
    const ownedFocus = this.#part(view, 'credentials')?.contains(doc.activeElement) ?? false;
    const forget = clear || !input.value.trim();
    view.credentialPending = true;
    this.#render(view);
    try {
      await saveMinerUToken(forget ? '' : input.value);
      if (this.#current(view)) {
        if (forget) input.value = '';
        view.credentialStatus = this.#credential(view, forget ? 'cleared' : 'saved');
      }
    } catch {
      if (this.#current(view)) view.credentialStatus = this.#credential(view, 'unavailable');
    } finally {
      if (this.#current(view)) {
        view.credentialPending = false;
        this.#render(view);
        if (
          ownedFocus &&
          (!doc.activeElement ||
            doc.activeElement === view.root ||
            doc.activeElement === doc.body ||
            doc.activeElement === doc.documentElement)
        )
          input.focus();
      }
    }
  }
  async #run(view: View, replace: boolean): Promise<void> {
    if (
      !this.#current(view) ||
      (replace ? this.#model(view).startDisabled : this.#model(view).retryDisabled)
    )
      return;
    const input = this.#part(view, 'token') as HTMLInputElement | null;
    if (!input) return;
    let token = input.value;
    if (!token) {
      try {
        token = readMinerUToken();
      } catch {
        view.credentialStatus = this.#credential(view, 'unavailable');
      }
    }
    input.value = '';
    view.pending = true;
    view.statusError = false;
    this.#render(view);
    try {
      if (!replace || (await this.queue.replace(view.host.targets))) {
        const work = this.queue.run(token, documentPreparationAbort);
        if (this.#current(view)) this.#part(view, 'stop')?.focus();
        await work;
      }
    } catch {
      if (this.#current(view)) view.statusError = true;
      this.#debug('Document preparation could not start');
    } finally {
      if (this.#current(view)) {
        view.pending = false;
        this.#render(view);
        (this.#part(view, 'retry') as HTMLButtonElement | null)?.disabled
          ? this.#part(view, 'close')?.focus()
          : this.#part(view, 'retry')?.focus();
      }
    }
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view,
      target = asElement(event.target);
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
      this.#part(view, 'close')?.focus();
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
    const alive = !isDeadObject(view.backdrop),
      restore = alive && focus && view.host.isCurrent();
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
