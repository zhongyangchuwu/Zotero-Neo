export interface ComparisonTarget {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly action: string;
  readonly correction?: {
    readonly regionID: string;
    readonly column: number;
    readonly corrected: boolean;
    readonly bodies: readonly { readonly id: string; readonly title: string }[];
  };
}

export interface ComparisonColumn {
  readonly label: string;
  readonly error: string;
  readonly summary: string;
  readonly cache: string;
  readonly targets: readonly ComparisonTarget[];
  readonly truncated: string;
  readonly page: number;
  readonly pageCount: number;
  readonly previousLabel: string;
  readonly nextLabel: string;
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
  readonly credentialVerifyLabel: string;
  readonly credentialHelpLabel: string;
  readonly credentialHelpURL: string;
  readonly credentialHint: string;
  readonly credentialStatus: string;
  readonly credentialChecking: boolean;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly parseLabel: string;
  readonly refreshLabel: string;
  readonly copyLabel: string;
  readonly closeLabel: string;
  readonly status: string;
  readonly vocabularyLabel: string;
  readonly vocabulary: string;
  readonly corrections: {
    readonly hint: string;
    readonly body: string;
    readonly restore: string;
    readonly caption: string;
    readonly target: string;
    readonly choose: string;
    readonly saved: string;
    readonly undo: string;
    readonly undoColumns: readonly number[];
    readonly busy: boolean;
  };
  readonly columns: readonly ComparisonColumn[];
}

export type DocumentComparisonCommand =
  | {
      readonly type:
        | 'close'
        | 'parse'
        | 'refresh'
        | 'copy'
        | 'credential-change'
        | 'credential-composition'
        | 'credential-verify'
        | 'credential-help';
    }
  | { readonly type: 'provider'; readonly value: 'mineru' | 'oxr' }
  | { readonly type: 'endpoint'; readonly value: string }
  | {
      readonly type: 'correct-body' | 'correct-restore';
      readonly column: number;
      readonly regionID: string;
    }
  | {
      readonly type: 'correct-caption';
      readonly column: number;
      readonly regionID: string;
      readonly bodyID: string;
    }
  | { readonly type: 'correct-undo'; readonly column: number }
  | { readonly type: 'regions-page'; readonly column: number; readonly page: number }
  | { readonly type: 'locate'; readonly id: string };
