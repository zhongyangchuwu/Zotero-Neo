import type { WorkspaceExtensionManifest } from '../modules/extensions/workspace';

export type SettingsValue =
  | null
  | boolean
  | number
  | string
  | readonly SettingsValue[]
  | { readonly [key: string]: SettingsValue };
export type SettingState =
  | { readonly kind: 'set'; readonly value: SettingsValue }
  | { readonly kind: 'reset' };
export interface SettingsEntry {
  readonly key: string;
  readonly state: SettingState;
}
export interface SettingsSection {
  readonly adapterID: string;
  readonly schemaVersion: number;
  readonly sourceVersion: string;
  readonly entries: readonly SettingsEntry[];
}
export interface SettingsDocument {
  readonly format: 'zotero-neo-settings';
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly producer: { readonly name: 'Zotero Neo'; readonly version: string };
  readonly zoteroVersion: string;
  readonly sections: readonly SettingsSection[];
  readonly extensions?: WorkspaceExtensionManifest;
}
export interface SettingsIssue {
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly adapterID?: string;
  readonly key?: string;
}
export type SettingsContainer = 'json' | 'age';
export interface SettingsOperationContext {
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
  /** Actual container selected/detected locally, never a claim from the document. */
  readonly container?: SettingsContainer;
}
export interface SettingsCaptureContext extends SettingsOperationContext {
  readonly includeSecrets: boolean;
  readonly includeLibrarySettings: boolean;
}
export interface SettingsPlanContext extends SettingsOperationContext {
  /** User-chosen paths, indexed by adapterID + ':' + entry key. Never supplied by the file. */
  readonly paths?: Readonly<Record<string, string>>;
}
export interface SettingsChange {
  readonly adapterID: string;
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly secret: boolean;
  readonly before: SettingState;
  readonly after: SettingState;
  readonly selected: boolean;
  readonly requiresRestart: boolean;
  /** Display strategy comes only from the local trusted template, never the snapshot. */
  readonly presentation?: 'item-attributes';
  readonly blocked?: string;
  readonly mapping?: { readonly kind: 'file' | 'directory'; readonly source: string };
}
export interface AdapterRestorePlan {
  readonly adapterID: string;
  /** Version of the target product, also used to make a recovery backup. */
  readonly sourceVersion: string;
  readonly changes: readonly SettingsChange[];
  readonly issues: readonly SettingsIssue[];
}
export interface SettingsEntryReceipt {
  readonly adapterID: string;
  readonly key: string;
  readonly status: 'applied' | 'unchanged' | 'conflict' | 'failed' | 'cancelled' | 'skipped';
  readonly message?: string;
  readonly requiresRestart?: boolean;
}
export interface SettingsAdapter {
  readonly id: string;
  readonly label: string;
  readonly schemaVersion: number;
  readonly sourceVersion: string;
  capture(
    context: SettingsCaptureContext,
  ): Promise<{ readonly section: SettingsSection; readonly issues: readonly SettingsIssue[] }>;
  plan(section: SettingsSection, context: SettingsPlanContext): Promise<AdapterRestorePlan>;
  /** Receives only explicitly selected changes. Implementations recheck admission at each real mutation. */
  apply(
    changes: readonly SettingsChange[],
    context: SettingsOperationContext,
  ): Promise<readonly SettingsEntryReceipt[]>;
}
export interface SettingsCryptoContext extends SettingsOperationContext {
  readonly window: Window;
}
export interface SettingsFileCodec {
  seal(
    document: SettingsDocument,
    password: string,
    context: SettingsCryptoContext,
    container?: SettingsContainer,
  ): Promise<string>;
  open(
    ciphertext: string,
    password: string,
    context: SettingsCryptoContext,
  ): Promise<SettingsDocument>;
  dispose(): void;
}
export interface SettingsRestoreReceipt {
  readonly entries: readonly SettingsEntryReceipt[];
  readonly cancelled: boolean;
}
export class SettingsSnapshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SettingsSnapshotError';
  }
}

export function assertSettingsCurrent(context: SettingsOperationContext): void {
  if (context.signal.aborted || !context.isCurrent())
    throw new SettingsSnapshotError('cancelled', 'The settings operation was cancelled');
}
