import { readerWindow } from '../toolkit/reader';
import {
  ReaderSidebarDecoration,
  readerSidebarState,
  readerPageLabels,
  setReaderSidebar,
  closeReaderSidebar,
  readerSidebarContainsTarget,
  readerSidebarPaneForTarget,
  readerSidebarTargetHidden,
  readerOutlineContainer,
  readerSidebarFocusTarget,
  dispatchReaderSidebarKey,
  readerOutlineMutation,
  type ReaderOutlineDecoration,
} from '../toolkit/reader';
import { CleanupFailure } from '../core/cleanup';
import { t } from '../i18n';
import type { BindingMap, BindingContext } from '../input/bindings';
import type { ActionId } from '../input/actions';
import { compositionOwnsKey } from '../input/composition';
import { LocalBindingRuntime } from '../input/local-binding-runtime';
import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { asElement, isEditableElement } from '../platform/dom';
import type { ReaderMarks } from './marks';
import { outlineEntryKind } from './outline-presentation';
import type { ReaderCaptionTarget, ReaderCaptionTargets } from './caption-targets';
import type { PdfWindow, ReaderNativeOutlineEntry, ReaderRuntime, ReaderTimer } from './types';

interface NativeSidebarWindow extends Window {
  readonly MutationObserver?: typeof MutationObserver;
  readonly KeyboardEvent: typeof KeyboardEvent;
}

export interface ReaderNativeSidebarHost {
  readonly reader: ReaderRuntime;
  readonly marks: ReaderMarks;
  readonly captions: ReaderCaptionTargets;
  readonly onCaptionTarget: (target: ReaderCaptionTarget, pdfWindow: PdfWindow) => void;
  readonly onAnnotation: (key: string | null) => void;
  readonly bindings: () => BindingMap;
  readonly language: () => string;
  readonly activePdfWindow: () => PdfWindow | null;
  readonly onDocumentAction: (
    action: 'prevHeading' | 'nextHeading',
    pdfWindow: PdfWindow,
  ) => boolean;
  readonly onInput: () => void;
  readonly schedule: (delay: number, task: () => void) => ReaderTimer;
  readonly clearTimer: (timer: ReaderTimer | null) => void;
  readonly log: (message: string) => void;
}

type OutlineBadgeKind = 'figure' | 'table' | 'section' | 'subsection';

const OUTLINE_ICON: Readonly<Record<OutlineBadgeKind, string>> = {
  figure: '▧',
  table: '▤',
  section: '§',
  subsection: '↳',
};

type SidebarPane = 'outline' | 'marks' | 'annotations' | 'thumbnails';

/** Owns one reversible native-sidebar enhancement, never the host's sidebar or annotation state. */
export class ReaderNativeSidebar {
  readonly #host: ReaderNativeSidebarHost;
  #document: Document | null = null;
  #observer: MutationObserver | null = null;
  readonly #decoration = new ReaderSidebarDecoration();
  #marksRoot: HTMLElement | null = null;
  #captionsRoot: HTMLElement | null = null;
  #captionEntries: readonly ReaderCaptionTarget[] | null = null;
  #captionState = '';
  #captionLanguage = '';
  #marksSignature = '';
  #pageLabels: readonly string[] | undefined;
  #language = '';
  #focusRequest: SidebarPane | null = null;
  readonly #local: LocalBindingRuntime;
  readonly #localTimers = new Map<number, ReaderTimer>();
  #nextTimer = 0;
  #localContext: BindingContext | null = null;
  #observedOpen: boolean | undefined;
  #observedView: 'outline' | 'annotations' | 'thumbnails' | undefined;
  readonly #focusableFallbacks = new Set<HTMLElement>();
  readonly #onFocus = (): void => {
    this.deactivate();
    this.#host.onInput();
  };
  readonly #onPointer = (): void => {
    this.deactivate();
    this.#host.onInput();
  };
  #dispatching = false;
  #disposed = false;

  constructor(host: ReaderNativeSidebarHost) {
    this.#host = host;
    this.#local = new LocalBindingRuntime({
      bindings: host.bindings,
      execute: (action, event) => this.executeLocal(action, event),
      schedule: (callback, delay) => {
        const id = ++this.#nextTimer;
        this.#localTimers.set(
          id,
          host.schedule(delay, () => {
            this.#localTimers.delete(id);
            callback();
          }),
        );
        return id;
      },
      clearTimer: (id) => {
        if (id === undefined) return;
        host.clearTimer(this.#localTimers.get(id) ?? null);
        this.#localTimers.delete(id);
      },
    });
  }

  start(): void {
    if (this.#disposed || this.#document) return;
    const window = readerWindow(this.#host.reader) as NativeSidebarWindow | undefined;
    if (!window || isDeadObject(window)) return;
    this.#document = window.document;
    window.document.addEventListener('focusin', this.#onFocus, true);
    window.document.addEventListener('pointerdown', this.#onPointer, true);
    if (window.MutationObserver && window.document.body) {
      this.#observer = new window.MutationObserver((records) => {
        if (this.#disposed) return;
        if (
          this.#language !== this.#host.language() ||
          records.some((record) => readerOutlineMutation(record))
        )
          this.refresh();
        else if (this.#pageLabels !== readerPageLabels(this.#host.reader)) this.refreshMarks();
        this.refreshFocus();
      });
      this.#observer.observe(
        window.document.body,
        cloneInto(
          {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'aria-selected'],
          },
          window,
        ),
      );
    }
    this.refresh();
  }

  /** Target qualification, not sidebar visibility, decides whether PDF bindings must yield. */
  containsTarget(target: EventTarget | null): boolean {
    return readerSidebarContainsTarget(this.#host.reader, target);
  }

  toggle(group: 'outline' | 'marks', _pdfWindow: PdfWindow): void {
    if (this.#disposed) return;
    this.start();
    const state = readerSidebarState(this.#host.reader);
    if (!state) return;
    const marksFocused = !!this.#document?.activeElement?.closest('#zv-reader-marks');
    if (
      state?.sidebarOpen &&
      state.sidebarView === 'outline' &&
      (group === 'outline' || marksFocused)
    ) {
      this.close();
      return;
    }
    this.focus(group, _pdfWindow);
  }

  focus(group: SidebarPane, _pdfWindow: PdfWindow): void {
    if (this.#disposed) return;
    this.start();
    this.#local.deactivate();
    setReaderSidebar(this.#host.reader, group === 'marks' ? 'outline' : group);
    this.#focusRequest = group;
    this.refresh();
    this.refreshFocus();
  }

  /** Only configurable Neo aliases are consumed; genuine host keys and editors stay native. */
  handleKey(event: KeyboardEvent): void {
    const target = asElement(event.target);
    if (this.#disposed || this.#dispatching || !target) return;
    this.#host.onInput();
    this.#focusRequest = null;
    if (isEditableElement(target) || compositionOwnsKey(event, false)) {
      this.#local.deactivate();
      return;
    }
    const context = this.contextForTarget(target);
    if (
      !context ||
      event.key === 'Tab' ||
      event.key.startsWith('Arrow') ||
      (context === 'reader-outline' && (event.key === 'Enter' || event.key === 'Return'))
    ) {
      this.#local.deactivate();
      return;
    }
    this.#localContext = context;
    if (this.#local.handle(event, context)) this.consume(event);
  }

  private contextForTarget(target: Element): BindingContext | null {
    const state = readerSidebarState(this.#host.reader);
    if (!state?.sidebarOpen || readerSidebarTargetHidden(target)) return null;
    if (state.sidebarView === 'outline') {
      if (target.closest('#zv-reader-marks')) return 'reader-marks';
      if (target.closest('#zv-reader-captions')) return 'reader-outline';
    }
    const pane = readerSidebarPaneForTarget(this.#host.reader, target);
    return pane ? `reader-${pane}` : null;
  }

  private executeLocal(action: ActionId, _event: KeyboardEvent | null): boolean {
    const target = asElement(this.#document?.activeElement ?? null);
    const context = target && this.contextForTarget(target);
    if (this.#disposed || !target || !context || isEditableElement(target)) return false;
    if (action === 'prevHeading' || action === 'nextHeading') {
      const pdfWindow = this.#host.activePdfWindow();
      if (!pdfWindow) return false;
      return this.#host.onDocumentAction(action, pdfWindow);
    }
    if (
      action === 'focusReaderOutline' ||
      action === 'focusReaderMarks' ||
      action === 'focusReaderAnnotations' ||
      action === 'focusReaderThumbnails'
    ) {
      const pdfWindow = this.#host.activePdfWindow();
      if (!pdfWindow) return false;
      this.focus(
        action === 'focusReaderOutline'
          ? 'outline'
          : action === 'focusReaderMarks'
            ? 'marks'
            : action === 'focusReaderAnnotations'
              ? 'annotations'
              : 'thumbnails',
        pdfWindow,
      );
      return true;
    }
    if (action === 'uiCancel') {
      this.close();
      return true;
    }
    const captions = target.closest('#zv-reader-captions');
    if (captions) {
      if (action === 'uiConfirm') {
        target.closest<HTMLElement>('button, summary')?.click();
        return true;
      }
      const details = target.closest<HTMLDetailsElement>('details');
      if (action === 'uiParent' || action === 'uiChild') {
        if (details) details.open = action === 'uiChild';
        return true;
      }
      if (action !== 'uiNext' && action !== 'uiPrevious') return false;
      const choices: HTMLElement[] = [];
      const elements = captions.querySelectorAll<HTMLElement>('summary, button');
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        let details = element.parentElement?.closest<HTMLDetailsElement>('details');
        let visible = true;
        while (details) {
          if (!details.open && details.querySelector('summary') !== element) {
            visible = false;
            break;
          }
          details = details.parentElement?.closest<HTMLDetailsElement>('details') ?? null;
        }
        if (visible) choices.push(element);
      }
      const index = choices.indexOf(target as HTMLElement);
      const next = Math.max(
        0,
        Math.min(choices.length - 1, index + (action === 'uiNext' ? 1 : -1)),
      );
      choices[next]?.focus();
      return true;
    }
    if (context !== 'reader-marks') {
      const outline = context === 'reader-outline';
      const key =
        action === 'uiNext'
          ? 'ArrowDown'
          : action === 'uiPrevious'
            ? 'ArrowUp'
            : outline && action === 'uiParent'
              ? 'ArrowLeft'
              : outline && action === 'uiChild'
                ? 'ArrowRight'
                : outline && action === 'uiConfirm'
                  ? 'Enter'
                  : null;
      if (!key) return false;
      this.dispatchNativeKey(target, key);
      return true;
    }
    const marks = target.closest('#zv-reader-marks');
    if (!marks) return false;
    const current = target.closest<HTMLButtonElement>('button[data-zv-mark]');
    if (action === 'uiConfirm') {
      const button = target.closest<HTMLButtonElement>('button');
      if (button) button.click();
      else if (target.tagName === 'SUMMARY') (target as HTMLElement).click();
      return true;
    }
    if (action === 'uiDelete') {
      if (current) this.deleteMark(current.dataset.zvMark ?? '');
      return true;
    }
    if (action === 'uiClear') {
      this.deleteMark(null);
      return true;
    }
    if (!['uiNext', 'uiPrevious', 'uiFirst', 'uiLast'].includes(action)) return false;
    const buttons = marks.querySelectorAll<HTMLButtonElement>('button[data-zv-mark]');
    let index = -1;
    for (let i = 0; i < buttons.length; i += 1)
      if (buttons[i] === current) {
        index = i;
        break;
      }
    const next =
      action === 'uiFirst'
        ? 0
        : action === 'uiLast'
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, index + (action === 'uiNext' ? 1 : -1)));
    buttons.item(next)?.focus();
    return true;
  }

  /** Rebinds only Neo DOM/attributes after native React rerenders; never replaces native children. */
  refresh(): void {
    const document = this.#document;
    if (this.#disposed || !document || isDeadObject(document)) return;
    const rows: ReaderOutlineDecoration[] = [];
    let renderedIndex = 0;
    const language = this.#host.language();
    const visit = (
      entries: readonly ReaderNativeOutlineEntry[],
      depth: number,
      parentOrdinal: string | null,
      rendered: boolean,
    ): void => {
      let headingIndex = 0;
      for (const entry of entries) {
        const count = entry.items?.length ?? 0;
        const kind = outlineEntryKind(entry.title, depth);
        const ordinal =
          kind === 'section' || kind === 'subsection'
            ? `${parentOrdinal ? `${parentOrdinal}.` : ''}${++headingIndex}`
            : null;
        const rowIndex = rendered ? renderedIndex++ : -1;
        if (rendered && (entry.matched !== false || entry.childMatched !== false)) {
          const label = kind ? t(`reader.sidebar.${kind}`, language) : '';
          rows.push({
            rowIndex,
            badge: kind
              ? {
                  kind,
                  label: ordinal ? `${label} ${ordinal}` : label,
                  text: ordinal ? `${OUTLINE_ICON[kind]} ${ordinal}` : OUTLINE_ICON[kind],
                }
              : null,
            count: count
              ? {
                  label: t('reader.sidebar.children', language).replace('{count}', String(count)),
                  text: String(count),
                }
              : null,
          });
        }
        if (entry.items)
          visit(entry.items, depth + 1, ordinal ?? parentOrdinal, rendered && !!entry.expanded);
      }
    };
    visit(readerSidebarState(this.#host.reader)?.outline ?? [], 0, null, true);
    const wrapper = this.#decoration.update(document, rows);
    if (!wrapper) return;
    this.refreshCaptions();
    if (!this.#marksRoot || this.#marksRoot.parentElement !== wrapper) {
      if (this.#marksRoot && !isDeadObject(this.#marksRoot)) this.#marksRoot.remove();
      this.#marksRoot = document.createElement('section');
      this.#marksRoot.id = 'zv-reader-marks';
      this.#marksRoot.setAttribute('role', 'group');
      this.#marksRoot.dataset.tabstop = '1';
      this.#marksRoot.tabIndex = -1;
      this.#marksRoot.addEventListener('click', (event) => this.handleMarkClick(event));
      wrapper.appendChild(this.#marksRoot);
      this.#marksSignature = '';
      this.refreshMarks();
    }
    if (
      this.#pageLabels !== readerPageLabels(this.#host.reader) ||
      this.#language !== this.#host.language()
    )
      this.refreshMarks();
    this.#language = this.#host.language();
    this.refreshFocus();
  }

  /** Caption groups are owned DOM; opening them is the only sidebar trigger for native extraction. */
  refreshCaptions(): void {
    const document = this.#document;
    if (this.#disposed || !document || isDeadObject(document)) return;
    const wrapper = readerOutlineContainer(document);
    if (!wrapper) return;
    if (!this.#captionsRoot || this.#captionsRoot.parentElement !== wrapper) {
      this.#captionsRoot?.remove();
      const root = document.createElement('section');
      root.id = 'zv-reader-captions';
      root.setAttribute('role', 'group');
      root.addEventListener(
        'toggle',
        (event) => {
          const details = event.target as HTMLDetailsElement;
          if (details.parentElement === root && details.open && !this.#disposed)
            void this.#host.captions.load();
        },
        true,
      );
      root.addEventListener('click', (event) => {
        const index = asElement(event.target)?.closest<HTMLElement>('button[data-zv-caption]')
          ?.dataset.zvCaption;
        if (index === undefined || this.#disposed) return;
        const target = this.#host.captions.entries[Number(index)];
        const window = this.#host.activePdfWindow();
        if (target && window) this.#host.onCaptionTarget(target, window);
      });
      wrapper.insertBefore(
        root,
        this.#marksRoot?.parentElement === wrapper ? this.#marksRoot : null,
      );
      this.#captionsRoot = root;
      this.#captionEntries = null;
    }
    const root = this.#captionsRoot;
    const entries = this.#host.captions.entries;
    const state = this.#host.captions.state;
    const language = this.#host.language();
    if (
      this.#captionEntries === entries &&
      this.#captionState === state &&
      this.#captionLanguage === language
    )
      return;
    const open = root.querySelector<HTMLDetailsElement>('details')?.open ?? false;
    const active = asElement(document.activeElement);
    const focusOwned = !!active && root.contains(active);
    const focusedIndex = active?.closest<HTMLElement>('button[data-zv-caption]')?.dataset.zvCaption;
    const focusedKind = active?.closest<HTMLElement>('details[data-zv-caption-kind]')?.dataset
      .zvCaptionKind;
    const groupOpen = new Map<string, boolean>();
    const groups = root.querySelectorAll<HTMLDetailsElement>('details[data-zv-caption-kind]');
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      groupOpen.set(group.dataset.zvCaptionKind!, group.open);
    }
    root.setAttribute('aria-label', t('reader.sidebar.captions', language));
    const details = document.createElement('details');
    details.open = open;
    const summary = document.createElement('summary');
    summary.dataset.tabstop = '1';
    summary.tabIndex = 0;
    summary.textContent = '▧ / ▤';
    summary.setAttribute('aria-label', t('reader.sidebar.captions', language));
    summary.title = t('reader.sidebar.captionsCost', language);
    details.appendChild(summary);
    if (state !== 'ready' || !entries.length) {
      const status = document.createElement('div');
      status.className = 'zv-caption-status';
      status.setAttribute('role', 'status');
      status.textContent = t(
        state === 'loading'
          ? 'reader.sidebar.captionsLoading'
          : state === 'idle'
            ? 'reader.sidebar.captionsIdle'
            : 'reader.sidebar.captionsEmpty',
        language,
      );
      details.appendChild(status);
    } else {
      for (const kind of ['figure', 'table'] as const) {
        const group = document.createElement('details');
        group.dataset.zvCaptionKind = kind;
        group.open = groupOpen.get(kind) ?? false;
        const heading = document.createElement('summary');
        heading.dataset.tabstop = '1';
        heading.tabIndex = 0;
        let count = 0;
        for (const entry of entries) if (entry.kind === kind) count += 1;
        heading.textContent = `${OUTLINE_ICON[kind]} ${count}`;
        heading.setAttribute('aria-label', `${t(`reader.sidebar.${kind}`, language)} · ${count}`);
        group.appendChild(heading);
        entries.forEach((caption, index) => {
          if (caption.kind !== kind) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.zvCaption = String(index);
          button.dataset.tabstop = '1';
          const description = caption.title
            .slice(caption.title.indexOf(caption.label) + caption.label.length)
            .replace(/^\s*[:：.．、]\s*/, '')
            .trimStart();
          button.textContent = `${OUTLINE_ICON[kind]} ${caption.label} · ${description}`;
          button.title = caption.title;
          group.appendChild(button);
        });
        details.appendChild(group);
      }
    }
    root.replaceChildren(details);
    this.#captionEntries = entries;
    this.#captionState = state;
    this.#captionLanguage = language;
    if (focusOwned) {
      const target =
        focusedIndex !== undefined
          ? root.querySelector<HTMLElement>(`button[data-zv-caption="${focusedIndex}"]`)
          : focusedKind
            ? root.querySelector<HTMLElement>(
                `details[data-zv-caption-kind="${focusedKind}"] > summary`,
              )
            : summary;
      (target ?? summary).focus();
    }
  }

  refreshMarks(): void {
    const root = this.#marksRoot;
    if (this.#disposed || !root || isDeadObject(root)) return;
    const language = this.#host.language();
    const labels = readerPageLabels(this.#host.reader) ?? [];
    this.#pageLabels = readerPageLabels(this.#host.reader);
    const entries = Object.entries(this.#host.marks.values()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const signature = JSON.stringify([
      language,
      entries.map(([char, mark]) => [
        char,
        mark.pageIndex,
        mark.ratio,
        mark.key,
        mark.pageIndex === null ? null : labels[mark.pageIndex],
      ]),
    ]);
    if (signature === this.#marksSignature) return;
    const active = root.ownerDocument.activeElement;
    const focusOwned = !!active && root.contains(active);
    const focused = active?.closest<HTMLButtonElement>(
      'button[data-zv-mark], button[data-zv-delete-mark]',
    );
    const focusedChar = focused?.dataset.zvMark ?? focused?.dataset.zvDeleteMark;
    const oldButtons = focusOwned
      ? root.querySelectorAll<HTMLButtonElement>('button[data-zv-mark]')
      : null;
    let focusedIndex = 0;
    if (oldButtons && focusedChar) {
      for (let i = 0; i < oldButtons.length; i += 1)
        if (oldButtons[i]?.dataset.zvMark === focusedChar) {
          focusedIndex = i;
          break;
        }
    }
    root.setAttribute('aria-label', t('reader.sidebar.marks', language));
    const details = root.ownerDocument.createElement('details');
    details.open = root.querySelector<HTMLDetailsElement>('details')?.open ?? true;
    const summary = root.ownerDocument.createElement('summary');
    summary.tabIndex = -1;
    summary.textContent = `${t('reader.sidebar.marks', language)} (${entries.length})`;
    details.appendChild(summary);
    if (!entries.length) {
      const empty = root.ownerDocument.createElement('div');
      empty.className = 'zv-empty-marks';
      empty.textContent = t('reader.sidebar.emptyMarks', language);
      details.appendChild(empty);
    }
    for (const [char, mark] of entries) {
      const row = root.ownerDocument.createElement('div');
      row.className = 'zv-mark-row';
      const button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.dataset.zvMark = char;
      const label =
        mark.pageIndex === null
          ? `${Math.round(mark.ratio * 100)}%`
          : t('reader.sidebar.page', language).replace(
              '{page}',
              labels[mark.pageIndex] ?? String(mark.pageIndex + 1),
            );
      button.textContent = `${char} · ${label}${mark.key ? ` · ${t('reader.sidebar.annotationMark', language)}` : ''}`;
      const remove = root.ownerDocument.createElement('button');
      remove.type = 'button';
      remove.tabIndex = -1;
      remove.dataset.zvDeleteMark = char;
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${t('reader.sidebar.deleteMark', language)} ${char}`);
      row.append(button, remove);
      details.appendChild(row);
    }
    root.replaceChildren(details);
    this.#marksSignature = signature;
    if (focusOwned) {
      const buttons = root.querySelectorAll<HTMLButtonElement>('button[data-zv-mark]');
      let target: HTMLElement | null = null;
      if (focusedChar) {
        for (let i = 0; i < buttons.length; i += 1) {
          const button = buttons[i];
          if (button && button.dataset.zvMark === focusedChar) {
            target = button;
            break;
          }
        }
        target ??= buttons.item(Math.min(focusedIndex, buttons.length - 1));
      }
      (target ?? summary).focus();
    }
  }

  deactivate(): void {
    this.#focusRequest = null;
    this.#local.deactivate();
    this.#localContext = null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#focusRequest = null;
    const failure = new CleanupFailure();
    failure.run(() => this.#local.dispose());
    const document = this.#document;
    failure.run(() => {
      if (document && !isDeadObject(document))
        document.removeEventListener('focusin', this.#onFocus, true);
    });
    failure.run(() => {
      if (document && !isDeadObject(document))
        document.removeEventListener('pointerdown', this.#onPointer, true);
    });
    for (const element of this.#focusableFallbacks)
      failure.run(() => {
        if (!isDeadObject(element) && element.getAttribute('tabindex') === '-1')
          element.removeAttribute('tabindex');
      });
    this.#focusableFallbacks.clear();
    const observer = this.#observer;
    this.#observer = null;
    failure.run(() => {
      if (observer && !isDeadObject(observer)) observer.disconnect();
    });
    const marks = this.#marksRoot;
    const captions = this.#captionsRoot;
    this.#captionsRoot = null;
    this.#captionEntries = null;
    failure.run(() => {
      if (captions && !isDeadObject(captions)) captions.remove();
    });
    this.#marksRoot = null;
    this.#document = null;
    failure.run(() => this.#decoration.dispose());
    failure.run(() => {
      if (marks && !isDeadObject(marks)) marks.remove();
    });
    failure.rethrow();
  }

  private close(): void {
    this.deactivate();
    closeReaderSidebar(this.#host.reader);
    this.#host.activePdfWindow()?.focus();
  }

  private handleMarkClick(event: Event): void {
    if (this.#disposed) return;
    const target = asElement(event.target);
    const remove = target?.closest<HTMLElement>('button[data-zv-delete-mark]');
    if (remove) {
      this.deleteMark(remove.dataset.zvDeleteMark ?? '');
      return;
    }
    const char = target?.closest<HTMLElement>('button[data-zv-mark]')?.dataset.zvMark;
    if (char) this.jumpMark(char);
  }

  private jumpMark(char: string): void {
    const pdfWindow = this.#host.activePdfWindow();
    if (this.#disposed || !pdfWindow) return;
    void this.#host.marks
      .jump(this.#host.reader, pdfWindow, char, this.#host.onAnnotation)
      .catch((error: unknown) => {
        if (!this.#disposed) this.#host.log(`reader bookmark jump failed: ${String(error)}`);
      });
  }

  private deleteMark(char: string | null): void {
    if (char === '' || this.#disposed) return;
    // onChange keeps focus synchronously; persistence must never reclaim later ownership.
    const deletion =
      char === null
        ? this.#host.marks.clear(this.#host.reader)
        : this.#host.marks.delete(this.#host.reader, char);
    void deletion.catch((error: unknown) => {
      if (!this.#disposed) this.#host.log(`reader bookmark deletion failed: ${String(error)}`);
    });
  }

  private dispatchNativeKey(target: Element, key: string): void {
    if (!readerWindow(this.#host.reader)) return;
    this.#dispatching = true;
    try {
      dispatchReaderSidebarKey(this.#host.reader, target, key);
    } finally {
      this.#dispatching = false;
    }
  }

  /** A request is valid only while its native pane remains open and authoritative. */
  private refreshFocus(): void {
    const request = this.#focusRequest;
    const document = this.#document;
    if (!document || this.#disposed || isDeadObject(document)) return;
    const state = readerSidebarState(this.#host.reader);
    const open = state?.sidebarOpen ?? false;
    if (this.#observedOpen && (!open || state?.sidebarView !== this.#observedView)) {
      this.#local.deactivate();
      this.#localContext = null;
      this.#host.onInput();
    }
    this.#observedOpen = open;
    this.#observedView = state?.sidebarView;
    const active = asElement(document.activeElement);
    if (
      (!state?.sidebarOpen && (request || this.#localContext)) ||
      (this.#localContext && (!active || this.contextForTarget(active) !== this.#localContext))
    ) {
      this.deactivate();
      this.#host.onInput();
      return;
    }
    if (!request) return;
    const view = request === 'marks' ? 'outline' : request;
    if (state?.sidebarView !== view) {
      this.deactivate();
      this.#host.onInput();
      return;
    }
    let target: HTMLElement | null = null;
    if (request === 'outline' && state.outline != null)
      target = readerSidebarFocusTarget(document, 'outline');
    else if (request === 'marks') {
      const details = this.#marksRoot?.querySelector<HTMLDetailsElement>('details');
      if (details) details.open = true;
      target =
        this.#marksRoot?.querySelector<HTMLElement>('button[data-zv-mark]') ??
        this.#marksRoot?.querySelector<HTMLElement>('summary') ??
        this.#marksRoot;
    } else if (request === 'annotations' || request === 'thumbnails')
      target = readerSidebarFocusTarget(document, request);
    if (!target || readerSidebarTargetHidden(target)) return;
    if (
      !target.hasAttribute('tabindex') &&
      target.tagName !== 'BUTTON' &&
      target.tagName !== 'SUMMARY'
    ) {
      target.setAttribute('tabindex', '-1');
      this.#focusableFallbacks.add(target);
    }
    this.#focusRequest = null;
    target.focus();
  }

  private consume(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
