export interface PreparationReactModel {
  title: string;
  help: string;
  selection: string;
  names: string[];
  token: string;
  verify: string;
  credentialHelp: string;
  credentialHelpURL: string;
  credentialHint: string;
  credentialChecking: boolean;
  credentialStatus: string;
  start: string;
  retry: string;
  stop: string;
  close: string;
  status: string;
  busy: boolean;
  startDisabled: boolean;
  retryDisabled: boolean;
  stopDisabled: boolean;
  rows: Array<{ text: string; receipt: string }>;
}

export type PreparationReactCommand = {
  type:
    | 'start'
    | 'retry'
    | 'stop'
    | 'close'
    | 'credential-change'
    | 'credential-composition'
    | 'credential-verify'
    | 'credential-help';
};
