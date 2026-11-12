export interface PreparationReactModel {
  title: string;
  help: string;
  selection: string;
  names: string[];
  token: string;
  save: string;
  clear: string;
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
  type: 'start' | 'retry' | 'stop' | 'close' | 'save' | 'clear';
};
