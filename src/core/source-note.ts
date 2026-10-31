import type { DocumentAttachment } from '../document-analysis/preparation';

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
  /** Optional source-content identity for idempotent generated notes. */
  readonly identity?: string;
}
export interface SourceNoteReceipt {
  readonly itemID: number;
  readonly key: string;
  readonly reused: boolean;
}
