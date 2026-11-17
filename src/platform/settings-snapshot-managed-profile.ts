import { SettingsSnapshotError } from '../settings-snapshots/contracts';

const BINDINGS = 'extensions.zotero-neo.settingsSnapshots.managed';

/** Native preferences are profile-local, not synced item data or exported snapshot fields. */
export function readManagedSnapshotBindings(): unknown {
  const text = Zotero.Prefs.get(BINDINGS, true);
  if (text === undefined || text === null || text === '') return [];
  if (typeof text !== 'string')
    throw new SettingsSnapshotError(
      'binding-storage',
      'Local snapshot bindings are unreadable. No attachments were changed.',
    );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SettingsSnapshotError(
      'binding-storage',
      'Local snapshot bindings are unreadable. No attachments were changed.',
    );
  }
}
export function writeManagedSnapshotBindings(value: unknown): void {
  try {
    Zotero.Prefs.set(BINDINGS, JSON.stringify(value), true);
  } catch {
    throw new SettingsSnapshotError(
      'binding-storage',
      'Local snapshot binding state could not be saved. Inspect any published attachment before retrying.',
    );
  }
}
export function managedSnapshotSemanticIdentity(text: string): string {
  return Zotero.Utilities.Internal.md5(text);
}
export async function initializeManagedSnapshots(): Promise<void> {
  await Zotero.initializationPromise;
}
export function reportManagedSnapshotFailure(): void {
  Zotero.logError(
    new Error(
      'Settings snapshot background update failed. Open Settings Snapshots to inspect the paused target.',
    ),
  );
}
