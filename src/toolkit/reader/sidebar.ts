import { CleanupFailure } from '../../core/cleanup';
import { cloneInto, isDeadObject } from '../../platform/cross-compartment';
import { asElement } from '../../platform/dom';
import type { ReaderNativeOutlineEntry } from '../../reader/types';
import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime } from './private-types';
import { readerWindow } from './host';

export type ReaderSidebarPane = 'outline' | 'annotations' | 'thumbnails';
export interface ReaderSidebarState {
  readonly sidebarOpen?: boolean;
  readonly sidebarView?: ReaderSidebarPane;
  readonly outline?: readonly ReaderNativeOutlineEntry[] | null;
}
export function readerSidebarState(reader: ReaderRuntime): ReaderSidebarState | undefined {
  return (reader as NativeReaderRuntime)._internalReader?._state;
}
export function readerPageLabels(reader: ReaderRuntime): readonly string[] | undefined {
  return (reader as NativeReaderRuntime)._internalReader?._state?.pageLabels;
}
export function setReaderSidebar(reader: ReaderRuntime, pane: ReaderSidebarPane): void {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  internal?.setSidebarView?.(pane);
  internal?.toggleSidebar?.(true);
}
export function closeReaderSidebar(reader: ReaderRuntime): void {
  (reader as NativeReaderRuntime)._internalReader?.toggleSidebar?.(false);
}
export function readerSidebarContainsTarget(
  reader: ReaderRuntime,
  target: EventTarget | null,
): boolean {
  const element = asElement(target);
  const window = readerWindow(reader);
  return (
    !!element &&
    !isDeadObject(element) &&
    !!window &&
    !isDeadObject(window) &&
    element.ownerDocument === window.document &&
    !!element.closest?.('#sidebarContainer')
  );
}
export function readerSidebarPaneForTarget(
  reader: ReaderRuntime,
  target: Element,
): ReaderSidebarPane | null {
  const state = readerSidebarState(reader);
  if (!state?.sidebarOpen || target.closest('.viewWrapper.hidden')) return null;
  if (state.sidebarView === 'outline' && target.closest('#outlineView')) return 'outline';
  if (state.sidebarView === 'annotations' && target.closest('#annotationsView'))
    return 'annotations';
  if (state.sidebarView === 'thumbnails' && target.closest('#thumbnailsView')) return 'thumbnails';
  return null;
}
export function readerSidebarTargetHidden(target: Element): boolean {
  return !!target.closest('.viewWrapper.hidden');
}
export function readerOutlineContainer(document: Document): HTMLElement | null {
  return document.getElementById('outlineView')?.parentElement ?? null;
}
export function readerSidebarFocusTarget(
  document: Document,
  pane: ReaderSidebarPane,
): HTMLElement | null {
  if (pane === 'outline') return document.getElementById('outlineView');
  if (pane === 'annotations')
    return (
      document.querySelector<HTMLElement>('#annotationsView .annotation.selected') ??
      document.querySelector<HTMLElement>('#annotationsView .annotation') ??
      document.getElementById('annotationsView')
    );
  return document.querySelector<HTMLElement>('#thumbnailsView .thumbnails');
}

/** Sends native navigation to the exact pane; establishes its active row before Enter. */
export function dispatchReaderSidebarKey(
  reader: ReaderRuntime,
  target: Element,
  key: string,
): void {
  const window = readerWindow(reader) as (Window & typeof globalThis) | undefined;
  if (!window || isDeadObject(window)) return;
  const outline = target.closest('#outlineView');
  if (outline && !outline.querySelector('.item')) return;
  const dispatch = (key: string): void => {
    (outline ?? target).dispatchEvent(
      new window.KeyboardEvent(
        'keydown',
        cloneInto({ key, bubbles: true, cancelable: true }, window),
      ),
    );
  };
  if (outline && key !== 'ArrowDown' && !outline.querySelector('.active')) dispatch('ArrowDown');
  if (key !== 'Enter' || outline?.querySelector('.active')) dispatch(key);
}

function containsOutlineNode(nodes: NodeList): boolean {
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
export function readerOutlineMutation(record: MutationRecord): boolean {
  const target = asElement(record.target) ?? record.target.parentElement;
  if (
    !target ||
    target.closest('#zv-reader-marks, #zv-reader-captions, #annotationsView, #thumbnailsView')
  )
    return false;
  if (target.closest('#outlineView')) return record.type !== 'attributes';
  if (target.parentElement?.id === 'sidebarContent') return true;
  return (
    record.type === 'childList' &&
    (containsOutlineNode(record.addedNodes) || containsOutlineNode(record.removedNodes))
  );
}

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
export interface ReaderOutlineDecoration {
  readonly rowIndex: number;
  readonly badge: { readonly kind: string; readonly label: string; readonly text: string } | null;
  readonly count: { readonly label: string; readonly text: string } | null;
}

/** Reversible host decoration only; authored hierarchy/kind/ordinal policy stays in the feature. */
export class ReaderSidebarDecoration {
  #style: HTMLStyleElement | null = null;
  #decorated = new Set<HTMLElement>();
  update(document: Document, rows: readonly ReaderOutlineDecoration[]): HTMLElement | null {
    const wrapper = readerOutlineContainer(document);
    if (!wrapper) return null;
    if (!this.#style) {
      this.#style = document.createElement('style');
      this.#style.id = 'zv-native-sidebar-style';
      this.#style.textContent = STYLE;
      document.head.appendChild(this.#style);
    }
    wrapper.setAttribute('data-zv-outline-navigation', '');
    const decorated = new Set<HTMLElement>([wrapper]);
    const attribute = (element: HTMLElement, name: string, value: string): void => {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    };
    for (const descriptor of rows) {
      const row = document
        .getElementById(`outline-${descriptor.rowIndex}`)
        ?.querySelector<HTMLElement>('.item');
      const title = row?.querySelector<HTMLElement>('.title');
      if (!row || !title) continue;
      let badge = row.querySelector<HTMLElement>('[data-zv-outline-badge]');
      if (descriptor.badge) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'zv-outline-badge';
          badge.setAttribute('role', 'img');
          badge.setAttribute('data-zv-outline-badge', '');
        }
        const parent = title.parentElement;
        if (parent && (badge.parentElement !== parent || badge.nextSibling !== title))
          parent.insertBefore(badge, title);
        attribute(badge, 'data-zv-outline-kind', descriptor.badge.kind);
        attribute(badge, 'aria-label', descriptor.badge.label);
        attribute(badge, 'title', descriptor.badge.label);
        if (badge.textContent !== descriptor.badge.text) badge.textContent = descriptor.badge.text;
        decorated.add(badge);
      } else badge?.remove();
      let count = row.querySelector<HTMLElement>('[data-zv-outline-count]');
      if (descriptor.count) {
        if (!count) {
          count = document.createElement('span');
          count.className = 'zv-outline-count';
          count.setAttribute('role', 'img');
          count.setAttribute('data-zv-outline-count', '');
        }
        const parent = title.parentElement;
        if (parent && (count.parentElement !== parent || count.previousSibling !== title))
          parent.insertBefore(count, title.nextSibling);
        attribute(count, 'aria-label', descriptor.count.label);
        attribute(count, 'title', descriptor.count.label);
        if (count.textContent !== descriptor.count.text) count.textContent = descriptor.count.text;
        decorated.add(count);
      } else count?.remove();
    }
    for (const old of this.#decorated) if (!decorated.has(old)) this.clear(old);
    this.#decorated = decorated;
    return wrapper;
  }
  dispose(): void {
    const failure = new CleanupFailure();
    const style = this.#style;
    this.#style = null;
    const decorated = this.#decorated;
    this.#decorated = new Set();
    for (const element of decorated) failure.run(() => this.clear(element));
    failure.run(() => {
      if (style && !isDeadObject(style)) style.remove();
    });
    failure.rethrow();
  }
  private clear(element: HTMLElement): void {
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
