import type { DocumentAttachment } from '../document-analysis/preparation';
import type { DocumentLocation } from '../document-analysis/contracts';

/** Existing source content, with safe native markup and deferred image slots. */
export interface SourceNoteEntry {
  readonly id: string;
  readonly kind: 'annotation' | 'excerpt';
  readonly quote: string;
  readonly comment: string;
  readonly locations: readonly DocumentLocation[];
  readonly html: string;
  readonly images: readonly string[];
  readonly schemaVersion: 9 | 10;
}

export interface SourceNoteTarget {
  readonly attachment: DocumentAttachment;
  readonly parent: {
    readonly itemID: number;
    readonly key: string;
    readonly title?: string;
  } | null;
}
export interface SourceNoteDraft {
  readonly sourceFingerprint: string;
  readonly title: string;
  /** Safe HTML owned by the caller. Embedded image slots use src="neo-image:N". */
  readonly html: string;
  readonly images: readonly string[];
  readonly schemaVersion?: 9 | 10;
  /** Optional source-content identity for idempotent generated notes. */
  readonly identity?: string;
}
export interface SourceNoteReceipt {
  readonly itemID: number;
  readonly key: string;
  readonly reused: boolean;
}
