import type { AIConfigurationState } from '../ai/contracts';
import type { SourceNoteReceipt } from '../core/source-note';
import type { AIQAErrorCode, AIQARecord, AIQASource, AIQATaskState } from './contracts';

/** Reading actions are independent of opening or mounting a Reader panel. */
export type AIQAReaderCommand =
  | { readonly type: 'explain' }
  | { readonly type: 'ask'; readonly question: string }
  | { readonly type: 'select-section'; readonly id: string }
  | { readonly type: 'guide' }
  | { readonly type: 'cancel' }
  | { readonly type: 'preview'; readonly resultID: string; readonly evidenceID: string }
  | { readonly type: 'jump'; readonly resultID: string; readonly evidenceID: string }
  | { readonly type: 'save-note'; readonly resultID: string; readonly revision: number }
  | { readonly type: 'open-note'; readonly resultID: string; readonly revision: number }
  | {
      readonly type: 'edit';
      readonly resultID: string;
      readonly revision: number;
      readonly text: string;
    }
  | { readonly type: 'remove'; readonly resultID: string; readonly revision: number };

export type AIQAReaderNotice =
  | 'saved'
  | 'cancelled'
  | 'evidenceUnavailable'
  | 'adoptedCreated'
  | 'adoptedReused';

/** Source preview data, not a native window, DOM node, or mutable host handle. */
export interface AIQASourcePreview {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly imageDataURL: string | null;
}

/** Read-only application state; presentation supplies labels and rendered-result projections. */
export interface AIQAReaderSnapshot {
  readonly configuration: AIConfigurationState;
  readonly source: AIQASource | null;
  readonly contextTitle: string;
  readonly hasSelection: boolean;
  readonly sections: readonly { readonly id: string; readonly title: string }[];
  readonly selectedSectionID: string | null;
  readonly limitedContext: boolean;
  readonly task: AIQATaskState;
  readonly records: readonly AIQARecord[];
  readonly adoptions: Readonly<Record<string, SourceNoteReceipt | 'unavailable' | null>>;
  readonly preview: AIQASourcePreview | null;
  readonly error: AIQAErrorCode | null;
  readonly notice: AIQAReaderNotice | null;
  readonly loading: boolean;
}
