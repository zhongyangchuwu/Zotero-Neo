import type { AIErrorCode, AIInputImage, AIUsage } from '../ai/contracts';
import type { DocumentLocation } from '../document-analysis/contracts';

export type AIQATaskKind = 'explain' | 'question' | 'guide';

export interface AIQASource {
  readonly itemID: number;
  readonly libraryID: number;
  readonly key: string;
  readonly fingerprint: string;
  readonly fileName: string;
}

export interface AIQAEvidence {
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

export interface AIQAParagraph {
  readonly text: string;
  readonly evidenceIDs: readonly string[];
}

export interface AIQAGuideEntry {
  readonly evidenceID: string;
  readonly role: 'goal' | 'method' | 'result' | 'limitation' | 'other';
  readonly reason: string;
}

export interface AIQAOutput {
  readonly paragraphs: readonly AIQAParagraph[];
  readonly guide: readonly AIQAGuideEntry[];
}

/** User edits are a revision of the result, never a replacement for the generated original. */
export interface AIQARecord {
  readonly id: string;
  readonly revision: number;
  readonly source: AIQASource;
  readonly kind: AIQATaskKind;
  readonly question: string;
  readonly contextTitle: string;
  readonly evidence: readonly AIQAEvidence[];
  readonly output: AIQAOutput;
  readonly model: string;
  readonly endpoint: string;
  readonly usage: AIUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly userText: string | null;
}

export interface AIQARepository {
  /** Includes older PDF revisions for the same attachment; the UI marks their sources as changed. */
  list(source: AIQASource): Promise<readonly AIQARecord[]>;
  add(record: AIQARecord, current: () => Promise<boolean>): Promise<AIQARecord>;
  edit(
    source: AIQASource,
    id: string,
    revision: number,
    userText: string | null,
  ): Promise<AIQARecord>;
  remove(source: AIQASource, id: string, revision: number): Promise<void>;
}

export type AIQAErrorCode = AIErrorCode | 'stale-source' | 'storage' | 'busy';
export type AIQATaskPhase =
  | 'idle'
  | 'preparing'
  | 'requesting'
  | 'saving'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface AIQATaskState {
  readonly itemID: number;
  readonly taskID: string | null;
  readonly phase: AIQATaskPhase;
  readonly kind: AIQATaskKind | null;
  readonly error: AIQAErrorCode | null;
  readonly resultID: string | null;
}

/** Image order is explicit and linked to an existing evidence identity, never model coordinates. */
export interface AIQAInputImage extends AIInputImage {
  readonly evidenceID: string;
}

export interface AIQATaskInput {
  readonly source: AIQASource;
  readonly kind: AIQATaskKind;
  readonly question: string;
  readonly contextTitle: string;
  readonly evidence: readonly AIQAEvidence[];
  /** Explicit, ephemeral visual context; source locations, not image bytes, are persisted. */
  readonly images?: readonly AIQAInputImage[];
  /** Checks the captured PDF identity, not whichever tab happens to be active later. */
  readonly isCurrent: () => Promise<boolean>;
}

export interface AIQATasks {
  run(input: AIQATaskInput): Promise<AIQARecord>;
  cancel(itemID: number): void;
  state(itemID: number): AIQATaskState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
