import type { TextLinkRange } from '../text-link-hit';

const SVG = 'http://www.w3.org/2000/svg';
const CLIPPING_OVERFLOW = /^(?:auto|clip|hidden|overlay|scroll)$/;

/** Gecko ESR 140 colors custom highlights but does not paint their text-decoration. */
export function createCommentLinkUnderlines(document: Document) {
  const overlay = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');
  overlay.setAttribute('data-zv-comment-link-underlines', '');
  overlay.setAttribute('aria-hidden', 'true');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.2');
  overlay.append(path);
  // Keep the noninteractive paint layer outside the React root.
  document.body.append(overlay);

  return {
    paint(window: Window, ranges: ReadonlyMap<Element, readonly TextLinkRange[]>): void {
      let lines = '';
      for (const [content, links] of ranges) {
        if (!content.isConnected || !content.getClientRects()?.length) continue;
        let left = 0;
        let top = 0;
        let right = window.innerWidth;
        let bottom = window.innerHeight;
        // The collapsed editor clips lines; the sidebar and popup can also clip while scrolling.
        for (let parent: Element | null = content; parent; parent = parent.parentElement) {
          const style = window.getComputedStyle(parent);
          if (!style) continue;
          const clipX = CLIPPING_OVERFLOW.test(style.overflowX);
          const clipY = CLIPPING_OVERFLOW.test(style.overflowY);
          if (!clipX && !clipY) continue;
          const rect = parent.getBoundingClientRect();
          if (clipX) {
            const start = rect.left + parent.clientLeft;
            left = Math.max(left, start);
            right = Math.min(right, start + parent.clientWidth);
          }
          if (clipY) {
            const start = rect.top + parent.clientTop;
            top = Math.max(top, start);
            bottom = Math.min(bottom, start + parent.clientHeight);
          }
          if (left >= right || top >= bottom) break;
        }
        if (left >= right || top >= bottom) continue;

        for (const { range } of links) {
          const rects = range.getClientRects();
          if (!rects) continue;
          for (let index = 0; index < rects.length; index++) {
            const rect = rects[index]!;
            const x1 = Math.max(left, rect.left);
            const x2 = Math.min(right, rect.right);
            const y = rect.bottom - 1;
            if (x2 <= x1 || y < top || y >= bottom || rect.height <= 0) continue;
            const hit = document.elementFromPoint((x1 + x2) / 2, (Math.max(top, rect.top) + y) / 2);
            if (hit && content.contains(hit)) lines += `M${x1} ${y}H${x2}`;
          }
        }
      }
      path.setAttribute('d', lines);
    },
    dispose: () => overlay.remove(),
  };
}
