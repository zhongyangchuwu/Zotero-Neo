import type { FlashIntent, FlashSelectionTarget } from './flash';
import { verticalTextPosition } from './text-motion';
import type { PdfWindow, Pointer, ReaderMode } from './types';

export interface ReaderSelectionRangeHost {
  readonly mode: () => ReaderMode;
  readonly setModeVisual: () => void;
  readonly invalidateNativeSelection: () => void;
  readonly noteOwner: () => void;
  readonly updateIndicator: () => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly scrollContainer: (pdfWindow: PdfWindow) => HTMLElement;
  readonly scrollBy: (pdfWindow: PdfWindow, x: number, y: number) => void;
  readonly openFlash: (pdfWindow: PdfWindow, intent: FlashIntent) => void;
}

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

/**
 * Owns Neo's temporary DOM Selection compatibility range for Reader Select mode.
 *
 * Zotero's private semantic PDF selection remains authoritative for native mouse selection, but
 * it has no supported mutation seam. This owner therefore keeps only Neo's DOM-range anchor and
 * preferred vertical X while ReaderSession retains mode/input policy and native popup geometry.
 */
export class ReaderSelectionRange {
  readonly #host: ReaderSelectionRangeHost;
  #anchor: Pointer | null = null;
  #preferredX: number | null = null;
  readonly #styledViews = new Set<PdfWindow>();

  constructor(host: ReaderSelectionRangeHost) {
    this.#host = host;
  }

  enter(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    this.#anchor = null;
    this.#preferredX = null;
    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {
      this.#anchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };
      this.#host.setModeVisual();
      this.refresh(pdfWindow, true);
      return;
    }
    this.#host.openFlash(pdfWindow, 'visual-start');
  }

  activateFlashTarget(
    intent: FlashIntent,
    pdfWindow: PdfWindow,
    target: FlashSelectionTarget,
  ): void {
    if (!target.start.textNode.isConnected || !target.end.textNode.isConnected) return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    this.#host.invalidateNativeSelection();
    this.#preferredX = null;

    if (intent === 'visual-start') {
      this.#anchor = target.start;
      this.#host.setModeVisual();
      selection.setBaseAndExtent(
        target.start.textNode,
        target.start.offset,
        target.end.textNode,
        target.end.offset,
      );
      this.refresh(pdfWindow, true);
      this.#host.showStatus('✓ selection started', 650);
      return;
    }

    if (this.#host.mode() !== 'visual') return;
    this.#ensureAnchor(pdfWindow);
    const anchor = this.#anchor;
    if (!anchor?.textNode.isConnected) return;
    const focus = this.#comparePointers(target.end, anchor) <= 0 ? target.start : target.end;
    selection.setBaseAndExtent(anchor.textNode, anchor.offset, focus.textNode, focus.offset);
    this.refresh(pdfWindow, true);
    this.#host.showStatus('✓ selection updated', 650);
  }

  modify(
    pdfWindow: PdfWindow,
    direction: 'forward' | 'backward',
    granularity: 'character' | 'word' | 'sentence' | 'paragraph',
  ): void {
    this.#preferredX = null;
    this.#ensureAnchor(pdfWindow);
    this.#host.invalidateNativeSelection();
    pdfWindow.getSelection()?.modify('extend', direction, granularity);
    this.refresh(pdfWindow, true);
  }

  extendByLine(pdfWindow: PdfWindow, direction: -1 | 1): void {
    this.#ensureAnchor(pdfWindow);
    const selection = pdfWindow.getSelection();
    const anchor = this.#anchor;
    if (!selection || !anchor || !isTextNode(selection.focusNode)) return;
    const pointer = { textNode: selection.focusNode, offset: selection.focusOffset };
    const target = verticalTextPosition(pdfWindow, pointer, direction, this.#preferredX);
    if (!target) return;
    this.#host.invalidateNativeSelection();
    this.#preferredX = target.preferredX;
    selection.setBaseAndExtent(
      anchor.textNode,
      anchor.offset,
      target.pointer.textNode,
      target.pointer.offset,
    );
    this.refresh(pdfWindow, true);
  }

  extendLineBoundary(pdfWindow: PdfWindow, end: boolean): void {
    this.#preferredX = null;
    this.#ensureAnchor(pdfWindow);
    this.#host.invalidateNativeSelection();
    pdfWindow.getSelection()?.modify('extend', end ? 'forward' : 'backward', 'lineboundary');
    this.refresh(pdfWindow, true);
  }

  swapEnds(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !this.#anchor) return;
    const range = selection.getRangeAt(0);
    const anchorIsStart =
      this.#anchor.textNode === range.startContainer && this.#anchor.offset === range.startOffset;
    const focusNode = anchorIsStart ? range.endContainer : range.startContainer;
    const focusOffset = anchorIsStart ? range.endOffset : range.startOffset;
    if (!isTextNode(focusNode)) return;
    selection.setBaseAndExtent(focusNode, focusOffset, this.#anchor.textNode, this.#anchor.offset);
    this.#anchor = { textNode: focusNode, offset: focusOffset };
    this.#preferredX = null;
    this.refresh(pdfWindow, true);
  }

  refresh(pdfWindow: PdfWindow, autoPan: boolean): void {
    this.#removeViewMarker(pdfWindow);
    if (this.#host.mode() !== 'visual') return;
    const document = pdfWindow.document;
    let style = document.querySelector<HTMLStyleElement>('style[data-zv-select-selection]');
    if (!style) {
      style = document.createElement('style');
      style.dataset.zvSelectSelection = '1';
      // Zotero/PDF.js makes ordinary desktop DOM selection transparent. Mirror the
      // Reader's own native-selection blue only while Neo Select owns the range.
      style.textContent =
        ':root[data-zv-select-active] .textLayer ::selection { background-color: rgb(66, 133, 244); }';
      document.documentElement.appendChild(style);
    }
    document.documentElement.setAttribute('data-zv-select-active', '');
    this.#styledViews.add(pdfWindow);

    const selection = pdfWindow.getSelection();
    const focus = selection?.focusNode ?? null;
    const node = isTextNode(focus) ? focus : this.#anchor?.textNode;
    const offset = isTextNode(focus) ? (selection?.focusOffset ?? 0) : (this.#anchor?.offset ?? 0);
    if (!node?.isConnected) return;
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.length));
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    this.#host.noteOwner();
    this.#host.updateIndicator();
    if (autoPan) {
      const container = this.#host.scrollContainer(pdfWindow);
      if (rect.top < 20) this.#host.scrollBy(pdfWindow, 0, rect.top - 40);
      else if (rect.bottom > container.clientHeight - 20)
        this.#host.scrollBy(pdfWindow, 0, rect.bottom - container.clientHeight + 40);
    }
  }

  leave(): void {
    for (const pdfWindow of this.#styledViews) this.#removeViewMarker(pdfWindow);
    this.#styledViews.clear();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (!this.#styledViews.has(pdfWindow)) return;
    this.#removeViewMarker(pdfWindow);
    this.#styledViews.delete(pdfWindow);
  }

  #ensureAnchor(pdfWindow: PdfWindow): void {
    if (this.#anchor?.textNode.isConnected) return;
    const selection = pdfWindow.getSelection();
    const anchor = selection?.anchorNode ?? null;
    if (isTextNode(anchor))
      this.#anchor = { textNode: anchor, offset: selection?.anchorOffset ?? 0 };
    else this.#anchor = this.#firstTextPosition(pdfWindow);
  }

  #firstTextPosition(pdfWindow: PdfWindow): Pointer | null {
    const span = pdfWindow.document.querySelector('.textLayer span') as HTMLElement | null;
    const text = span?.firstChild ?? null;
    return isTextNode(text) ? { textNode: text, offset: 0 } : null;
  }

  #comparePointers(left: Pointer, right: Pointer): number {
    if (left.textNode === right.textNode) return left.offset - right.offset;
    const compare = left.textNode.compareDocumentPosition?.(right.textNode) ?? 0;
    if (compare & 4) return -1;
    if (compare & 2) return 1;
    return 0;
  }

  #removeViewMarker(pdfWindow: PdfWindow): void {
    pdfWindow.document.documentElement.removeAttribute('data-zv-select-active');
    const cursors = Array.from(
      pdfWindow.document.querySelectorAll('[data-zv-cursor]'),
    ) as HTMLElement[];
    for (const cursor of cursors) cursor.remove();
  }
}
