import type { ReaderSelectionContext } from '../core/contracts';
import type { DocumentLocation } from '../document-analysis/contracts';
import type { AppLanguage } from '../i18n';
import type { PdfWindow, ReaderRuntime } from '../toolkit/reader';

/** Captured before panel focus; navigation cannot drift to a later active PDF pane. */
export interface AIQAReaderViewAccess {
  readonly window: PdfWindow;
  readonly pageIndex: number | null;
  isCurrent(): boolean;
  jump(location: DocumentLocation): boolean;
}

/** A Reader session supplies policy-owned selection, exact-view lifetime and jump history. */
export interface AIQAReaderPort {
  readonly reader: ReaderRuntime;
  captureSelection(): ReaderSelectionContext | null;
  captureView(): AIQAReaderViewAccess | null;
  language(): AppLanguage;
  themeRoot(root: HTMLElement): () => void;
  showStatus(message: string): void;
  openNote(itemID: number): Promise<void>;
}

/** Reader evidence and invocation policy; independent of native panel presentation. */
export type AIQAReaderTaskPort = Pick<
  AIQAReaderPort,
  'reader' | 'captureSelection' | 'captureView' | 'language' | 'openNote'
>;

/** Native presentation capabilities; no selection or exact-view task capture. */
export type AIQAReaderPresentationPort = Pick<
  AIQAReaderPort,
  'reader' | 'language' | 'themeRoot' | 'showStatus'
>;
