import type { ReaderReferenceLocation } from '../toolkit/reader/reference-contracts';
import type { AppLanguage } from '../i18n';
import type { PdfWindow, ReaderRuntime } from '../toolkit/reader';

/** Captured on an explicit action; later focus changes cannot retarget its navigation. */
export interface ReferenceReaderViewAccess {
  readonly window: PdfWindow;
  isCurrent(): boolean;
  jump(location: ReaderReferenceLocation): boolean;
  /** Explicit local opening participates in shared history from this captured view/document. */
  openAttachment(itemID: number): Promise<boolean>;
  restoreFocus(): void;
}

export interface ReferenceReaderPort {
  readonly reader: ReaderRuntime;
  readonly pluginID: string;
  /** An explicit contextual action may activate its captured pane; passive hover never calls this. */
  captureView(window?: PdfWindow): ReferenceReaderViewAccess | null;
  language(): AppLanguage;
  themeRoot(root: HTMLElement): () => void;
  showStatus(message: string): void;
}
