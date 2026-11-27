import { CleanupFailure } from '../../core/cleanup';
import {
  cloneInto,
  cloneIntoWithFunctions,
  isDeadObject,
  nativeObjectIdentity,
} from '../../platform/cross-compartment';
import { asElement, asKeyboardEvent } from '../../platform/dom';
import type { ReaderNativeOutlineEntry } from '../../reader/types';
import type { ReaderRuntime } from './contracts';
import { readerIsClosed, readerOwnerWindow, readerWindow } from './host';
import { outlineReadingPosition } from './outline-follow-position';
import { readerPresentationView } from './presentation';
import type { NativeReaderRuntime, NativeReaderViewRuntime } from './private-types';
import { readerOutlineMutation } from './sidebar';
import { visibleElement, visibleWindow } from './visibility';

const FOLLOW = 'data-zv-outline-follow';
const CURRENT = 'data-zv-outline-current';
const STYLE = `
#outlineView[${FOLLOW}] .item.active:not([${CURRENT}]) > .title { outline: none; }
#outlineView[${FOLLOW}] .item[${CURRENT}] > .title {
  outline: 3px solid var(--accent-blue50, Highlight);
  border-radius: 5px;
}
`;

interface OutlineEntry {
  readonly depth: number;
  readonly parent: number | null;
  readonly item: ReaderNativeOutlineEntry;
  readonly rowID: number | null;
}

type SelectOutlineEntry = (
  entries: readonly { readonly depth: number }[],
  compare: (candidate: number, other: number | null) => number | null,
) => number | null;

interface Presentation {
  readonly primary: boolean;
  readonly view: NativeReaderViewRuntime;
  readonly window: Window;
  readonly document: Document;
}

interface OutlineNativeView extends NativeReaderViewRuntime {
  readonly _iframe?: HTMLIFrameElement;
}

function activePresentation(reader: ReaderRuntime): Presentation | null {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  if (!internal) return null;
  const primary =
    internal._lastViewPrimary ??
    internal._state?.primary ??
    (!internal._lastView ||
      (internal._lastView !== internal._secondaryView &&
        internal._lastView !== internal._secondarySDTView));
  const view = readerPresentationView(reader, primary) as OutlineNativeView | undefined;
  if (!view || isDeadObject(view)) return null;
  const window = view._iframeWindow;
  if (!window || isDeadObject(window) || !visibleWindow(window)) return null;
  const frame = view._iframe;
  if (frame && !frame.isConnected) return null;
  const document = window.document;
  if (!document?.body || (frame && frame.contentDocument !== document)) return null;
  return { primary, view, window, document };
}

function outlineEntries(outline: readonly ReaderNativeOutlineEntry[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let row = -1;
  const visit = (
    items: readonly ReaderNativeOutlineEntry[],
    parent: number | null,
    depth: number,
    renderedList: boolean,
  ): void => {
    for (const item of items) {
      // OutlineView.renderItems advances before deciding whether to include a search result.
      // It only visits child rows when it also renders their parent and that parent is open.
      if (renderedList) row += 1;
      const rendered = renderedList && (item.matched !== false || item.childMatched !== false);
      const index = entries.length;
      entries.push({ item, parent, depth, rowID: rendered ? row : null });
      if (item.items?.length) visit(item.items, index, depth + 1, rendered && !!item.expanded);
    }
  };
  visit(outline, null, 0, true);
  return entries;
}

function renderedRow(
  outline: HTMLElement,
  entries: readonly OutlineEntry[],
  selected: number | null,
): HTMLElement | null {
  const document = outline.ownerDocument;
  let first: HTMLElement | null = null;
  let descendantList: HTMLElement | null = null;
  for (let index = selected; index !== null; ) {
    const entry: OutlineEntry | undefined = entries[index];
    if (!entry) return null;
    const id = entry.rowID;
    const li = id === null ? null : document.getElementById(`outline-${id}`);
    const row = li?.firstElementChild as HTMLElement | null | undefined;
    if (
      !li ||
      !outline.contains(li) ||
      li.getAttribute('aria-label') !== entry.item.title ||
      !row?.classList.contains('item') ||
      row.getAttribute('data-id') !== String(id) ||
      (descendantList && descendantList.parentElement?.parentElement !== li)
    ) {
      first = null;
      descendantList = null;
    } else {
      first ??= row;
      descendantList = li.parentElement;
    }
    index = entry.parent;
  }
  return descendantList?.parentElement === outline ? first : null;
}

function revealNearest(window: Window, outline: HTMLElement, row: HTMLElement): void {
  if (outline.closest('#sidebarContainer')?.matches(':hover')) return;
  const sidebar = outline.closest('#sidebarContent');
  for (let scroller: HTMLElement | null = outline; scroller; scroller = scroller.parentElement) {
    if (
      scroller.clientHeight > 0 &&
      scroller.scrollHeight > scroller.clientHeight &&
      /^(auto|scroll|overlay)$/.test(window.getComputedStyle(scroller)?.overflowY ?? '')
    ) {
      const rect = row.getBoundingClientRect();
      const top = scroller.getBoundingClientRect().top + scroller.clientTop;
      const bottom = top + scroller.clientHeight;
      if (rect.top < top && rect.bottom > bottom) return;
      if (rect.top < top) scroller.scrollTop += rect.top - top;
      else if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
      return;
    }
    if (scroller === sidebar) return;
  }
}

/** A visual lease in the outer Reader document, independent of native selection and input. */
class OutlineSurface {
  readonly #cleanups: (() => void)[] = [];
  #presentation: (Presentation & { readonly dispose: () => void }) | null = null;
  #outline: readonly ReaderNativeOutlineEntry[] | null = null;
  #entries: readonly OutlineEntry[] = [];
  #row: HTMLElement | null = null;
  #root: HTMLElement | null = null;
  #nativeReveal: { readonly row: HTMLElement; readonly dispose: () => void } | null = null;
  #outlineArrow: KeyboardEvent | null = null;
  #style: HTMLStyleElement | null = null;
  #frame: number | null = null;
  #disposed = false;

  constructor(
    readonly window: Window,
    readonly document: Document,
    readonly reader: ReaderRuntime,
    readonly select: SelectOutlineEntry,
    readonly reportError: (error: unknown) => void,
  ) {}

  #current(): boolean {
    return (
      !this.#disposed &&
      !readerIsClosed(this.reader) &&
      readerWindow(this.reader) === this.window &&
      !isDeadObject(this.window) &&
      this.window.document === this.document
    );
  }

  readonly #request = (): void => {
    if (!this.#current() || this.#frame !== null) return;
    this.#frame = this.window.requestAnimationFrame(() => {
      this.#frame = null;
      if (!this.#current()) return;
      try {
        this.sync(true);
      } catch (error) {
        const failure = new CleanupFailure();
        failure.run(() => this.#clear());
        failure.run(() => this.reportError(error));
        failure.rethrow();
      }
    });
  };

  readonly #captureNativeArrow = (event: Event): void => {
    const key = asKeyboardEvent(event);
    this.#outlineArrow =
      key &&
      (key.key === 'ArrowUp' || key.key === 'ArrowDown') &&
      this.#root?.contains(asElement(event.target))
        ? key
        : null;
  };

  start(): void {
    const window = this.window as Window & typeof globalThis;
    const { document } = this;
    const observer = new window.MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            readerOutlineMutation(record) ||
            (record.type === 'attributes' && !!asElement(record.target)?.closest('#outlineView')),
        )
      ) {
        if (this.#current() && this.#root) {
          try {
            this.#syncNativeReveal(this.#root);
          } catch (error) {
            this.reportError(error);
          }
        }
        this.#request();
      }
    });
    this.#cleanups.push(() => observer.disconnect());
    observer.observe(
      document.body,
      cloneInto(
        {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'id', 'aria-label'],
        },
        window,
      ),
    );
    for (const type of ['focusin', 'visibilitychange']) {
      this.#cleanups.push(() => document.removeEventListener(type, this.#request, true));
      document.addEventListener(type, this.#request, true);
    }
    this.#cleanups.push(() => window.removeEventListener('resize', this.#request));
    window.addEventListener('resize', this.#request);
    this.#cleanups.push(() =>
      document.removeEventListener('keydown', this.#captureNativeArrow, true),
    );
    document.addEventListener(
      'keydown',
      this.#captureNativeArrow,
      cloneInto({ capture: true, passive: true }, window),
    );
    this.sync(false);
  }

  sync(render: boolean): void {
    if (!this.#current()) return;
    const outline = this.document.getElementById('outlineView');
    const state = (this.reader as NativeReaderRuntime)._internalReader?._state;
    const data =
      !this.document.hidden &&
      state?.sidebarOpen &&
      state.sidebarView === 'outline' &&
      outline &&
      !outline.closest('.viewWrapper.hidden')
        ? (state.outline ?? null)
        : null;
    const next =
      outline && data?.length && visibleElement(this.window, outline)
        ? activePresentation(this.reader)
        : null;
    const previous = this.#presentation;
    const changed =
      previous?.view !== next?.view ||
      previous?.window !== next?.window ||
      previous?.document !== next?.document ||
      previous?.primary !== next?.primary;
    if (changed) {
      this.#presentation = null;
      const failure = new CleanupFailure();
      failure.run(() => this.#clear());
      failure.run(() => previous?.dispose());
      failure.rethrow();
      if (next) this.#watch(next);
    }
    const outlineChanged = this.#outline !== data;
    if (outlineChanged) {
      this.#outline = data;
      this.#entries = data ? outlineEntries(data) : [];
    }
    if (!next || !outline) {
      this.#clear();
      return;
    }
    if (!render) {
      if (changed || outlineChanged) this.#request();
      return;
    }
    const compare = outlineReadingPosition(next.view, next.window, next.document);
    const entries = this.#entries;
    const selected = compare
      ? this.select(entries, (candidate, other) => {
          const location = entries[candidate]?.item.location;
          const reference = other === null ? null : entries[other]?.item.location;
          return location && (other === null || reference)
            ? compare(location, reference ?? null)
            : null;
        })
      : null;
    const row = renderedRow(outline, entries, selected);
    if (this.#row === row && this.#root === outline) return;
    if (this.#root !== outline || !row) this.#clear();
    else this.#row?.removeAttribute(CURRENT);
    if (!row) return;
    if (!this.#style) {
      const style = this.document.createElement('style');
      style.textContent = STYLE;
      this.document.head.append(style);
      this.#style = style;
    }
    this.#row = row;
    this.#root = outline;
    row.setAttribute(CURRENT, '');
    outline.setAttribute(FOLLOW, '');
    this.#syncNativeReveal(outline);
    revealNearest(this.window, outline, row);
  }

  /**
   * Fence the pinned OutlineView effect's delayed `.active.scrollIntoView()` at its actual row.
   * Arrow-key reveals use the same options but execute synchronously within key dispatch.
   * Do not patch a DOM prototype or native Outline state; the expando belongs to one row only.
   */
  #syncNativeReveal(root: HTMLElement): void {
    const row = root.isConnected ? root.querySelector<HTMLElement>('.item.active') : null;
    const previous = this.#nativeReveal;
    if (row === previous?.row) return;
    this.#nativeReveal = null;
    previous?.dispose();
    if (!row || typeof row.scrollIntoView !== 'function') return;

    const nativeRow = nativeObjectIdentity(row);
    const original = nativeRow.scrollIntoView;
    const descriptor = Object.getOwnPropertyDescriptor(nativeRow, 'scrollIntoView');
    let active = true;
    const { scrollIntoView } = cloneIntoWithFunctions(
      {
        scrollIntoView: (options?: ScrollIntoViewOptions | boolean): void => {
          if (
            active &&
            typeof options === 'object' &&
            options?.block === 'nearest' &&
            options.inline === 'nearest' &&
            !this.#outlineArrow?.eventPhase &&
            this.#current() &&
            this.#root === root &&
            root.isConnected &&
            row.classList.contains('active')
          )
            return;
          original.call(nativeRow, options);
        },
      },
      this.window,
    );
    const wrapper = nativeObjectIdentity(scrollIntoView);
    Object.defineProperty(nativeRow, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: wrapper,
    });
    this.#nativeReveal = {
      row,
      dispose: () => {
        active = false;
        if (isDeadObject(nativeRow)) return;
        const current = nativeRow.scrollIntoView;
        if (typeof current !== 'function' || nativeObjectIdentity(current) !== wrapper) return;
        if (descriptor) Object.defineProperty(nativeRow, 'scrollIntoView', descriptor);
        else Reflect.deleteProperty(nativeRow, 'scrollIntoView');
      },
    };
  }

  #watch(presentation: Presentation): void {
    const { window, document, view, primary } = presentation;
    const listener = (): void => {
      if (
        this.#presentation === owned &&
        this.#current() &&
        !isDeadObject(window) &&
        window.document === document &&
        readerPresentationView(this.reader, primary) === view
      )
        this.#request();
    };
    const observerWindow = window as Window & typeof globalThis;
    let resize: ResizeObserver | undefined;
    const owned = {
      ...presentation,
      dispose: (): void => {
        const failure = new CleanupFailure();
        failure.run(() => resize?.disconnect());
        failure.run(() => {
          if (!isDeadObject(window)) window.removeEventListener('scroll', listener, true);
        });
        failure.run(() => {
          if (!isDeadObject(window)) window.removeEventListener('resize', listener);
        });
        failure.rethrow();
      },
    };
    try {
      window.addEventListener(
        'scroll',
        listener,
        cloneInto({ capture: true, passive: true }, window),
      );
      window.addEventListener('resize', listener);
      if (observerWindow.ResizeObserver) {
        resize = new observerWindow.ResizeObserver(listener);
        resize.observe(document.getElementById('viewer') ?? document.body);
        const container = document.getElementById('viewerContainer');
        if (container) resize.observe(container);
      }
      this.#presentation = owned;
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => {
        throw error;
      });
      failure.run(owned.dispose);
      failure.rethrow();
    }
  }

  #clear(): void {
    const row = this.#row;
    const root = this.#root;
    const nativeReveal = this.#nativeReveal;
    this.#row = null;
    this.#root = null;
    this.#nativeReveal = null;
    this.#outlineArrow = null;
    const failure = new CleanupFailure();
    failure.run(() => nativeReveal?.dispose());
    failure.run(() => {
      if (root && !isDeadObject(root)) root.removeAttribute(FOLLOW);
    });
    failure.run(() => {
      if (row && !isDeadObject(row)) row.removeAttribute(CURRENT);
    });
    failure.rethrow();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const presentation = this.#presentation;
    const frame = this.#frame;
    const style = this.#style;
    this.#presentation = null;
    this.#frame = null;
    this.#style = null;
    const failure = new CleanupFailure();
    if (frame !== null && !isDeadObject(this.window))
      failure.run(() => this.window.cancelAnimationFrame(frame));
    failure.run(() => this.#clear());
    failure.run(() => presentation?.dispose());
    for (const cleanup of this.#cleanups.splice(0)) failure.run(cleanup);
    failure.run(() => {
      if (style && !isDeadObject(style)) style.remove();
    });
    failure.rethrow();
  }
}

/** Observes the exact current Reader sidebar and displayed view without acquiring any input hooks. */
export function observeReaderOutline(
  reader: ReaderRuntime,
  select: SelectOutlineEntry,
  reportError: (error: unknown) => void,
): () => void {
  const timerWindow = readerOwnerWindow(reader) ?? readerWindow(reader);
  if (!timerWindow || isDeadObject(timerWindow) || timerWindow.closed) return () => {};
  let surface: OutlineSurface | null = null;
  let disposed = false;
  const poll = (): void => {
    if (disposed) return;
    try {
      const window = readerWindow(reader);
      const document =
        window && !isDeadObject(window) && !window.closed && !readerIsClosed(reader)
          ? window.document
          : null;
      if (surface && (surface.window !== window || surface.document !== document)) {
        const retired = surface;
        surface = null;
        retired.dispose();
      }
      if (!surface && window && document?.head && document.body) {
        const next = new OutlineSurface(window, document, reader, select, reportError);
        try {
          next.start();
        } catch (error) {
          const failure = new CleanupFailure();
          failure.run(() => {
            throw error;
          });
          failure.run(() => next.dispose());
          failure.rethrow();
        }
        surface = next;
      } else surface?.sync(false);
    } catch (error) {
      reportError(error);
    }
  };
  const timer = timerWindow.setInterval(poll, 250);
  poll();
  return () => {
    if (disposed) return;
    disposed = true;
    const retired = surface;
    surface = null;
    const failure = new CleanupFailure();
    failure.run(() => {
      if (!isDeadObject(timerWindow)) timerWindow.clearInterval(timer);
    });
    failure.run(() => retired?.dispose());
    failure.rethrow();
  };
}
