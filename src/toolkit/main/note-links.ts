import { isDeadObject } from '../../platform/cross-compartment';
import {
  eventElement,
  linkCursor,
  nearPress,
  textLinkHit,
  textLinkRanges,
  type ClientPoint,
} from '../text-link-hit';
import { parseSafeURI, type SafeURI } from '../uri';

const EDITOR = '.primary-editor.ProseMirror';
const WIDGET = '[contenteditable],input,textarea,button,select,.citation,.highlight,.math-node';

type LinkModifiers = Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

function noteLinkAt(target: Element | null, point: ClientPoint) {
  const editor = target?.closest(EDITOR);
  if (!editor?.isConnected || !target) return null;
  const widget = target.closest(WIDGET);
  if (widget && widget !== editor && editor.contains(widget)) return null;

  const anchor = target.closest('a[href]');
  if (anchor && editor.contains(anchor)) {
    const href = anchor.getAttribute('href') ?? '';
    // In-note heading fragments still belong to the native editor.
    if (href.startsWith('#')) return null;
    const uri = parseSafeURI(href);
    return { editor, href: uri?.href ?? href, uri };
  }

  const paragraph = target.closest('p,h1,h2,h3,h4,h5,h6');
  if (!paragraph || !editor.contains(paragraph)) return null;
  const uri = textLinkHit(paragraph, point, textLinkRanges(paragraph, 'paragraph'));
  return uri ? { editor, href: uri.href, uri } : null;
}

/** Delegated to the exact iframe document; ProseMirror may replace its root at any time. */
export function installNoteLinks(window: Window, open: (uri: SafeURI) => boolean): () => void {
  if (isDeadObject(window)) return () => {};
  const { document } = window;
  const root = document.documentElement;
  if (!document.head || !root) return () => {};

  const mac = /^Mac/.test(window.navigator.platform);
  const cursor = linkCursor(document, `${EDITOR} :hover`);
  const pointer = { clientX: 0, clientY: 0 };
  let disposed = false;
  let composing = false;
  let pointerInside = false;
  let modified = false;
  let pointing = false;
  let press: { point: ClientPoint; editor: Element; href: string } | null = null;

  function current(): boolean {
    return !disposed && !isDeadObject(window) && window.document === document;
  }

  function modifier(event: LinkModifiers): boolean {
    return (
      !event.altKey &&
      !event.shiftKey &&
      (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
    );
  }

  function accept(event: MouseEvent): boolean {
    return (
      current() &&
      !composing &&
      event.isTrusted &&
      event.cancelable &&
      !event.defaultPrevented &&
      event.button === 0 &&
      modifier(event)
    );
  }

  function show(target: Element | null): void {
    cursor.show(
      pointerInside && !pointing && modified && !composing && !!noteLinkAt(target, pointer)?.uri,
    );
  }

  function refreshCursor(): void {
    show(
      pointerInside && !pointing && modified && !composing
        ? document.elementFromPoint(pointer.clientX, pointer.clientY)
        : null,
    );
  }

  function down(event: PointerEvent): void {
    if (!event.isTrusted || !event.isPrimary || !current()) return;
    pointing = true;
    cursor.show(false);
    press = null;
    if (!accept(event)) return;
    const link = noteLinkAt(eventElement(event.target), event);
    if (!link) return;
    press = { point: event, editor: link.editor, href: link.href };
    // Cancel compatibility mousedown (caret movement and the native ProseMirror link path).
    // The subsequent click still fires; do not dispatch anything until that click is confirmed.
    event.preventDefault();
  }

  function click(event: MouseEvent): void {
    if (!event.isTrusted) return;
    const start = press;
    press = null;
    if (!start || !accept(event) || event.detail !== 1 || !nearPress(start.point, event)) return;
    const link = noteLinkAt(eventElement(event.target), event);
    if (link?.editor !== start.editor || link.href !== start.href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Do not fall through to native URI dispatch for a refused anchor.
    if (link.uri) open(link.uri);
  }

  function move(event: PointerEvent): void {
    if (!current() || !event.isTrusted || !event.isPrimary) return;
    if (press && !nearPress(press.point, event)) press = null;
    pointerInside = true;
    pointing = event.buttons !== 0;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    modified = modifier(event);
    show(eventElement(event.target));
  }

  function keys(event: KeyboardEvent): void {
    if (!current() || !event.isTrusted) return;
    const next = modifier(event);
    if (modified === next) return;
    modified = next;
    refreshCursor();
  }

  function compositionStart(event: CompositionEvent): void {
    if (!current() || !event.isTrusted) return;
    composing = true;
    press = null;
    cursor.show(false);
  }

  function compositionEnd(event: CompositionEvent): void {
    if (!current() || !event.isTrusted) return;
    composing = false;
    refreshCursor();
  }

  function leave(): void {
    press = null;
    pointerInside = false;
    cursor.show(false);
  }

  function blur(): void {
    modified = false;
    composing = false;
    leave();
  }

  function scroll(): void {
    if (!current()) return;
    press = null;
    refreshCursor();
  }

  window.addEventListener('pointerdown', down, true);
  window.addEventListener('click', click, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', move, true);
  window.addEventListener('pointercancel', leave, true);
  window.addEventListener('dragstart', leave, true);
  window.addEventListener('keydown', keys, true);
  window.addEventListener('keyup', keys, true);
  window.addEventListener('compositionstart', compositionStart, true);
  window.addEventListener('compositionend', compositionEnd, true);
  window.addEventListener('scroll', scroll, true);
  window.addEventListener('blur', blur);
  root.addEventListener('pointerleave', leave);
  return () => {
    if (disposed) return;
    disposed = true;
    press = null;
    if (isDeadObject(window)) return;
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', move, true);
    window.removeEventListener('pointercancel', leave, true);
    window.removeEventListener('dragstart', leave, true);
    window.removeEventListener('keydown', keys, true);
    window.removeEventListener('keyup', keys, true);
    window.removeEventListener('compositionstart', compositionStart, true);
    window.removeEventListener('compositionend', compositionEnd, true);
    window.removeEventListener('scroll', scroll, true);
    window.removeEventListener('blur', blur);
    root.removeEventListener('pointerleave', leave);
    cursor.dispose();
  };
}
