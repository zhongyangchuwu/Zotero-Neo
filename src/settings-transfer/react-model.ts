export interface SettingsTransferField {
  readonly id: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly selected: boolean;
  readonly secret: boolean;
  readonly requiresRestart: boolean;
  readonly blocked?: string;
  readonly canMap: boolean;
}
/** Passwords and unredacted secret values must never cross the React model boundary. */
export interface SettingsTransferModel {
  readonly chinese: boolean;
  readonly mode: 'export' | 'import';
  readonly adapters: readonly {
    readonly id: string;
    readonly label: string;
    readonly selected: boolean;
  }[];
  readonly includeSecrets: boolean;
  readonly includeLibrarySettings: boolean;
  readonly busy: boolean;
  readonly status: string;
  readonly error: boolean;
  readonly sourcePath: string;
  readonly backupPath: string;
  readonly groups: readonly {
    readonly id: string;
    readonly label: string;
    readonly selected: boolean;
    readonly fields: readonly SettingsTransferField[];
  }[];
  readonly issues: readonly string[];
  readonly receipts: readonly string[];
  readonly canApply: boolean;
  readonly selectedCount: number;
}
export type SettingsTransferCommand =
  | {
      readonly type:
        | 'close'
        | 'stop'
        | 'export'
        | 'choose-file'
        | 'inspect'
        | 'choose-backup'
        | 'apply';
    }
  | { readonly type: 'mode'; readonly value: 'export' | 'import' }
  | {
      readonly type: 'adapter' | 'field' | 'category';
      readonly id: string;
      readonly checked: boolean;
    }
  | { readonly type: 'include-secrets' | 'include-library'; readonly checked: boolean }
  | { readonly type: 'map'; readonly id: string };
