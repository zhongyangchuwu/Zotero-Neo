import type { SettingsContainer } from './contracts';
import type {
  ManagedSnapshotTarget,
  SnapshotAttachmentSource,
  SnapshotLibraryLocation,
  SnapshotPluginTemplate,
} from './ports';

export interface SnapshotTargetForm {
  readonly adapterIDs: readonly string[];
  readonly libraryID: number;
  readonly collectionID: number | null;
  readonly title: string;
  readonly container: SettingsContainer;
  readonly autoUpdate: boolean;
  readonly includeSecrets: boolean;
  readonly includeLibrarySettings: boolean;
  readonly editingID: string | null;
}
type TargetWrite =
  | { readonly type: 'target-update'; readonly id: string }
  | { readonly type: 'target-overwrite'; readonly id: string; readonly revision: string };

export interface SettingsSnapshotField {
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
export interface SettingsSnapshotModel {
  readonly chinese: boolean;
  readonly title: string;
  readonly container: SettingsContainer;
  readonly plugins: readonly (SnapshotPluginTemplate & {
    readonly review: readonly {
      readonly key: string;
      readonly portable: boolean;
      readonly secret: boolean;
    }[];
  })[];
  readonly catalogAvailable: boolean;
  readonly managedAvailable: boolean;
  readonly targets: readonly ManagedSnapshotTarget[];
  readonly locations: readonly SnapshotLibraryLocation[];
  readonly sources: readonly SnapshotAttachmentSource[];
  readonly sourceLibraryID: number;
  readonly targetForm: SnapshotTargetForm;
  readonly mode: 'export' | 'import' | 'managed';
  readonly exportFromReview: boolean;
  readonly needsDiffRefresh: boolean;
  readonly awaitingUnlock: boolean;
  readonly reviewingConflict: boolean;
  readonly canAdoptUnchanged: boolean;
  readonly targetPasswordAction?: TargetWrite;
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
  readonly sourceLabel: string;
  readonly hasPreview: boolean;
  readonly groups: readonly {
    readonly id: string;
    readonly label: string;
    readonly selected: boolean;
    readonly fields: readonly SettingsSnapshotField[];
  }[];
  readonly issues: readonly string[];
  readonly receipts: readonly string[];
  readonly canApply: boolean;
  readonly selectedCount: number;
}
export type SettingsSnapshotCommand =
  | {
      readonly type:
        | 'close'
        | 'help'
        | 'stop'
        | 'export'
        | 'choose-file'
        | 'inspect'
        | 'export-current'
        | 'return-to-preview'
        | 'refresh-diff'
        | 'apply';
    }
  | { readonly type: 'mode'; readonly value: SettingsSnapshotModel['mode'] }
  | {
      readonly type: 'adapter' | 'target-adapter' | 'field' | 'category';
      readonly id: string;
      readonly checked: boolean;
    }
  | { readonly type: 'include-secrets' | 'include-library'; readonly checked: boolean }
  | { readonly type: 'map'; readonly id: string }
  | { readonly type: 'container'; readonly value: SettingsContainer }
  | {
      readonly type:
        | 'refresh'
        | 'template-import'
        | 'target-create'
        | 'target-save'
        | 'target-password-cancel'
        | 'target-cancel';
    }
  | TargetWrite
  | {
      readonly type:
        | 'scan'
        | 'target-preview'
        | 'template-export'
        | 'plugin-export'
        | 'target-edit'
        | 'target-forget';
      readonly id: string;
    }
  | {
      readonly type: 'review-field';
      readonly pluginID: string;
      readonly key: string;
      readonly portable: boolean;
      readonly secret: boolean;
    }
  | { readonly type: 'source-library'; readonly libraryID: number }
  | { readonly type: 'source'; readonly libraryID: number; readonly itemKey: string }
  | { readonly type: 'target-form'; readonly value: SnapshotTargetForm };
