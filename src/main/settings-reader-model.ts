import type { HighlightColorName, ReaderScrollConfig, ReaderScrollNumberSetting, ScrollMode } from '../core/preferences';

export interface ReaderCredentialModel {
  readonly configured: boolean | null;
  readonly pending: boolean;
  readonly error: boolean;
  readonly status: string;
  readonly title: string;
  readonly hint: string;
  readonly inputLabel: string;
  readonly saveLabel: string;
  readonly forgetLabel: string;
}

export interface ReaderPageModel {
  readonly labels: {
    readonly title: string; readonly input: string; readonly visual: string; readonly visualHint: string;
    readonly comment: string; readonly commentHint: string; readonly scrolling: string; readonly scrollingHint: string;
    readonly mode: string; readonly modes: Record<ScrollMode, string>;
    readonly numbers: Record<ReaderScrollNumberSetting, string>; readonly stop: string; readonly stopHint: string;
    readonly marks: string; readonly persist: string; readonly persistHint: string;
    readonly annotations: string; readonly annotationsHint: string; readonly color: string;
    readonly colors: Record<HighlightColorName, string>; readonly on: string; readonly off: string;
    readonly cancel: string;
  };
  readonly visual: boolean;
  readonly comment: boolean;
  readonly marks: boolean;
  readonly color: HighlightColorName;
  readonly scroll: ReaderScrollConfig;
  readonly status: string;
  readonly mineru: ReaderCredentialModel;
  readonly semanticScholar: ReaderCredentialModel;
}

export type ReaderPageCommand =
  | { readonly type: 'visual' | 'comment' | 'marks' | 'stop'; readonly value: boolean }
  | { readonly type: 'mode'; readonly value: ScrollMode }
  | { readonly type: 'color'; readonly value: HighlightColorName }
  | { readonly type: 'number'; readonly setting: ReaderScrollNumberSetting; readonly value: string }
  | { readonly type: 'saveCredential'; readonly provider: 'mineru' | 'semanticScholar'; readonly value: string }
  | { readonly type: 'forgetCredential'; readonly provider: 'mineru' | 'semanticScholar' };
