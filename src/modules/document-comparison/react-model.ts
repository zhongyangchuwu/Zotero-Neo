export interface ComparisonTarget {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly action: string;
}

export interface ComparisonColumn {
  readonly label: string;
  readonly error: string;
  readonly summary: string;
  readonly cache: string;
  readonly targets: readonly ComparisonTarget[];
  readonly truncated: string;
}

/** Display data only: credentials and Reader objects never cross the UI boundary. */
export interface DocumentComparisonModel {
  readonly title: string;
  readonly description: string;
  readonly providerLabel: string;
  readonly endpointLabel: string;
  readonly provider: 'mineru' | 'oxr';
  readonly endpoint: string;
  readonly credentialLabel: string;
  readonly credentialSaveLabel: string;
  readonly credentialClearLabel: string;
  readonly credentialStatus: string;
  readonly credentialPending: boolean;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly parseLabel: string;
  readonly refreshLabel: string;
  readonly copyLabel: string;
  readonly closeLabel: string;
  readonly status: string;
  readonly vocabularyLabel: string;
  readonly vocabulary: string;
  readonly columns: readonly ComparisonColumn[];
}

export type DocumentComparisonCommand =
  | {
      readonly type:
        | 'close'
        | 'parse'
        | 'refresh'
        | 'copy'
        | 'credential-save'
        | 'credential-clear';
    }
  | { readonly type: 'provider'; readonly value: 'mineru' | 'oxr' }
  | { readonly type: 'endpoint'; readonly value: string }
  | { readonly type: 'locate'; readonly id: string };
