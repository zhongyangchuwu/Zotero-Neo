import { CleanupFailure } from '../../core/cleanup';
import { decoratePdfSelection, firstPdfTextPosition } from '../../toolkit/reader';
import { isDeadObject } from '../../platform/cross-compartment';
import type { FlashIntent, FlashSelectionTarget } from './flash';
import { verticalTextPosition } from './text-motion';
import type { PdfWindow, Pointer, ReaderMode } from '../../reader/types';

export interface ReaderSelectionRangeHost {
  readonly isCurrent: (pdfWindow: PdfWindow) => boolean;
  readonly captureView: (pdfWindow: PdfWindow) => () => boolean;
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
  #anchorWindow: PdfWindow | null = null;
  #anchorCurrent: (() => boolean) | null = null;
  #disposed = false;
  #revision = 0;
  #preferredX: number | null = null;
  readonly #styledViews = new Map<
    PdfWindow,
    { dispose: (() => void) | null; current: () => boolean }
  >();

  constructor(host: ReaderSelectionRangeHost) {
    this.#host = host;
  }

  enter(pdfWindow: PdfWindow): void {
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    const selection = pdfWindow.getSelection();
    this.#anchor = null;
    this.#anchorWindow = null;
    this.#anchorCurrent = null;
    this.#preferredX = null;
    if (
      selection &&
      !selection.isCollapsed &&
      isTextNode(selection.anchorNode) &&
      !isDeadObject(selection.anchorNode) &&
      selection.anchorNode.isConnected &&
      selection.anchorNode.ownerDocument === pdfWindow.document
    ) {
      this.#anchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };
      this.#anchorWindow = pdfWindow;
      this.#anchorCurrent = current;
      this.#host.setModeVisual();
      if (!this.#current(pdfWindow) || !current() || this.#anchorWindow !== pdfWindow) return;
      this.refresh(pdfWindow, true);
      return;
    }
    if (current()) this.#host.openFlash(pdfWindow, 'visual-start');
  }

  activateFlashTarget(
    intent: FlashIntent,
    pdfWindow: PdfWindow,
    target: FlashSelectionTarget,
  ): void {
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    if (
      isDeadObject(target.start.textNode) ||
      isDeadObject(target.end.textNode) ||
      !target.start.textNode.isConnected ||
      !target.end.textNode.isConnected
    )
      return;
    if (
      target.start.textNode.ownerDocument !== pdfWindow.document ||
      target.end.textNode.ownerDocument !== pdfWindow.document
    )
      return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    const revision = this.#revision;
    this.#host.invalidateNativeSelection();
    if (!this.#current(pdfWindow) || !current() || this.#revision !== revision) return;
    this.#preferredX = null;

    if (intent === 'visual-start') {
      this.#anchor = target.start;
      this.#anchorWindow = pdfWindow;
      this.#anchorCurrent = current;
      this.#host.setModeVisual();
      if (!this.#current(pdfWindow) || !current() || this.#anchorWindow !== pdfWindow) return;
      selection.setBaseAndExtent(
        target.start.textNode,
        target.start.offset,
        target.end.textNode,
        target.end.offset,
      );
      this.refresh(pdfWindow, true);
      if (
        this.#current(pdfWindow) &&
        this.#revision === revision &&
        current() &&
        this.#anchorWindow === pdfWindow
      )
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
    if (
      this.#current(pdfWindow) &&
      current() &&
      this.#revision === revision &&
      this.#anchor === anchor
    )
      this.#host.showStatus('✓ selection updated', 650);
  }

  modify(
    pdfWindow: PdfWindow,
    direction: 'forward' | 'backward',
    granularity: 'character' | 'word' | 'sentence' | 'paragraph',
  ): void {
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    this.#preferredX = null;
    this.#ensureAnchor(pdfWindow);
    const anchor = this.#anchor;
    const revision = this.#revision;
    this.#host.invalidateNativeSelection();
    if (
      !this.#current(pdfWindow) ||
      !current() ||
      this.#revision !== revision ||
      this.#anchor !== anchor
    )
      return;
    pdfWindow.getSelection()?.modify('extend', direction, granularity);
    this.refresh(pdfWindow, true);
  }

  extendByLine(pdfWindow: PdfWindow, direction: -1 | 1): void {
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    this.#ensureAnchor(pdfWindow);
    const selection = pdfWindow.getSelection();
    const anchor = this.#anchor;
    if (!selection || !anchor || !isTextNode(selection.focusNode)) return;
    const pointer = { textNode: selection.focusNode, offset: selection.focusOffset };
    const target = verticalTextPosition(pdfWindow, pointer, direction, this.#preferredX);
    if (!target) return;
    this.#host.invalidateNativeSelection();
    if (!this.#current(pdfWindow) || !current() || this.#anchor !== anchor) return;
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
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    this.#preferredX = null;
    this.#ensureAnchor(pdfWindow);
    const anchor = this.#anchor;
    const revision = this.#revision;
    this.#host.invalidateNativeSelection();
    if (
      !this.#current(pdfWindow) ||
      !current() ||
      this.#revision !== revision ||
      this.#anchor !== anchor
    )
      return;
    pdfWindow.getSelection()?.modify('extend', end ? 'forward' : 'backward', 'lineboundary');
    this.refresh(pdfWindow, true);
  }

  swapEnds(pdfWindow: PdfWindow): void {
    if (!this.#current(pdfWindow)) return;
    this.#ensureAnchor(pdfWindow);
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
    if (!this.#current(pdfWindow)) return;
    const current = this.#host.captureView(pdfWindow);
    this.#removeViewMarker(pdfWindow);
    if (!this.#current(pdfWindow) || !current()) return;
    if (this.#host.mode() !== 'visual') return;
    const document = pdfWindow.document;
    let lease = this.#styledViews.get(pdfWindow);
    if (lease && !lease.current()) {
      this.#styledViews.delete(pdfWindow);
      lease.dispose?.();
      if (!this.#current(pdfWindow) || !current()) return;
      lease = this.#styledViews.get(pdfWindow);
    }
    if (!lease) {
      lease = { dispose: null, current };
      this.#styledViews.set(pdfWindow, lease);
      try {
        const dispose = decoratePdfSelection(pdfWindow);
        if (
          this.#styledViews.get(pdfWindow) !== lease ||
          !this.#current(pdfWindow) ||
          !lease.current()
        ) {
          if (this.#styledViews.get(pdfWindow) === lease) this.#styledViews.delete(pdfWindow);
          dispose();
          return;
        }
        lease.dispose = dispose;
      } catch (error) {
        if (this.#styledViews.get(pdfWindow) === lease) this.#styledViews.delete(pdfWindow);
        throw error;
      }
    } else if (!lease.dispose) return;

    const selection = pdfWindow.getSelection();
    const focus = selection?.focusNode ?? null;
    const anchor =
      this.#anchorWindow === pdfWindow && this.#anchorCurrent?.() ? this.#anchor : null;
    const node = isTextNode(focus) ? focus : anchor?.textNode;
    const offset = isTextNode(focus) ? (selection?.focusOffset ?? 0) : (anchor?.offset ?? 0);
    if (!node || isDeadObject(node) || !node.isConnected || node.ownerDocument !== document) return;
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.length));
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    this.#host.noteOwner();
    if (!this.#current(pdfWindow) || !lease.current() || this.#styledViews.get(pdfWindow) !== lease)
      return;
    this.#host.updateIndicator();
    if (!this.#current(pdfWindow) || !lease.current() || this.#styledViews.get(pdfWindow) !== lease)
      return;
    if (autoPan) {
      const container = this.#host.scrollContainer(pdfWindow);
      if (
        !this.#current(pdfWindow) ||
        !lease.current() ||
        this.#styledViews.get(pdfWindow) !== lease
      )
        return;
      if (rect.top < 20) this.#host.scrollBy(pdfWindow, 0, rect.top - 40);
      else if (rect.bottom > container.clientHeight - 20)
        this.#host.scrollBy(pdfWindow, 0, rect.bottom - container.clientHeight + 40);
    }
  }

  leave(): void {
    this.#revision += 1;
    this.#anchor = null;
    this.#anchorWindow = null;
    this.#anchorCurrent = null;
    this.#preferredX = null;
    const views = [...this.#styledViews];
    this.#styledViews.clear();
    const failure = new CleanupFailure();
    for (const [pdfWindow, lease] of views) {
      if (lease.dispose) failure.run(lease.dispose);
      failure.run(() => this.#removeViewMarker(pdfWindow));
    }
    failure.rethrow();
  }

  dispose(): void {
    this.#disposed = true;
    this.leave();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#anchorWindow === pdfWindow) {
      this.#anchor = null;
      this.#anchorWindow = null;
      this.#anchorCurrent = null;
      this.#preferredX = null;
    }
    const lease = this.#styledViews.get(pdfWindow);
    if (!lease) return;
    this.#styledViews.delete(pdfWindow);
    const failure = new CleanupFailure();
    if (lease.dispose) failure.run(lease.dispose);
    failure.run(() => this.#removeViewMarker(pdfWindow));
    failure.rethrow();
  }

  #current(pdfWindow: PdfWindow): boolean {
    return !this.#disposed && !isDeadObject(pdfWindow) && this.#host.isCurrent(pdfWindow);
  }

  #ensureAnchor(pdfWindow: PdfWindow): void {
    if (
      this.#anchorWindow === pdfWindow &&
      this.#anchor &&
      this.#anchorCurrent?.() &&
      !isDeadObject(this.#anchor.textNode) &&
      this.#anchor.textNode.isConnected &&
      this.#anchor.textNode.ownerDocument === pdfWindow.document
    )
      return;
    this.#anchor = null;
    this.#anchorWindow = null;
    this.#anchorCurrent = null;
    this.#preferredX = null;
    const current = this.#host.captureView(pdfWindow);
    const selection = pdfWindow.getSelection();
    const anchor = selection?.anchorNode ?? null;
    if (
      isTextNode(anchor) &&
      !isDeadObject(anchor) &&
      anchor.isConnected &&
      anchor.ownerDocument === pdfWindow.document
    )
      this.#anchor = { textNode: anchor, offset: selection?.anchorOffset ?? 0 };
    else this.#anchor = firstPdfTextPosition(pdfWindow);
    if (!current()) this.#anchor = null;
    if (this.#anchor) {
      this.#anchorWindow = pdfWindow;
      this.#anchorCurrent = current;
    }
  }

  #comparePointers(left: Pointer, right: Pointer): number {
    if (left.textNode === right.textNode) return left.offset - right.offset;
    const compare = left.textNode.compareDocumentPosition?.(right.textNode) ?? 0;
    if (compare & 4) return -1;
    if (compare & 2) return 1;
    return 0;
  }

  #removeViewMarker(pdfWindow: PdfWindow): void {
    if (isDeadObject(pdfWindow)) return;
    const failure = new CleanupFailure();
    failure.run(() => {
      // Gecko's NodeList iterator loses the element type supplied by this selector.
      const cursors = Array.from(
        pdfWindow.document.querySelectorAll('[data-zv-cursor]'),
      ) as HTMLElement[];
      for (const cursor of cursors) failure.run(() => cursor.remove());
    });
    failure.rethrow();
  }
}
