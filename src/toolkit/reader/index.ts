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
export { readReaderReferenceDocument } from './references';
export type {
  ReaderReferenceDocument,
  ReaderReferenceSnapshot,
  ReaderReferenceEntry,
  ReaderCitationOccurrence,
  ReaderReferenceLocation,
} from './reference-contracts';
export { readerRegionPreview } from './region-preview';
export type { ReaderRegionPreview } from './region-preview';

export { readerReadingMode } from './presentation';
export { AIQAPanelHost } from './ai-qa-panel';
export type { AIQAPanelLease, AIQAPanelCallbacks } from './ai-qa-panel';
