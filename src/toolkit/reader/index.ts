export { ReaderHostKeyBridge } from './input-bridge';
export { ReaderViewLifecycle } from './view-lifecycle';
export { leaseNativeBodySelection, readerHasNativeBodyGesture } from './native-body-selection';
export { readerPaintedTextLayer, type ReaderPaintedTextLayer } from './painted-text-layer';
export { observeReaderOutline } from './outline-follow';
export { installReaderCommentLinks } from './comment-links';
export { ReaderJumpHostAdapter } from './jump-host';
export { ReaderJumpHistoryBridge } from './history-bridge';
export type {
  ReaderNativeNavigation,
  ReaderOwnedNavigation,
  ReaderOwnedCompletion,
} from './history-bridge';
export * from './host';
export { observeReaderReferenceInteractions } from './reference-interactions';
export type {
  ReaderReferenceClientRect,
  ReaderReferenceInteractionContext,
  ReaderReferencePopupSlot,
  ReaderReferenceMenuItem,
  ReaderReferenceMenuContext,
  ReaderReferenceToolbarSlot,
  ReaderReferenceInteractionCallbacks,
} from './reference-interaction-contracts';
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
  beginReaderTextSelection,
  leaseReaderTextAdmission,
  readerTextNodeAllowed,
  readerSelectionIsFiltered,
  readerSelectionText,
  validateReaderSelection,
} from './text-admission';
export type { ReaderTextSourceLocation } from './text-admission';
export * from './identifier-text';
export * from './annotation-targets';
export { readerActionsTagsItemIDs } from './actions-tags-targets';
export * from './sidebar';
export * from './structured-document';
export { readReaderReferenceDocument } from './references';
export type {
  ReaderReferenceDocument,
  ReaderReferenceSnapshot,
  ReaderReferenceEntry,
  ReaderCitationOccurrence,
  ReaderReferenceLocation,
} from './reference-contracts';
export { readerReadingMode } from './presentation';
export { projectReadingViewport, type ReaderReadingViewport } from './reading-text';
