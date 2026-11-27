import { extractLinks, parseSafeURI, type SafeURI } from './uri';

const INLINE = /^(?:b|strong|i|em|u|s|del|strike|sup|sub|code|span|mark)$/;
const ISLAND = '[contenteditable],.citation,.highlight,.math-node';

export type ClientPoint = Pick<MouseEvent, 'clientX' | 'clientY'>;

export interface TextLinkRange {
  readonly range: Range;
  readonly uri: SafeURI;
}

export function eventElement(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  return node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
}

export function nearPress(press: ClientPoint, point: ClientPoint): boolean {
  const dx = press.clientX - point.clientX;
  const dy = press.clientY - point.clientY;
  return dx * dx + dy * dy <= 16;
}

/** Projects offsets into unchanged DOM, keeping links within one logical line of source text. */
export function textLinkRanges(root: Element, surface: 'comment' | 'paragraph'): TextLinkRange[] {
  const result: TextLinkRange[] = [];
  const parts: { node: Text; start: number; end: number }[] = [];
  let text = '';

  function flush(): void {
    for (const { start, end, uri } of extractLinks(text)) {
      // Note Markdown rendering belongs to the native editor; only bare URLs are inferred there.
      if (surface === 'paragraph' && parseSafeURI(text.slice(start, end))?.href !== uri.href)
        continue;
      const first = parts.find((part) => start < part.end);
      const last = parts.find((part) => end <= part.end);
      if (!first || !last) continue;
      const range = root.ownerDocument.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      result.push({ range, uri });
    }
    parts.length = 0;
    text = '';
  }

  function walk(element: Element): void {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        const node = child as Text;
        if (node.length) {
          const start = text.length;
          text += node.data;
          parts.push({ node, start, end: text.length });
        }
      } else if (child.nodeType === 1) {
        const inline = child as Element;
        if (INLINE.test(inline.localName) && !inline.matches(ISLAND)) {
          walk(inline);
        } else if (inline.localName !== 'wbr') {
          flush();
          if (surface === 'comment' && inline.localName === 'div' && !inline.matches(ISLAND)) {
            walk(inline);
            flush();
          }
        }
      }
    }
  }

  walk(root);
  flush();
  return result;
}

/** A Gecko caret may snap to nearby text; require the point to also be on a rendered link rect. */
export function textLinkHit(
  root: Element,
  point: ClientPoint,
  ranges: readonly TextLinkRange[],
): SafeURI | null {
  if (!ranges.length) return null;
  const { clientX: x, clientY: y } = point;
  const caret = root.ownerDocument.caretPositionFromPoint?.(x, y);
  if (caret?.offsetNode.nodeType !== 3 || !root.contains(caret.offsetNode)) return null;
  for (const { range, uri } of ranges) {
    if (!range.isPointInRange(caret.offsetNode, caret.offset)) continue;
    let painted = range;
    if (range.startContainer !== range.endContainer) {
      // A multi-node Range's rectangles can include inline element boxes and their padding.
      const node = caret.offsetNode as Text;
      painted = root.ownerDocument.createRange();
      painted.setStart(node, range.startContainer === node ? range.startOffset : 0);
      painted.setEnd(node, range.endContainer === node ? range.endOffset : node.length);
    }
    const rects = painted.getClientRects();
    if (!rects) continue;
    for (let index = 0; index < rects.length; index++) {
      const rect = rects[index]!;
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return uri;
    }
  }
  return null;
}

/** Toggle an owned stylesheet, not classes or inline CSS on host-owned content. */
export function linkCursor(document: Document, selector: string) {
  const style = document.createElement('style');
  style.media = 'not all';
  style.textContent = `${selector} { cursor: pointer !important; }`;
  document.head.append(style);
  let active = false;
  return {
    show(next: boolean) {
      if (active === next) return;
      active = next;
      style.media = active ? 'all' : 'not all';
    },
    dispose: () => style.remove(),
  };
}
