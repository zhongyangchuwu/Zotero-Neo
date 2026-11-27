import { cloneInto, isDeadObject } from '../../platform/cross-compartment';
import {
  eventElement,
  linkCursor,
  nearPress,
  textLinkHit,
  textLinkRanges,
  type ClientPoint,
  type TextLinkRange,
} from '../text-link-hit';
import { createCommentLinkUnderlines } from './comment-link-underlines';
import type { SafeURI } from '../uri';
import type { ReaderRuntime } from './contracts';
import { readerIsClosed, readerWindow } from './host';

const COMMENT = ':is(#annotations .annotation, .annotation-popup) .comment';
const CONTENT = `${COMMENT} .editor.read-only .content[role="textbox"][aria-readonly="true"][contenteditable="false"]`;
const EDITABLE = 'input,textarea,[contenteditable]:not([contenteditable="false" i])';
const HIGHLIGHT = 'zotero-neo-comment-link';
const STYLE = `
  :root {
    --zv-comment-link-blue: light-dark(
      color-mix(in srgb, var(--accent-blue, #4072e5) 84%, black),
      color-mix(in srgb, var(--accent-blue, #4072e5) 64%, white)
    );
  }
  @media (forced-colors: active) {
    :root { --zv-comment-link-blue: LinkText; }
  }
  ::highlight(${HIGHLIGHT}) { color: var(--zv-comment-link-blue); }
  [data-zv-comment-link-underlines] {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
    color: var(--zv-comment-link-blue);
  }
`;

// The project's DOM lib does not include the iterable declarations for these WebIDL collections.
interface CommentWindow extends Window {
  readonly MutationObserver: typeof MutationObserver;
  readonly ResizeObserver?: typeof ResizeObserver;
  readonly CSS?: { readonly highlights?: Map<string, Highlight> };
  readonly Highlight?: new () => Highlight & Pick<Set<AbstractRange>, 'add' | 'clear'>;
}

function commentContent(target: Element | null): Element | null {
  if (!target?.isConnected || target.closest(EDITABLE)) return null;
  const content = target.closest<HTMLElement>(CONTENT);
  return content?.isContentEditable ? null : content;
}

function hasComment(node: Node): boolean {
  const element = eventElement(node);
  return !!(element?.closest('.comment') || element?.querySelector('.comment'));
}

function touchesComment(record: MutationRecord): boolean {
  if (eventElement(record.target)?.closest('.comment')) return true;
  if (record.type === 'attributes') {
    // Losing the comment class can make the current element ineligible.
    return (
      hasComment(record.target) ||
      (record.attributeName === 'class' && !!record.oldValue?.split(/\s+/).includes('comment'))
    );
  }
  for (const nodes of [record.addedNodes, record.removedNodes]) {
    for (let index = 0; index < nodes.length; index++) {
      if (hasComment(nodes[index]!)) return true;
    }
  }
  return false;
}

/** Sidebar previews and both split popups live in the outer Reader UI document. */
export function installReaderCommentLinks(
  reader: ReaderRuntime,
  open: (uri: SafeURI) => boolean,
): () => void {
  const candidate = readerWindow(reader) as CommentWindow | undefined;
  if (!candidate || isDeadObject(candidate)) return () => {};
  const window = candidate;
  const { document } = window;
  const root = document.documentElement;
  const registry = window.CSS?.highlights;
  if (!document.head || !document.body || !root || !registry || !window.Highlight) return () => {};

  const cursor = linkCursor(document, `${CONTENT}:hover, ${CONTENT} :hover`);
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const highlight = new window.Highlight();
  registry.set(HIGHLIGHT, highlight);
  const underlines = createCommentLinkUnderlines(document);

  const ranges = new Map<Element, readonly TextLinkRange[]>();
  let press: { point: ClientPoint; content: Element; href: string } | null = null;
  let disposed = false;
  let frame: number | null = null;
  const resize = window.ResizeObserver ? new window.ResizeObserver(schedulePaint) : null;

  function current(): boolean {
    return (
      !disposed &&
      !isDeadObject(window) &&
      !readerIsClosed(reader) &&
      readerWindow(reader) === window &&
      window.document === document
    );
  }

  function schedulePaint(): void {
    if (frame !== null || !current()) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      if (current()) underlines.paint(window, ranges);
    });
  }

  function rebuild(): void {
    ranges.clear();
    highlight.clear();
    resize?.disconnect();
    const contents = document.querySelectorAll(CONTENT);
    for (let index = 0; index < contents.length; index++) {
      const content = contents[index]!;
      if (!commentContent(content)) continue;
      const links = textLinkRanges(content, 'comment');
      if (!links.length) continue;
      ranges.set(content, links);
      resize?.observe(content);
      for (const { range } of links) highlight.add(range);
    }
    cursor.show(false);
    schedulePaint();
  }

  const observer = new window.MutationObserver((records) => {
    if (!current()) return;
    for (const record of records) {
      if (!touchesComment(record)) continue;
      rebuild();
      break;
    }
  });
  observer.observe(
    root,
    cloneInto(
      {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['aria-readonly', 'class', 'contenteditable', 'id', 'role'],
      },
      window,
    ),
  );
  rebuild();

  function hit(event: MouseEvent) {
    const content = commentContent(eventElement(event.target));
    const links = content && ranges.get(content);
    const uri = content && links && textLinkHit(content, event, links);
    return content && uri ? { content, uri } : null;
  }

  function primary(event: MouseEvent): boolean {
    return (
      event.isTrusted &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    );
  }

  function down(event: PointerEvent): void {
    press = null;
    if (
      !current() ||
      !event.isPrimary ||
      !primary(event) ||
      document.getSelection()?.isCollapsed === false
    )
      return;
    const link = hit(event);
    if (link) press = { point: event, content: link.content, href: link.uri.href };
  }

  function move(event: PointerEvent): void {
    if (!current() || !event.isPrimary) return;
    if (press && !nearPress(press.point, event)) press = null;
    cursor.show(event.buttons === 0 && !!hit(event));
  }

  function click(event: MouseEvent): void {
    const start = press;
    press = null;
    if (
      !start ||
      !current() ||
      !primary(event) ||
      !event.cancelable ||
      event.detail !== 1 ||
      !nearPress(start.point, event) ||
      document.getSelection()?.isCollapsed === false
    )
      return;
    const link = hit(event);
    if (link?.content !== start.content || link.uri.href !== start.href || !open(link.uri)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function reset(): void {
    press = null;
    cursor.show(false);
  }

  function layoutChanged(): void {
    reset();
    schedulePaint();
  }

  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('click', click, true);
  window.addEventListener('pointercancel', reset, true);
  window.addEventListener('dragstart', reset, true);
  window.addEventListener('scroll', layoutChanged, true);
  window.addEventListener('resize', layoutChanged);
  document.addEventListener('visibilitychange', schedulePaint);
  window.addEventListener('blur', reset);
  root.addEventListener('pointerleave', reset);
  return () => {
    if (disposed) return;
    disposed = true;
    press = null;
    ranges.clear();
    if (isDeadObject(window)) return;
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('pointercancel', reset, true);
    window.removeEventListener('dragstart', reset, true);
    window.removeEventListener('scroll', layoutChanged, true);
    window.removeEventListener('resize', layoutChanged);
    document.removeEventListener('visibilitychange', schedulePaint);
    window.removeEventListener('blur', reset);
    root.removeEventListener('pointerleave', reset);
    observer.disconnect();
    resize?.disconnect();
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (registry.get(HIGHLIGHT) === highlight) registry.delete(HIGHLIGHT);
    underlines.dispose();
    style.remove();
    cursor.dispose();
  };
}
