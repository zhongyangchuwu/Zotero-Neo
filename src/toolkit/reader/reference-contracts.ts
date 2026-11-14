import type { DocumentLocation, DocumentRect } from '../../document-analysis/contracts';

/** Native two-page ranges retain their continuation while navigation starts at the first anchor. */
export interface ReaderReferenceLocation extends DocumentLocation {
  readonly nextPageRects?: readonly DocumentRect[];
}

/** Data-only native projection; no PDF, SDT, DOM or mutable host objects escape Toolkit. */
export interface ReaderReferenceEntry {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly location: ReaderReferenceLocation;
  readonly doi: string | null;
  readonly arxivID: string | null;
}

export interface ReaderCitationOccurrence {
  readonly id: string;
  readonly referenceIDs: readonly string[];
  readonly text: string;
  readonly context: string;
  readonly location: ReaderReferenceLocation;
}

/** One attachment version, including references and occurrences on unrendered pages. */
export interface ReaderReferenceDocument {
  readonly attachmentID: number;
  readonly sourceID: string;
  /** Numbered means structurally consistent observed entries, never verified full-document coverage. */
  readonly bibliographyCoverage: 'numbered' | 'partial';
  readonly entries: readonly ReaderReferenceEntry[];
  readonly occurrences: readonly ReaderCitationOccurrence[];
}

/** Lifetime guard for a data-only reference document captured from one PDF revision. */
export interface ReaderReferenceSnapshot {
  readonly document: ReaderReferenceDocument;
  isCurrent(): boolean;
  validate(): Promise<boolean>;
}
