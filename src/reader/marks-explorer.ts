import { THEME_VARS } from '../ui/theme';
import { keyString } from '../input/keys';
import { compositionOwnsKey } from '../input/composition';
import { isDeadObject } from '../platform/cross-compartment';
import { asElement, isEditableElement } from '../platform/dom';
import type { Mark, PdfWindow, ReaderRuntime } from './types';
import { ReaderMarks } from './marks';

interface MarksExplorerState {
  open: boolean;
  selected: number;
  pdfWindow: PdfWindow | null;
  overlay: HTMLElement | null;
  list: HTMLElement | null;
  themeCleanup: (() => void) | null;
}

export interface MarksExplorerHost {
  readonly marks: ReaderMarks;
  readonly reader: ReaderRuntime;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly onAnnotation: (key: string | null) => void;
  readonly onClose: (pdfWindow?: PdfWindow) => void;
}

export class ReaderMarksExplorer {
  readonly #host: MarksExplorerHost;
  readonly #state: MarksExplorerState = {
    open: false,
    pdfWindow: null,
    selected: 0,
    overlay: null,
    list: null,
    themeCleanup: null,
  };

  constructor(host: MarksExplorerHost) {
    this.#host = host;
  }

  get isOpen(): boolean {
    return this.#state.open;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#state.pdfWindow === pdfWindow;
  }

  toggle(pdfWindow: PdfWindow): void {
    if (this.#state.open) {
      this.close(pdfWindow);
      return;
    }
    this.#state.open = true;
    this.#state.pdfWindow = pdfWindow;
    this.#state.selected = 0;
    const document = pdfWindow.document;
    const overlay = document.createElement('div');
    overlay.id = 'zv-marks-explorer';
    overlay.tabIndex = -1;
    overlay.style.cssText = `position:fixed;top:0;left:0;bottom:0;width:320px;z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border-right:1px solid ${THEME_VARS.border};display:flex;flex-direction:column;box-shadow:12px 0 40px ${THEME_VARS.shadow};font:13px/1.35 monospace`;
    const heading = document.createElement('div');
    heading.style.cssText = `padding:12px 14px;border-bottom:1px solid ${THEME_VARS.border};font-weight:bold;background:${THEME_VARS.elevated}`;
    heading.textContent = 'Marks';
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow:auto;padding:8px 0;';
    const help = document.createElement('div');
    help.style.cssText = `padding:6px 12px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-size:11px`;
    help.textContent =
      'type a mark char to jump · j/k move · Enter jump · d delete · x delete all · Esc close';
    overlay.append(heading, list, help);
    document.body?.appendChild(overlay);
    this.#state.themeCleanup = this.#host.themeRoot(overlay);
    this.#state.overlay = overlay;
    this.#state.list = list;
    this.#render();
    overlay.focus();
  }

  handleKey(pdfWindow: PdfWindow, event: KeyboardEvent): boolean {
    if (!this.#state.open) return false;
    if (
      !this.ownsView(pdfWindow) ||
      isDeadObject(pdfWindow) ||
      (this.#state.overlay && isDeadObject(this.#state.overlay)) ||
      isEditableElement(asElement(event.target))
    ) {
      this.close();
      return false;
    }
    if (compositionOwnsKey(event, false)) return true;
    const key = keyString(event);
    if (!key) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const marks = this.#host.marks;
    const chars = Object.keys(this.#marks()).sort();
    if (
      /^[a-z0-9]$/.test(key) &&
      this.#marks()[key] &&
      !['j', 'k', 'g', 'G', 'd', 'x'].includes(key)
    ) {
      this.close(pdfWindow);
      void marks.jump(this.#host.reader, pdfWindow, key, (annotation) =>
        this.#host.onAnnotation(annotation),
      );
      return true;
    }
    if (key === 'j') this.#state.selected = Math.min(chars.length - 1, this.#state.selected + 1);
    else if (key === 'k') this.#state.selected = Math.max(0, this.#state.selected - 1);
    else if (key === 'G') this.#state.selected = Math.max(0, chars.length - 1);
    else if (key === 'enter' || key === 'return') {
      const char = chars[this.#state.selected];
      this.close(pdfWindow);
      if (char)
        void marks.jump(this.#host.reader, pdfWindow, char, (annotation) =>
          this.#host.onAnnotation(annotation),
        );
      return true;
    } else if (key === 'd') {
      const char = chars[this.#state.selected];
      if (char) void marks.delete(this.#host.reader, char);
    } else if (key === 'x') void marks.clear(this.#host.reader);
    else if (key === 'escape') {
      this.close(pdfWindow);
      return true;
    }
    this.#render();
    return true;
  }

  /** Retires exact-pane ownership before cleanup and notifies the coordinator even on live failure. */
  close(pdfWindow?: PdfWindow): void {
    const state = this.#state;
    if (!state.open && !state.overlay) return;
    const overlay = state.overlay;
    const owner = state.pdfWindow;
    const cleanup = state.themeCleanup;
    state.open = false;
    state.pdfWindow = null;
    state.selected = 0;
    state.themeCleanup = null;
    state.overlay = null;
    state.list = null;
    try {
      cleanup?.();
    } finally {
      try {
        if (overlay && !isDeadObject(overlay) && (!owner || !isDeadObject(owner))) overlay.remove();
      } finally {
        this.#host.onClose(pdfWindow);
      }
    }
  }

  #render(): void {
    const list = this.#state.list;
    if (!list) return;
    list.replaceChildren();
    const marks = this.#marks();
    const chars = Object.keys(marks).sort();
    this.#state.selected = Math.max(0, Math.min(this.#state.selected, chars.length - 1));
    if (!chars.length) {
      const row = list.ownerDocument.createElement('div');
      row.style.cssText = `padding:10px 14px;color:${THEME_VARS.muted}`;
      row.textContent = 'No marks — press m<x> in Normal mode to set one';
      list.appendChild(row);
      return;
    }
    chars.forEach((char, index) => {
      const mark = marks[char];
      if (!mark) return;
      const row = list.ownerDocument.createElement('div');
      const selected = index === this.#state.selected;
      row.style.cssText = `padding:6px 14px;white-space:nowrap;color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'};background:${selected ? THEME_VARS.selected : 'transparent'}`;
      row.textContent = `${char}   ${mark.pageIndex === null ? '—' : `p.${mark.pageIndex + 1}  ${Math.round(mark.ratio * 100)}%`}${mark.key ? '  ⚑ ann' : ''}`;
      list.appendChild(row);
    });
  }

  #marks(): Readonly<Record<string, Mark>> {
    return this.#host.marks.values();
  }
}
