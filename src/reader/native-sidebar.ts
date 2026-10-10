import { CleanupFailure } from '../core/cleanup';
import { t } from '../i18n';
import type { BindingMap } from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
} from '../input/key-sequence';
import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { asElement, isEditableElement } from '../platform/dom';
import type { ReaderMarks } from './marks';
import { outlineEntryKind } from './outline-presentation';
import type { PdfWindow, ReaderNativeOutlineEntry, ReaderRuntime, ReaderTimer } from './types';

interface NativeSidebarWindow extends Window {
  readonly MutationObserver?: typeof MutationObserver;
  readonly KeyboardEvent: typeof KeyboardEvent;
}

export interface ReaderNativeSidebarHost {
  readonly reader: ReaderRuntime;
  readonly marks: ReaderMarks;
  readonly bindings: () => BindingMap;
  readonly language: () => string;
  readonly activePdfWindow: () => PdfWindow | null;
  readonly onAnnotation: (key: string | null) => void;
  readonly onInput: () => void;
  readonly schedule: (delay: number, task: () => void) => ReaderTimer;
  readonly clearTimer: (timer: ReaderTimer | null) => void;
  readonly log: (message: string) => void;
}

const STYLE = `
#sidebarContent > .viewWrapper[data-zv-outline-navigation]:not(.hidden) {
  display: flex; flex-direction: column;
}
[data-zv-outline-navigation] > #outlineView {
  flex: 1 1 auto; min-height: 0; height: auto;
}
#outlineView .title[data-zv-outline-kind]::before {
  content: attr(data-zv-outline-kind); display: inline-block;
  margin-inline-end: 6px; padding: 0 4px; border: 1px solid currentColor;
  border-radius: 3px; font-size: 10px; line-height: 16px; opacity: .65;
}
#outlineView .item[data-zv-outline-count]::after {
  content: attr(data-zv-outline-count); flex: none; margin-inline: 6px;
  font-size: 11px; opacity: .65;
}
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

const NATIVE_MOTION_KEYS: Readonly<Record<string, string>> = {
  j: 'ArrowDown',
  k: 'ArrowUp',
  h: 'ArrowLeft',
  l: 'ArrowRight',
};

/** Owns one reversible native-sidebar enhancement, never the host's sidebar or annotation state. */
export class ReaderNativeSidebar {
  readonly #host: ReaderNativeSidebarHost;
  #document: Document | null = null;
  #observer: MutationObserver | null = null;
  #style: HTMLStyleElement | null = null;
  #marksRoot: HTMLElement | null = null;
  #marksSignature = '';
  #decorated = new Set<HTMLElement>();
  #pageLabels: readonly string[] | undefined;
  #language = '';
  #focusRequest: 'outline' | 'marks' | null = null;
  #toggleBuffer = '';
  #toggleTimer: ReaderTimer | null = null;
  #dispatching = false;
  #disposed = false;

  constructor(host: ReaderNativeSidebarHost) {
    this.#host = host;
  }

  start(): void {
    if (this.#disposed || this.#document) return;
    const window = this.#host.reader._iframeWindow as NativeSidebarWindow | undefined;
    if (!window || isDeadObject(window)) return;
    this.#document = window.document;
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
    internal.setSidebarView?.('outline');
    internal.toggleSidebar?.(true);
    this.#focusRequest = group;
    this.refresh();
  }

  focus(_pdfWindow: PdfWindow): void {
    if (this.#disposed) return;
    this.start();
    const internal = this.#host.reader._internalReader;
    internal?.setSidebarView?.('outline');
    internal?.toggleSidebar?.(true);
    this.#focusRequest = 'outline';
    this.refresh();
  }

  /** Leaves native editable, annotation, thumbnail and ordinary native navigation keys untouched. */
  handleKey(event: KeyboardEvent): void {
    const target = asElement(event.target);
    if (this.#disposed || this.#dispatching || !target) return;
    this.#host.onInput();
    if (isEditableElement(target) || compositionOwnsKey(event, false)) return;
    const outline = target.closest('#outlineView');
    const marks = target.closest('#zv-reader-marks');
    if (!outline && !marks) return;
    if (this.handleToggleKey(event)) return;
    if (event.key === 'Escape') {
      this.consume(event);
      this.close();
      return;
    }
    if (outline && this.#host.reader._internalReader?._state?.outline == null) {
      this.consume(event);
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (outline) {
      if (!outline.querySelector('.item')) {
        if (
          Object.hasOwn(NATIVE_MOTION_KEYS, event.key) ||
          event.key === 'Enter' ||
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight'
        )
          this.consume(event);
        return;
      }
      const key = Object.hasOwn(NATIVE_MOTION_KEYS, event.key)
        ? NATIVE_MOTION_KEYS[event.key]
        : undefined;
      if (key) {
        this.consume(event);
        if (key !== 'ArrowDown' && !outline.querySelector('.active'))
          this.dispatchNativeKey(outline, 'ArrowDown');
        this.dispatchNativeKey(outline, key);
      } else if (event.key === 'Enter' && !outline.querySelector('.active')) {
        this.dispatchNativeKey(outline, 'ArrowDown');
      }
      return;
    }
    const key = event.key;
    // Zotero's application-role key handling does not reliably activate plain HTML buttons.
    const actionButton = target.closest<HTMLButtonElement>('button');
    if (key === 'Enter' && actionButton) {
      this.consume(event);
      actionButton.click();
      return;
    }
    if (key === 'j' || key === 'k' || key === 'G' || key === 'End' || key === 'd') {
      const buttons = marks!.querySelectorAll<HTMLButtonElement>('button[data-zv-mark]');
      const current = target.closest<HTMLButtonElement>('button[data-zv-mark]');
      let index = -1;
      if (current) {
        for (let i = 0; i < buttons.length; i += 1)
          if (buttons[i] === current) {
            index = i;
            break;
          }
      }
      if (key === 'j' || key === 'k') {
        this.consume(event);
        const next = Math.max(0, Math.min(buttons.length - 1, index + (key === 'j' ? 1 : -1)));
        buttons.item(next)?.focus();
      } else if (key === 'G' || key === 'End') {
        this.consume(event);
        buttons.item(buttons.length - 1)?.focus();
      } else if (current) {
        this.consume(event);
        this.deleteMark(current.dataset.zvMark ?? '');
      }
    } else if (key === 'x') {
      this.consume(event);
      this.deleteMark(null);
    } else if (/^[a-z0-9]$/.test(key) && key !== 'g' && this.#host.marks.values()[key]) {
      this.consume(event);
      this.jumpMark(key);
    }
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
    let counter = -1;
    const visit = (entries: readonly ReaderNativeOutlineEntry[], depth: number): void => {
      for (const entry of entries) {
        counter += 1;
        if (entry.matched === false && entry.childMatched === false) continue;
        const row = document
          .getElementById(`outline-${counter}`)
          ?.querySelector<HTMLElement>('.item');
        const title = row?.querySelector<HTMLElement>('.title');
        const count = entry.items?.length ?? 0;
        const kind = outlineEntryKind(entry.title, depth, count);
        if (title) {
          this.setAttribute(
            title,
            'data-zv-outline-kind',
            kind ? t(`reader.sidebar.${kind}`, this.#host.language()) : null,
          );
          decorated.add(title);
        }
        if (row) {
          this.setAttribute(
            row,
            'data-zv-outline-count',
            count
              ? t('reader.sidebar.children', this.#host.language()).replace(
                  '{count}',
                  String(count),
                )
              : null,
          );
          decorated.add(row);
        }
        if (entry.expanded && entry.items) visit(entry.items, depth + 1);
      }
    };
    visit(this.#host.reader._internalReader?._state?.outline ?? [], 0);
    for (const old of this.#decorated) if (!decorated.has(old)) this.clearDecoration(old);
    this.#decorated = decorated;
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
    const request = this.#focusRequest;
    const state = this.#host.reader._internalReader?._state;
    if (
      request &&
      state?.sidebarOpen &&
      state.sidebarView === 'outline' &&
      !wrapper.classList.contains('hidden') &&
      (request === 'marks' || state.outline != null)
    ) {
      this.#focusRequest = null;
      const target =
        request === 'marks'
          ? this.#marksRoot.querySelector<HTMLElement>('button[data-zv-mark], summary')
          : outline;
      target?.focus();
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
    this.clearToggleInput();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#focusRequest = null;
    const failure = new CleanupFailure();
    failure.run(() => this.clearToggleInput());
    const observer = this.#observer;
    this.#observer = null;
    failure.run(() => {
      if (observer && !isDeadObject(observer)) observer.disconnect();
    });
    const marks = this.#marksRoot;
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

  private handleToggleKey(event: KeyboardEvent): boolean {
    const key = keyString(event);
    if (!key) return false;
    const bindings = this.#host.bindings();
    let next = appendInputKey(this.#toggleBuffer, key);
    let matches = false;
    let exact: 'outline' | 'marks' | null = null;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const binding in bindings) {
        const action = bindings[binding];
        if (
          !binding.startsWith('reader-normal:') ||
          (action !== 'toggleReaderSidebarOutline' && action !== 'toggleMarksExplorer')
        )
          continue;
        const sequence = binding.slice('reader-normal:'.length);
        if (!bindingMatchesInputPrefix(sequence, next)) continue;
        matches = true;
        if (bindingEqualsInput(sequence, next)) {
          exact = action === 'toggleMarksExplorer' ? 'marks' : 'outline';
          break;
        }
      }
      if (matches || !this.#toggleBuffer) break;
      next = appendInputKey('', key);
    }
    if (!matches) {
      this.clearToggleInput();
      return false;
    }
    this.consume(event);
    this.clearToggleInput();
    if (exact) {
      const pdfWindow = this.#host.activePdfWindow();
      if (pdfWindow) this.toggle(exact, pdfWindow);
    } else {
      this.#toggleBuffer = next;
      const timer = this.#host.schedule(1200, () => {
        if (this.#disposed || this.#toggleTimer !== timer) return;
        this.#toggleBuffer = '';
        this.#toggleTimer = null;
      });
      this.#toggleTimer = timer;
    }
    return true;
  }

  /** Ignores native chrome/annotation/thumbnail work and our own projection mutations. */
  private isOutlineMutation(record: MutationRecord): boolean {
    const target = asElement(record.target) ?? record.target.parentElement;
    if (!target || target.closest('#zv-reader-marks, #annotationsView, #thumbnailsView'))
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

  private clearToggleInput(): void {
    this.#toggleBuffer = '';
    this.#host.clearTimer(this.#toggleTimer);
    this.#toggleTimer = null;
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
    element.removeAttribute('data-zv-outline-navigation');
    element.removeAttribute('data-zv-outline-kind');
    element.removeAttribute('data-zv-outline-count');
  }
}
