import type { Cleanup } from '../core/cleanup';
import type {
  SettingsAdapter,
  SettingsContainer,
  SettingsCryptoContext,
  SettingsOperationContext,
} from './contracts';

export interface SnapshotTemplateField {
  readonly key: string;
  readonly label: string;
  readonly type: 'boolean' | 'number' | 'string';
  /** Constraints come only from the current bundled control, never a snapshot/template file. */
  readonly minimum?: number;
  readonly maximum?: number;
  readonly values?: readonly (boolean | number | string)[];
  readonly secret: boolean;
  readonly requiresRestart: boolean;
  readonly supported: boolean;
  readonly reason?: string;
  readonly source: string;
}
export interface SnapshotPluginTemplate {
  readonly pluginID: string;
  readonly adapterID: string;
  readonly label: string;
  readonly version: string;
  readonly revision: string;
  readonly status: 'builtin' | 'draft' | 'reviewed' | 'needs-review' | 'unavailable';
  readonly fields: readonly SnapshotTemplateField[];
  readonly reviewedKeys: readonly string[];
  readonly issues: readonly string[];
}
/** Only locally reviewed templates can contribute adapters; imported data never grants write access. */
export interface SettingsTemplateCatalogPort {
  readonly adapters: readonly SettingsAdapter[];
  list(context: SettingsOperationContext): Promise<readonly SnapshotPluginTemplate[]>;
  scan(pluginID: string, context: SettingsOperationContext): Promise<SnapshotPluginTemplate>;
  review(
    pluginID: string,
    revision: string,
    fields: readonly { readonly key: string; readonly secret: boolean }[],
    context: SettingsOperationContext,
  ): Promise<SnapshotPluginTemplate>;
  exportTemplate(pluginID: string, context: SettingsOperationContext): Promise<string>;
  importTemplate(text: string, context: SettingsOperationContext): Promise<SnapshotPluginTemplate>;
  dispose(): void;
}
export interface SnapshotLibraryLocation {
  readonly libraryID: number;
  readonly label: string;
  readonly writable: boolean;
  readonly collections: readonly { readonly id: number; readonly label: string }[];
}
export interface SnapshotAttachmentSource {
  readonly libraryID: number;
  readonly itemKey: string;
  readonly title: string;
}
export interface ManagedSnapshotTarget {
  readonly id: string;
  readonly adapterID: string;
  readonly source: SnapshotAttachmentSource;
  readonly title: string;
  readonly collectionID: number | null;
  readonly container: SettingsContainer;
  readonly autoUpdate: boolean;
  readonly includeSecrets: boolean;
  readonly includeLibrarySettings: boolean;
  readonly status: 'ready' | 'paused' | 'error';
  readonly message: string;
  readonly updatedAt: string;
}
export interface CreateManagedSnapshot {
  readonly adapterID: string;
  readonly libraryID: number;
  readonly collectionID: number | null;
  readonly title: string;
  readonly container: SettingsContainer;
  readonly autoUpdate: boolean;
  readonly includeSecrets: boolean;
  readonly includeLibrarySettings: boolean;
  /** Explicit acknowledgement of attachment visibility and native data/file sync dependencies. */
  readonly consent: boolean;
}
/** Attachments and files share the same document/codec; bindings and scheduling remain profile-local. */
export interface ManagedSettingsSnapshotsPort {
  start(window: Window): Cleanup;
  list(context: SettingsOperationContext): Promise<readonly ManagedSnapshotTarget[]>;
  locations(context: SettingsOperationContext): Promise<readonly SnapshotLibraryLocation[]>;
  sources(
    libraryID: number,
    context: SettingsOperationContext,
  ): Promise<readonly SnapshotAttachmentSource[]>;
  read(source: SnapshotAttachmentSource, context: SettingsCryptoContext): Promise<string>;
  create(
    request: CreateManagedSnapshot,
    password: string,
    context: SettingsCryptoContext,
  ): Promise<ManagedSnapshotTarget>;
  update(
    id: string,
    password: string,
    context: SettingsCryptoContext,
  ): Promise<ManagedSnapshotTarget>;
  configure(
    id: string,
    options: {
      readonly title: string;
      readonly collectionID: number | null;
      readonly autoUpdate: boolean;
      readonly expected: Pick<ManagedSnapshotTarget, 'title' | 'collectionID' | 'autoUpdate'>;
    },
    context: SettingsOperationContext,
  ): Promise<ManagedSnapshotTarget>;
  /** Remove only the device-local binding; never delete the user's attachment. */
  forget(id: string, context: SettingsOperationContext): Promise<void>;
  dispose(): void;
}
