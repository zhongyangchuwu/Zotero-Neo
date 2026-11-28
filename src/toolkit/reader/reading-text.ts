import type { ReaderLinkPosition } from '../../reader/types';
import { currentReaderPresentation } from './presentation';

interface ReadingTextBlock {
  readonly id: string;
  readonly nodes: readonly Text[];
  readonly position: ReaderLinkPosition | null;
}

export interface ReaderReadingViewport {
  readonly blocks: ReadonlyMap<Element, readonly ReadingTextBlock[]>;
  readonly pages: readonly number[];
  isCurrent(): boolean;
}

/** Project only complete groups in the live reflow viewport. The native view already owns its text map. */
export function projectReadingViewport(
  window: Window,
  previous?: ReaderReadingViewport,
): ReaderReadingViewport | undefined {
  const document = window.document;
  const root = document.getElementById('sdt-content');
  const presentation = currentReaderPresentation(window);
  const mapRange = presentation?.getAnnotationFromRange;
  if (!root || !presentation || !mapRange || !(window.innerHeight > 0)) return undefined;

  // Top-level reflow blocks are in vertical document order. Bound native mapping
  // even if unusually many small blocks fit in one viewport.
  const children = root.children;
  let low = 0;
  let high = children.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (children[middle]!.getBoundingClientRect().bottom <= 0) low = middle + 1;
    else high = middle;
  }
  const before = previous?.isCurrent() ? previous.blocks : undefined;
  const blocks = new Map<Element, readonly ReadingTextBlock[]>();
  for (let i = low; i < Math.min(children.length, low + 32); i++) {
    const block = children[i]!;
    const rect = block.getBoundingClientRect();
    if (rect.top >= window.innerHeight) break;
    if (rect.bottom <= 0 || rect.height <= 0) continue;
    const reused = before?.get(block);
    if (reused) {
      blocks.set(block, reused);
      continue;
    }
    const groups = new Map<string, Text[]>();
    const walker = document.createTreeWalker(block, 4);
    let characters = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      characters += text.length;
      // Never infer admission from only the first part of an unusually large block.
      if (characters > 16_384) {
        groups.clear();
        break;
      }
      const parent = text.parentElement;
      if (!text.data.trim() || !parent?.closest('[data-text-index]') || parent.closest('[hidden]'))
        continue;
      const id = parent.closest<HTMLElement>('[data-ref-path]')?.dataset.refPath?.split('.', 1)[0];
      if (!id || !/^\d+$/u.test(id)) continue;
      const group = groups.get(`native:${id}`);
      if (group) group.push(text);
      else groups.set(`native:${id}`, [text]);
    }
    if (groups.size > 32) {
      blocks.set(block, []);
      continue;
    }
    const projected: ReadingTextBlock[] = [];
    const range = document.createRange();
    for (const [id, nodes] of groups) {
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      let position: ReaderLinkPosition | null = null;
      try {
        range.setStart(first, 0);
        range.setEnd(last, last.length);
        const candidate = mapRange.call(presentation, range, 'highlight')?.position;
        if (
          candidate &&
          Number.isInteger(candidate.pageIndex) &&
          candidate.pageIndex >= 0 &&
          candidate.rects?.length &&
          !candidate.nextPageRects?.length
        )
          position = candidate;
      } catch {
        // A detached or unsupported group is not an exclusion.
      }
      projected.push({ id, nodes, position });
    }
    blocks.set(block, projected);
  }
  if (before && before.size === blocks.size) {
    let same = true;
    for (const block of blocks.keys()) {
      if (!before.has(block)) {
        same = false;
        break;
      }
    }
    if (same) return previous;
  }
  const pages = new Set<number>();
  for (const groups of blocks.values())
    for (const { position } of groups) if (position) pages.add(position.pageIndex);
  return {
    blocks,
    pages: [...pages].sort((a, b) => a - b),
    isCurrent: () =>
      window.document === document &&
      document.getElementById('sdt-content') === root &&
      currentReaderPresentation(window) === presentation,
  };
}
