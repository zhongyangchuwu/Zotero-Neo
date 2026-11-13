import type { AIConfiguration, AIConfigurationState } from '../ai/contracts';
import type { AIQARecord, AIQASource, AIQATaskState } from './contracts';
import type { SourceNoteReceipt } from '../core/source-note';
import type { AIQAReaderCommand, AIQASourcePreview } from './reader-contracts';

export const AI_QA_TEXT_KEYS = [
  'title',
  'configure',
  'api',
  'apiChatCompletions',
  'apiResponses',
  'endpoint',
  'model',
  'key',
  'keyHint',
  'storedKey',
  'forgetKey',
  'maxOutputTokens',
  'sendImages',
  'saveSettings',
  'cancel',
  'selection',
  'explain',
  'question',
  'ask',
  'chapter',
  'prepareGuide',
  'noSource',
  'noSelection',
  'noRecords',
  'loading',
  'preparing',
  'requesting',
  'saving',
  'complete',
  'failed',
  'cancelled',
  'source',
  'preview',
  'jump',
  'saveNote',
  'adopted',
  'adoptedReused',
  'adoptedCreated',
  'openNote',
  'noteUnavailable',
  'notAdopted',
  'edit',
  'saveEdit',
  'cancelEdit',
  'remove',
  'generated',
  'modified',
  'stale',
  'original',
  'myText',
  'unconfigured',
  'sourceChanged',
  'evidenceUnavailable',
  'textRange',
  'pageRegion',
  'sourceNotice',
  'limitedContext',
  'confirmRemove',
  'close',
] as const;
export type AIQATextKey = (typeof AI_QA_TEXT_KEYS)[number];

export interface AIQARecordView {
  readonly record: AIQARecord;
  readonly sourceCurrent: boolean;
  readonly adoption: SourceNoteReceipt | 'unavailable' | null;
}

/** Safe projection only; model keys, native Reader handles and mutable repository state never enter it. */
export interface AIQAViewModel {
  readonly labels: Readonly<Record<AIQATextKey, string>>;
  readonly configuration: AIConfigurationState;
  readonly source: AIQASource | null;
  readonly contextTitle: string;
  readonly hasSelection: boolean;
  readonly sections: readonly { readonly id: string; readonly title: string }[];
  readonly selectedSectionID: string | null;
  readonly limitedContext: boolean;
  readonly task: AIQATaskState;
  readonly records: readonly AIQARecordView[];
  readonly preview: AIQASourcePreview | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly loading: boolean;
}

export type AIQACommand =
  | { readonly type: 'close' }
  | {
      readonly type: 'configure';
      readonly configuration: AIConfiguration;
      readonly key: string;
      readonly forget: boolean;
    }
  | AIQAReaderCommand;

export interface AIQAView {
  update(model: AIQAViewModel): void;
  dispose(): void;
}

export interface AIQAUIRuntime {
  mount(
    root: HTMLElement,
    model: AIQAViewModel,
    dispatch: (command: AIQACommand) => void,
  ): AIQAView;
}
