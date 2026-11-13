export { ReaderHostKeyBridge } from './input-bridge';
export { ReaderViewLifecycle } from './view-lifecycle';
export { ReaderJumpHostAdapter } from './jump-host';
export { ReaderJumpHistoryBridge } from './history-bridge';
export type {
  ReaderNativeNavigation,
  ReaderOwnedNavigation,
  ReaderOwnedCompletion,
} from './history-bridge';
export * from './host';
export * from './selection-geometry';
export type {
  ReaderRuntime,
  ReaderViewRuntime,
  PdfWindow,
  ComputedAnnotationPosition,
} from './contracts';
export * from './navigation';
export * from './annotations';
export * from './links';
export * from './marks';
export * from './text-source';
export {
  leaseReaderTextAdmission,
  readerTextNodeAllowed,
  readerSelectionIsFiltered,
  readerSelectionText,
  validateReaderSelection,
} from './text-admission';
export type { ReaderTextSourceLocation } from './text-admission';
export * from './identifier-text';
export * from './annotation-targets';
export * from './sidebar';
export * from './structured-document';
export * from './document-source';
export { readerRegionPreview } from './region-preview';
export type { ReaderRegionPreview } from './region-preview';

export { readerReadingMode } from './presentation';
export { translationMarkerPosition } from './translation-marker';
export { ReaderTranslationSidebar } from './translation-sidebar';
export { readerSelectionPopupSource } from './selection-popup-source';
export { captureTranslateForZotero248 } from './translate-for-zotero-v248';
export { appendTranslationPopupAction, isReaderTranslationControl } from './translation-popup';
export { readerLoadedPDFSource } from './loaded-pdf-source';
