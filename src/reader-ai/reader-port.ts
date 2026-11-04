import type { ReaderSelectionContext } from '../core/contracts';
import type { DocumentLocation } from '../document-analysis/contracts';
import type { AppLanguage } from '../i18n';
import type { PdfWindow, ReaderRuntime } from '../toolkit/reader';

/** Captured before panel focus; navigation cannot drift to a later active PDF pane. */
export interface ReaderAIViewAccess {
  readonly window: PdfWindow;
  readonly pageIndex: number | null;
  isCurrent(): boolean;
  jump(location: DocumentLocation): boolean;
}

/** A Reader session supplies policy-owned selection, exact-view lifetime and jump history. */
export interface ReaderAIPort {
  readonly reader: ReaderRuntime;
  captureSelection(): ReaderSelectionContext | null;
  captureView(): ReaderAIViewAccess | null;
  language(): AppLanguage;
  themeRoot(root: HTMLElement): () => void;
  showStatus(message: string): void;
}
