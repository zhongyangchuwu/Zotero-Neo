import type { ReaderReferenceLocation } from '../toolkit/reader/reference-contracts';
import type { AppLanguage } from '../i18n';
import type { PdfWindow, ReaderRuntime } from '../toolkit/reader';

/** Captured before opening a panel; later focus changes cannot retarget its navigation. */
export interface ReferenceReaderViewAccess {
  readonly window: PdfWindow;
  isCurrent(): boolean;
  jump(location: ReaderReferenceLocation): boolean;
  restoreFocus(): void;
}

export interface ReferenceReaderPort {
  readonly reader: ReaderRuntime;
  captureView(): ReferenceReaderViewAccess | null;
  language(): AppLanguage;
  themeRoot(root: HTMLElement): () => void;
  showStatus(message: string): void;
}
