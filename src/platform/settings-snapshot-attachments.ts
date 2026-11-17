import {
  SettingsSnapshotError,
  type SettingsOperationContext,
} from '../settings-snapshots/contracts';
import { assertSettingsCurrent } from '../settings-snapshots/document';
import { MAX_SETTINGS_ARMORED_BYTES } from '../settings-snapshots/crypto-protocol';
import type {
  CreateManagedSnapshot,
  SnapshotAttachmentSource,
  SnapshotLibraryLocation,
} from '../settings-snapshots/ports';

export interface SnapshotAttachmentIdentity {
  readonly path: string;
  readonly digest: string;
  readonly title: string;
  readonly collections: readonly number[];
}
export interface SnapshotAttachmentContents {
  readonly source: SnapshotAttachmentSource;
  readonly text: string;
  readonly identity: SnapshotAttachmentIdentity;
}

function io(): typeof IOUtils {
  if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
  return IOUtils;
}
function fail(code: string, message: string): never {
  throw new SettingsSnapshotError(code, message);
}
function writable(libraryID: number): void {
  const library = Zotero.Libraries.get(libraryID);
  if (!library || !library.editable || !library.filesEditable)
    fail('read-only', 'The library does not allow changes to stored snapshot attachments.');
}
function collection(libraryID: number, id: number | null): void {
  if (id === null) return;
  const value = Zotero.Collections.get(id);
  if (!value || value.libraryID !== libraryID || value.deleted)
    fail('invalid-collection', 'Choose an existing collection in the snapshot library.');
}
function source(item: Zotero.Item): SnapshotAttachmentSource {
  return { libraryID: item.libraryID, itemKey: item.key, title: String(item.getField('title')) };
}
function pending(item: Zotero.Item): boolean {
  return [1, 4, 5, 'to_download', 'force_download', 'in_conflict'].includes(
    item.attachmentSyncState,
  );
}
function assertCleanAttachment(item: Zotero.Item): void {
  if (item.hasChanged())
    fail(
      'dirty-attachment',
      'The attachment has unsaved native edits. Save or discard them in Zotero before updating this snapshot.',
    );
}
function assertAttachmentMetadata(item: Zotero.Item, expected: SnapshotAttachmentIdentity): void {
  if (
    item.getFilePath() !== expected.path ||
    String(item.getField('title')) !== expected.title ||
    JSON.stringify(
      item
        .getCollections()
        .slice()
        .sort((a, b) => a - b),
    ) !== JSON.stringify(expected.collections)
  )
    fail('external-change', 'The attachment identity changed before the owned mutation.');
}
async function resolve(
  value: SnapshotAttachmentSource,
  context: SettingsOperationContext,
  write = false,
): Promise<Zotero.Item> {
  assertSettingsCurrent(context);
  const item = await Zotero.Items.getByLibraryAndKeyAsync(value.libraryID, value.itemKey);
  assertSettingsCurrent(context);
  if (!item || item.deleted || !item.isAttachment())
    fail(
      'missing-attachment',
      'The snapshot attachment was deleted or is unavailable. It will not be recreated.',
    );
  // Public bulk hydration skips already-loaded data and keeps native cache/notifier ownership intact.
  await Zotero.Items.loadDataTypes([item], ['itemData', 'collections']);
  assertSettingsCurrent(context);
  if (item.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_IMPORTED_FILE)
    fail('unsupported-attachment', 'Choose a stored file attachment.');
  if (write) {
    writable(value.libraryID);
    assertCleanAttachment(item);
  }
  if (pending(item))
    fail(
      'download-pending',
      'Native file sync has a pending download or conflict. Download or resolve it in Zotero before reading or updating.',
    );
  return item;
}
async function contents(
  item: Zotero.Item,
  context: SettingsOperationContext,
): Promise<SnapshotAttachmentContents> {
  const path = await item.getFilePathAsync();
  assertSettingsCurrent(context);
  if (!path)
    fail(
      pending(item) ? 'download-pending' : 'missing-file',
      'The snapshot file is remote, awaiting download, or missing. Download it with Zotero before reading.',
    );
  const stat = await io().stat(path);
  if (stat.size === undefined || stat.size > MAX_SETTINGS_ARMORED_BYTES)
    fail('oversized', 'The snapshot file exceeds the supported size.');
  const digest = await io().computeHexDigest(path, 'sha256');
  const text = await io().readUTF8(path);
  if ((await io().computeHexDigest(path, 'sha256')) !== digest)
    fail('external-change', 'The snapshot changed while it was being read.');
  assertSettingsCurrent(context);
  return {
    source: source(item),
    text,
    identity: {
      path,
      digest,
      title: String(item.getField('title')),
      collections: item
        .getCollections()
        .slice()
        .sort((a, b) => a - b),
    },
  };
}
async function checked(
  value: SnapshotAttachmentSource,
  expected: SnapshotAttachmentIdentity,
  context: SettingsOperationContext,
): Promise<{ item: Zotero.Item; value: SnapshotAttachmentContents }> {
  const item = await resolve(value, context, true);
  const current = await contents(item, context);
  assertCleanAttachment(item);
  if (JSON.stringify(current.identity) !== JSON.stringify(expected))
    fail(
      'external-change',
      'The attachment content or location changed outside this binding. Existing data is preserved; create a new snapshot to resume.',
    );
  return { item, value: current };
}
/** Admit only clean cached items after native transaction queueing; never persist another owner's edits. */
async function saveOwnedChange(
  value: SnapshotAttachmentSource,
  expected: SnapshotAttachmentIdentity,
  context: SettingsOperationContext,
  change: (item: Zotero.Item) => void,
): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    const item = await resolve(value, context, true);
    assertAttachmentMetadata(item, expected);
    assertSettingsCurrent(context);
    assertCleanAttachment(item);
    change(item);
    await item.save();
  });
}
async function tracked(
  stored: SnapshotAttachmentContents,
  context: SettingsOperationContext,
): Promise<void> {
  await checked(stored.source, stored.identity, context);
  // Request an upload without changing the last synced hash/mtime: native sync retains its conflict baseline.
  await saveOwnedChange(stored.source, stored.identity, context, (item) => {
    item.attachmentSyncState = 'to_upload';
  });
  await checked(stored.source, stored.identity, context);
}
function publicationError(): never {
  fail(
    'publication-ambiguous',
    'Snapshot publication could not be confirmed. The attachment and recovery files are retained. Inspect them before creating a new binding; local publication does not prove cross-device sync.',
  );
}

/** Only public native item/library/file APIs; no pane or tree access. */
export function createSnapshotAttachments() {
  return {
    async locations(
      context: SettingsOperationContext,
    ): Promise<readonly SnapshotLibraryLocation[]> {
      assertSettingsCurrent(context);
      return Zotero.Libraries.getAll()
        .filter((library) => library.libraryType === 'user' || library.libraryType === 'group')
        .map((library) => ({
          libraryID: library.libraryID,
          label: Zotero.Libraries.getName(library.libraryID),
          writable: library.editable && library.filesEditable,
          collections: Zotero.Collections.getByLibrary(library.libraryID, true)
            .filter((value) => !value.deleted)
            .map((value) => ({ id: value.id, label: value.name })),
        }));
    },
    async sources(
      libraryID: number,
      context: SettingsOperationContext,
    ): Promise<readonly SnapshotAttachmentSource[]> {
      assertSettingsCurrent(context);
      if (!Zotero.Libraries.get(libraryID))
        fail('missing-library', 'The selected library is unavailable.');
      const items = await Zotero.Items.getAll(libraryID, false, false);
      assertSettingsCurrent(context);
      const candidates = items.filter(
        (item) =>
          item.isAttachment() &&
          item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE &&
          (/\.(?:json|age)$/iu.test(item.attachmentFilename || '') ||
            item.attachmentContentType === 'application/json'),
      );
      await Zotero.Items.loadDataTypes(candidates, ['itemData']);
      assertSettingsCurrent(context);
      return candidates.map(source);
    },
    async read(
      value: SnapshotAttachmentSource,
      context: SettingsOperationContext,
    ): Promise<SnapshotAttachmentContents> {
      try {
        return await contents(await resolve(value, context), context);
      } catch (error) {
        if (error instanceof SettingsSnapshotError) throw error;
        fail('attachment-read-failed', 'Zotero could not read the snapshot attachment.');
      }
    },
    async inspect(
      value: SnapshotAttachmentSource,
      expected: SnapshotAttachmentIdentity,
      context: SettingsOperationContext,
    ): Promise<SnapshotAttachmentContents> {
      try {
        const item = await resolve(value, context, true);
        const current = await contents(item, context);
        assertCleanAttachment(item);
        // A binding follows the stable library/item key. Native renames, collection edits and
        // stored-file relocations may rebase only while the expected file bytes remain unchanged.
        if (current.identity.digest !== expected.digest)
          fail(
            'external-change',
            'The attachment content changed outside this binding. Existing data is preserved; create a new snapshot to resume.',
          );
        return current;
      } catch (error) {
        if (error instanceof SettingsSnapshotError) throw error;
        fail(
          'attachment-read-failed',
          'Zotero could not inspect the snapshot attachment. Existing data was preserved.',
        );
      }
    },
    async create(
      request: CreateManagedSnapshot,
      text: string,
      context: SettingsOperationContext,
    ): Promise<SnapshotAttachmentContents> {
      assertSettingsCurrent(context);
      writable(request.libraryID);
      collection(request.libraryID, request.collectionID);
      const file = Zotero.getTempDirectory().clone();
      file.append(`zotero-neo-settings.${request.container}`);
      file.createUnique(0, 0o600);
      let imported = false;
      try {
        await io().writeUTF8(file.path, text);
        const size = (await io().stat(file.path)).size;
        if (size === undefined || size > MAX_SETTINGS_ARMORED_BYTES)
          fail('oversized', 'The snapshot exceeds the supported size.');
        assertSettingsCurrent(context);
        writable(request.libraryID);
        collection(request.libraryID, request.collectionID);
        const item = await Zotero.Attachments.importFromFile({
          file,
          libraryID: request.libraryID,
          title: request.title,
          collections: request.collectionID === null ? [] : [request.collectionID],
          contentType:
            request.container === 'json' ? 'application/json' : 'application/octet-stream',
          charset: 'UTF-8',
        });
        imported = true;
        const stored = await contents(item, context);
        if (stored.text !== text) publicationError();
        assertSettingsCurrent(context);
        await tracked(stored, context);
        return stored;
      } catch (error) {
        if (imported) publicationError();
        if (error instanceof SettingsSnapshotError) throw error;
        fail('attachment-create-failed', 'Zotero could not create the snapshot attachment.');
      } finally {
        await io().remove(file.path, { ignoreAbsent: true });
      }
    },
    async publish(
      value: SnapshotAttachmentSource,
      expected: SnapshotAttachmentIdentity,
      text: string,
      context: SettingsOperationContext,
    ): Promise<SnapshotAttachmentContents> {
      let stage: string | null = null;
      let recovery: string | null = null;
      let displaced = false;
      let published = false;
      try {
        await checked(value, expected, context);
        const parent = Zotero.File.pathToFile(expected.path).parent;
        if (!parent) fail('missing-file', 'The snapshot storage directory is unavailable.');
        stage = await io().createUniqueFile(parent.path, '.neo-settings-stage', 0o600);
        await io().writeUTF8(stage, text);
        const size = (await io().stat(stage)).size;
        if (size === undefined || size > MAX_SETTINGS_ARMORED_BYTES)
          fail('oversized', 'The snapshot exceeds the supported size.');
        await checked(value, expected, context);
        recovery = await io().createUniqueFile(parent.path, '.neo-settings-recovery', 0o600);
        await io().remove(recovery);
        assertSettingsCurrent(context);
        await io().move(expected.path, recovery, { noOverwrite: true });
        displaced = true;
        if ((await io().computeHexDigest(recovery, 'sha256')) !== expected.digest)
          fail('external-change', 'External changes were preserved in the recovery file.');
        // Recheck native identity/permissions after displacement. Never overwrite a file placed by sync in the meantime.
        const item = await resolve(value, context, true);
        assertAttachmentMetadata(item, expected);
        assertSettingsCurrent(context);
        await io().move(stage, expected.path, { noOverwrite: true });
        stage = null;
        published = true;
        const stored = await contents(item, context);
        if (stored.text !== text) publicationError();
        assertSettingsCurrent(context);
        await tracked(stored, context);
        await io().remove(recovery);
        recovery = null;
        return stored;
      } catch (error) {
        if (displaced && !published && recovery) {
          // Restore only into an empty destination. A racing external writer always wins possession, never loses bytes.
          try {
            await io().move(recovery, expected.path, { noOverwrite: true });
            recovery = null;
          } catch {
            publicationError();
          }
        }
        if (published) publicationError();
        if (error instanceof SettingsSnapshotError) throw error;
        fail(
          'attachment-write-failed',
          'The snapshot could not be updated. Existing content was preserved.',
        );
      } finally {
        if (stage) await io().remove(stage, { ignoreAbsent: true });
      }
    },
    async configure(
      value: SnapshotAttachmentSource,
      expected: SnapshotAttachmentIdentity,
      options: { title: string; collectionID?: number | null },
      context: SettingsOperationContext,
    ): Promise<SnapshotAttachmentContents> {
      if (options.collectionID !== undefined) collection(value.libraryID, options.collectionID);
      const collections =
        options.collectionID === undefined
          ? [...expected.collections]
          : options.collectionID === null
            ? []
            : [options.collectionID];
      await checked(value, expected, context);
      try {
        await saveOwnedChange(value, expected, context, (item) => {
          item.setField('title', options.title);
          item.setCollections(collections);
        });
        const stored = await contents(await resolve(value, context, true), context);
        if (
          stored.identity.path !== expected.path ||
          stored.identity.digest !== expected.digest ||
          stored.identity.title !== options.title ||
          JSON.stringify(stored.identity.collections) !== JSON.stringify(collections)
        )
          fail(
            'configure-ambiguous',
            'The attachment changed while its metadata was being saved. File contents were not overwritten.',
          );
        return stored;
      } catch (error) {
        if (error instanceof SettingsSnapshotError) throw error;
        fail(
          'configure-ambiguous',
          'Attachment metadata changes could not be confirmed. File contents were not rewritten; inspect the attachment before continuing.',
        );
      }
    },
  };
}
