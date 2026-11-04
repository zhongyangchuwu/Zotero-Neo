import type { AIErrorCode, AIInputImage, AIUsage } from '../ai/contracts';
import type { DocumentLocation } from '../document-analysis/contracts';

export type ReaderAITaskKind = 'explain' | 'question' | 'guide';

export interface ReaderAISource {
  readonly itemID: number;
  readonly libraryID: number;
  readonly key: string;
  readonly fingerprint: string;
  readonly fileName: string;
}

export interface ReaderAIEvidence {
  readonly id: string;
  readonly kind: 'selection' | 'text' | 'figure' | 'table';
  readonly title: string;
  readonly text: string;
  readonly format: 'text' | 'html' | 'latex' | 'markdown';
  readonly pageLabel: string | null;
  readonly precision: 'text' | 'region';
  readonly location: DocumentLocation | null;
  readonly nativePosition: string | null;
}

export interface ReaderAIParagraph {
  readonly text: string;
  readonly evidenceIDs: readonly string[];
}

export interface ReaderAIGuideEntry {
  readonly evidenceID: string;
  readonly role: 'goal' | 'method' | 'result' | 'limitation' | 'other';
  readonly reason: string;
}

export interface ReaderAIOutput {
  readonly paragraphs: readonly ReaderAIParagraph[];
  readonly guide: readonly ReaderAIGuideEntry[];
}

/** User edits are a revision of the result, never a replacement for the generated original. */
export interface ReaderAIRecord {
  readonly id: string;
  readonly revision: number;
  readonly source: ReaderAISource;
  readonly kind: ReaderAITaskKind;
  readonly question: string;
  readonly contextTitle: string;
  readonly evidence: readonly ReaderAIEvidence[];
  readonly output: ReaderAIOutput;
  readonly model: string;
  readonly endpoint: string;
  readonly usage: AIUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly userText: string | null;
}

export interface ReaderAIRepository {
  /** Includes older PDF revisions for the same attachment; the UI marks their sources as changed. */
  list(source: ReaderAISource): Promise<readonly ReaderAIRecord[]>;
  add(record: ReaderAIRecord, current: () => Promise<boolean>): Promise<ReaderAIRecord>;
  edit(
    source: ReaderAISource,
    id: string,
    revision: number,
    userText: string | null,
  ): Promise<ReaderAIRecord>;
  remove(source: ReaderAISource, id: string, revision: number): Promise<void>;
}

export type ReaderAIErrorCode = AIErrorCode | 'stale-source' | 'storage' | 'busy';
export type ReaderAITaskPhase =
  | 'idle'
  | 'preparing'
  | 'requesting'
  | 'saving'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface ReaderAITaskState {
  readonly itemID: number;
  readonly taskID: string | null;
  readonly phase: ReaderAITaskPhase;
  readonly kind: ReaderAITaskKind | null;
  readonly error: ReaderAIErrorCode | null;
  readonly resultID: string | null;
}

/** Image order is explicit and linked to an existing evidence identity, never model coordinates. */
export interface ReaderAIInputImage extends AIInputImage {
  readonly evidenceID: string;
}

export interface ReaderAITaskInput {
  readonly source: ReaderAISource;
  readonly kind: ReaderAITaskKind;
  readonly question: string;
  readonly contextTitle: string;
  readonly evidence: readonly ReaderAIEvidence[];
  /** Explicit, ephemeral visual context; source locations, not image bytes, are persisted. */
  readonly images?: readonly ReaderAIInputImage[];
  /** Checks the captured PDF identity, not whichever tab happens to be active later. */
  readonly isCurrent: () => Promise<boolean>;
}

export interface ReaderAITasks {
  run(input: ReaderAITaskInput): Promise<ReaderAIRecord>;
  cancel(itemID: number): void;
  state(itemID: number): ReaderAITaskState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
