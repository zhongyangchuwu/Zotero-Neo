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

const STYLE = `
[data-zv-outline-navigation] {
  --zv-outline-section: #4c78a8; --zv-outline-subsection: #6d7b91;
  --zv-outline-figure: #95551f; --zv-outline-table: #286f5e;
}
html[data-color-scheme="dark"] [data-zv-outline-navigation] {
  --zv-outline-section: #82b1e5; --zv-outline-subsection: #a5b4ca;
  --zv-outline-figure: #e0a06b; --zv-outline-table: #72bdac;
}
#sidebarContent > .viewWrapper[data-zv-outline-navigation]:not(.hidden) {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
}
[data-zv-outline-navigation] > #outlineView {
  flex: 1 1 auto; min-height: 0; height: auto; overflow: auto;
}
#outlineView .zv-outline-badge {
  display: inline-flex; flex: none; align-items: center; gap: 3px;
  margin-inline-end: 6px; padding: 0 4px; border: 1px solid currentColor;
  border-radius: 3px; color: inherit; font-size: 10px; font-weight: 600;
  line-height: 16px; vertical-align: middle;
}
#outlineView .zv-outline-badge[data-zv-outline-kind="section"] {
  --zv-outline-tone: var(--zv-outline-section);
}
#outlineView .zv-outline-badge[data-zv-outline-kind="subsection"] {
  --zv-outline-tone: var(--zv-outline-subsection);
}
#outlineView .zv-outline-badge[data-zv-outline-kind="figure"] {
  --zv-outline-tone: var(--zv-outline-figure);
}
#outlineView .zv-outline-badge[data-zv-outline-kind="table"] {
  --zv-outline-tone: var(--zv-outline-table);
}
#outlineView .zv-outline-badge[data-zv-outline-kind] {
  border-color: var(--zv-outline-tone, currentColor);
  background-color: color-mix(in srgb, var(--zv-outline-tone, currentColor) 12%, transparent);
}
#outlineView .zv-outline-count {
  display: inline-flex; flex: none; margin-inline: 6px;
  font-size: 11px; opacity: .65;
}
#zv-reader-captions {
  flex: 0 1 auto; max-height: 35%; overflow: auto;
  border-top: 1px solid var(--color-border, currentColor); padding: 4px 8px;
  font: inherit; color: inherit;
}
#zv-reader-captions summary { cursor: pointer; padding-block: 3px; }
#zv-reader-captions details details { margin-inline-start: 8px; }
#zv-reader-captions button {
  display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  border: 0; background: transparent; color: inherit; font: inherit;
  padding: 4px; text-align: start; cursor: pointer;
}
#zv-reader-captions [data-zv-caption-kind="figure"] > summary { color: var(--zv-outline-figure); }
#zv-reader-captions [data-zv-caption-kind="table"] > summary { color: var(--zv-outline-table); }
#zv-reader-captions :focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
#zv-reader-captions .zv-caption-status { opacity: .7; padding: 4px; }
#zv-reader-marks {
  flex: 0 1 auto; max-height: 35%; overflow: auto;
  border-top: 1px solid var(--color-border, currentColor); padding: 8px;
  font: inherit; color: inherit;
}
#zv-reader-marks summary { cursor: pointer; padding-block: 3px; }
#zv-reader-marks .zv-mark-row { display: flex; align-items: center; gap: 4px; }
#zv-reader-marks button {
  font: inherit; color: inherit; background: transparent; border: 0;
  border-radius: 3px; padding: 5px; text-align: start; cursor: pointer;
}
#zv-reader-marks button[data-zv-mark] { flex: 1; min-width: 0; }
#zv-reader-marks button:focus-visible { outline: 2px solid currentColor; }
#zv-reader-marks .zv-empty-marks { opacity: .65; padding-block: 5px; }
`;

type SidebarPane = 'outline' | 'marks' | 'annotations' | 'thumbnails';

/** Owns one reversible native-sidebar enhancement, never the host's sidebar or annotation state. */
export class ReaderNativeSidebar {
  readonly #host: ReaderNativeSidebarHost;
  #document: Document | null = null;
  #observer: MutationObserver | null = null;
  #style: HTMLStyleElement | null = null;
  #marksRoot: HTMLElement | null = null;
  #captionsRoot: HTMLElement | null = null;
  #captionEntries: readonly ReaderCaptionTarget[] | null = null;
  #captionState = '';
  #captionLanguage = '';
  #marksSignature = '';
  #decorated = new Set<HTMLElement>();
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
    const window = this.#host.reader._iframeWindow as NativeSidebarWindow | undefined;
    if (!window || isDeadObject(window)) return;
    this.#document = window.document;
    window.document.addEventListener('focusin', this.#onFocus, true);
    window.document.addEventListener('pointerdown', this.#onPointer, true);
    if (window.MutationObserver && window.document.body) {
      this.#observer = new window.MutationObserver((records) => {
        if (this.#disposed) return;
        if (
          this.#language !== this.#host.language() ||
          records.some((record) => this.isOutlineMutation(record))
        )
          this.refresh();
        else if (this.#pageLabels !== this.#host.reader._internalReader?._state?.pageLabels)
          this.refreshMarks();
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
    const element = asElement(target);
    const window = this.#host.reader._iframeWindow;
    return (
      !!element &&
      !isDeadObject(element) &&
      !!window &&
      !isDeadObject(window) &&
      element.ownerDocument === window.document &&
      !!element.closest?.('#sidebarContainer')
    );
  }

  toggle(group: 'outline' | 'marks', _pdfWindow: PdfWindow): void {
    if (this.#disposed) return;
    this.start();
    const internal = this.#host.reader._internalReader;
    if (!internal) return;
    const state = internal._state;
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
    const internal = this.#host.reader._internalReader;
    internal?.setSidebarView?.(group === 'marks' ? 'outline' : group);
    internal?.toggleSidebar?.(true);
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
    const state = this.#host.reader._internalReader?._state;
    if (!state?.sidebarOpen || target.closest('.viewWrapper.hidden')) return null;
    if (state.sidebarView === 'outline') {
      if (target.closest('#zv-reader-marks')) return 'reader-marks';
      if (target.closest('#outlineView, #zv-reader-captions')) return 'reader-outline';
    }
    if (state.sidebarView === 'annotations' && target.closest('#annotationsView'))
      return 'reader-annotations';
    if (state.sidebarView === 'thumbnails' && target.closest('#thumbnailsView'))
      return 'reader-thumbnails';
    return null;
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
      const outline = context === 'reader-outline' ? target.closest('#outlineView') : null;
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
      if (outline && !outline.querySelector('.item')) return true;
      if (outline && key !== 'ArrowDown' && !outline.querySelector('.active'))
        this.dispatchNativeKey(outline, 'ArrowDown');
      if (key !== 'Enter' || outline?.querySelector('.active'))
        this.dispatchNativeKey(outline ?? target, key);
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
    const outline = document.getElementById('outlineView');
    const wrapper = outline?.parentElement;
    if (!outline || !wrapper) return;
    if (!this.#style) {
      this.#style = document.createElement('style');
      this.#style.id = 'zv-native-sidebar-style';
      this.#style.textContent = STYLE;
      document.head.appendChild(this.#style);
    }
    wrapper.setAttribute('data-zv-outline-navigation', '');
    const decorated = new Set<HTMLElement>([wrapper]);
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
          const row = document
            .getElementById(`outline-${rowIndex}`)
            ?.querySelector<HTMLElement>('.item');
          const title = row?.querySelector<HTMLElement>('.title');
          if (row && title) {
            let badge = row.querySelector<HTMLElement>('[data-zv-outline-badge]');
            if (kind) {
              if (!badge) {
                badge = document.createElement('span');
                badge.className = 'zv-outline-badge';
                badge.setAttribute('role', 'img');
                badge.setAttribute('data-zv-outline-badge', '');
              }
              const titleParent = title.parentElement;
              if (
                titleParent &&
                (badge.parentElement !== titleParent || badge.nextSibling !== title)
              )
                titleParent.insertBefore(badge, title);
              const label = t(`reader.sidebar.${kind}`, language);
              const accessibleLabel = ordinal ? `${label} ${ordinal}` : label;
              this.setAttribute(badge, 'data-zv-outline-kind', kind);
              this.setAttribute(badge, 'aria-label', accessibleLabel);
              this.setAttribute(badge, 'title', accessibleLabel);
              const text = ordinal ? `${OUTLINE_ICON[kind]} ${ordinal}` : OUTLINE_ICON[kind];
              if (badge.textContent !== text) badge.textContent = text;
              decorated.add(badge);
            } else {
              badge?.remove();
            }

            let countBadge = row.querySelector<HTMLElement>('[data-zv-outline-count]');
            if (count) {
              if (!countBadge) {
                countBadge = document.createElement('span');
                countBadge.className = 'zv-outline-count';
                countBadge.setAttribute('role', 'img');
                countBadge.setAttribute('data-zv-outline-count', '');
              }
              const titleParent = title.parentElement;
              if (
                titleParent &&
                (countBadge.parentElement !== titleParent || countBadge.previousSibling !== title)
              )
                titleParent.insertBefore(countBadge, title.nextSibling);
              const countLabel = t('reader.sidebar.children', language).replace(
                '{count}',
                String(count),
              );
              this.setAttribute(countBadge, 'aria-label', countLabel);
              this.setAttribute(countBadge, 'title', countLabel);
              if (countBadge.textContent !== String(count)) countBadge.textContent = String(count);
              decorated.add(countBadge);
            } else {
              countBadge?.remove();
            }
          }
        }
        if (entry.items)
          visit(entry.items, depth + 1, ordinal ?? parentOrdinal, rendered && !!entry.expanded);
      }
    };
    visit(this.#host.reader._internalReader?._state?.outline ?? [], 0, null, true);
    for (const old of this.#decorated) if (!decorated.has(old)) this.clearDecoration(old);
    this.#decorated = decorated;
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
      this.#pageLabels !== this.#host.reader._internalReader?._state?.pageLabels ||
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
    const wrapper = document.getElementById('outlineView')?.parentElement;
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
    const labels = this.#host.reader._internalReader?._state?.pageLabels ?? [];
    this.#pageLabels = this.#host.reader._internalReader?._state?.pageLabels;
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
    const style = this.#style;
    this.#marksRoot = null;
    this.#style = null;
    this.#document = null;
    for (const element of this.#decorated) failure.run(() => this.clearDecoration(element));
    this.#decorated.clear();
    failure.run(() => {
      if (marks && !isDeadObject(marks)) marks.remove();
    });
    failure.run(() => {
      if (style && !isDeadObject(style)) style.remove();
    });
    failure.rethrow();
  }

  private close(): void {
    this.deactivate();
    this.#host.reader._internalReader?.toggleSidebar?.(false);
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
    const window = this.#host.reader._iframeWindow as NativeSidebarWindow | undefined;
    if (!window || isDeadObject(window)) return;
    this.#dispatching = true;
    try {
      target.dispatchEvent(
        new window.KeyboardEvent(
          'keydown',
          cloneInto({ key, bubbles: true, cancelable: true }, window),
        ),
      );
    } finally {
      this.#dispatching = false;
    }
  }

  /** Ignores native chrome/annotation/thumbnail work and our own projection mutations. */
  private isOutlineMutation(record: MutationRecord): boolean {
    const target = asElement(record.target) ?? record.target.parentElement;
    if (
      !target ||
      target.closest('#zv-reader-marks, #zv-reader-captions, #annotationsView, #thumbnailsView')
    )
      return false;
    if (target.closest('#outlineView')) return record.type !== 'attributes';
    if (target.parentElement?.id === 'sidebarContent') return true;
    if (record.type !== 'childList') return false;
    return (
      this.containsOutlineNode(record.addedNodes) || this.containsOutlineNode(record.removedNodes)
    );
  }

  private containsOutlineNode(nodes: NodeList): boolean {
    for (const node of nodes) {
      const element = asElement(node);
      if (
        element &&
        (element.id === 'outlineView' ||
          element.id === 'sidebarContainer' ||
          element.querySelector('#outlineView'))
      )
        return true;
    }
    return false;
  }

  /** A request is valid only while its native pane remains open and authoritative. */
  private refreshFocus(): void {
    const request = this.#focusRequest;
    const document = this.#document;
    if (!document || this.#disposed || isDeadObject(document)) return;
    const state = this.#host.reader._internalReader?._state;
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
      target = document.getElementById('outlineView');
    else if (request === 'marks') {
      const details = this.#marksRoot?.querySelector<HTMLDetailsElement>('details');
      if (details) details.open = true;
      target =
        this.#marksRoot?.querySelector<HTMLElement>('button[data-zv-mark]') ??
        this.#marksRoot?.querySelector<HTMLElement>('summary') ??
        this.#marksRoot;
    } else if (request === 'annotations')
      target =
        document.querySelector<HTMLElement>('#annotationsView .annotation.selected') ??
        document.querySelector<HTMLElement>('#annotationsView .annotation') ??
        document.getElementById('annotationsView');
    else if (request === 'thumbnails')
      target = document.querySelector<HTMLElement>('#thumbnailsView .thumbnails');
    if (!target || target.closest('.viewWrapper.hidden')) return;
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

  private setAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  private clearDecoration(element: HTMLElement): void {
    if (isDeadObject(element)) return;
    if (
      element.hasAttribute('data-zv-outline-badge') ||
      element.hasAttribute('data-zv-outline-count')
    ) {
      element.remove();
      return;
    }
    element.removeAttribute('data-zv-outline-navigation');
    element.removeAttribute('data-zv-outline-kind');
    element.removeAttribute('data-zv-outline-count');
  }
}
