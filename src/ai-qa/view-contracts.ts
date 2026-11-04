import type { AIConfiguration, AIConfigurationState } from '../ai/contracts';
import type { AIQARecord, AIQASource, AIQATaskState } from './contracts';

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
  'saved',
  'sourceChanged',
  'evidenceUnavailable',
  'limitedContext',
  'confirmRemove',
  'close',
] as const;
export type AIQATextKey = (typeof AI_QA_TEXT_KEYS)[number];

export interface AIQARecordView {
  readonly record: AIQARecord;
  readonly sourceCurrent: boolean;
}

export interface AIQASourcePreview {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly imageDataURL: string | null;
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
  | { readonly type: 'explain' }
  | { readonly type: 'ask'; readonly question: string }
  | { readonly type: 'select-section'; readonly id: string }
  | { readonly type: 'guide' }
  | { readonly type: 'cancel' }
  | { readonly type: 'preview'; readonly resultID: string; readonly evidenceID: string }
  | { readonly type: 'jump'; readonly resultID: string; readonly evidenceID: string }
  | { readonly type: 'save-note'; readonly resultID: string }
  | {
      readonly type: 'edit';
      readonly resultID: string;
      readonly revision: number;
      readonly text: string;
    }
  | { readonly type: 'remove'; readonly resultID: string; readonly revision: number };

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
