import type { PdfWindow } from './contracts';
import type { ReaderReferenceEntry, ReaderReferenceLocation } from './reference-contracts';

/** Client coordinates in the captured Reader UI window, never PDF-space coordinates. */
export type ReaderReferenceClientRect = readonly [number, number, number, number];

/** A native reading interaction captured before its menu or preview can change focus. */
export interface ReaderReferenceInteractionContext {
  readonly window: PdfWindow;
  readonly uiWindow: Window;
  readonly position: ReaderReferenceLocation | null;
  readonly references: readonly ReaderReferenceEntry[];
  anchorRect(): ReaderReferenceClientRect | null;
  /** The native interaction still owns its original target and source. */
  isCurrent(): boolean;
  /** The exact presentation, documents and loaded PDF remain live even after preview dismissal. */
  isSourceCurrent(): boolean;
  /** Dismiss only the captured native preview, not a replacement shown afterward. */
  dismissPreview?(): void;
}

/** Toolkit owns the mount's lifetime; the feature owns everything rendered inside it. */
export interface ReaderReferencePopupSlot {
  readonly context: ReaderReferenceInteractionContext;
  readonly mount: HTMLElement;
}

export interface ReaderReferenceMenuItem {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onCommand: () => void;
}

export interface ReaderReferenceMenuContext {
  readonly context: ReaderReferenceInteractionContext;
  /** Synchronous append to Zotero's native view menu; asynchronous work starts in onCommand. */
  append(items: readonly ReaderReferenceMenuItem[]): void;
}

export interface ReaderReferenceToolbarSlot {
  readonly uiWindow: Window;
  readonly mount: HTMLElement;
  isCurrent(): boolean;
}

export interface ReaderReferenceInteractionCallbacks {
  onCitationPopup(slot: ReaderReferencePopupSlot): void | (() => void);
  onContextMenu(menu: ReaderReferenceMenuContext): void;
  onToolbar(slot: ReaderReferenceToolbarSlot): void | (() => void);
}
