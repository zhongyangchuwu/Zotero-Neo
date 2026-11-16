import { ArtifactError, type ArtifactSource } from '../artifacts/contracts';

export const ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;
export const ARTIFACT_PREFIX = 'zotero-neo-';

export function artifactParentIdentity(parent: Zotero.Item): {
  libraryURI: string;
  parentItemKey: string;
} {
  if (!parent.isRegularItem() || parent.deleted)
    throw new ArtifactError(
      'parent-required',
      'Neo artifacts require an existing regular parent item; attach the PDF to a reference first',
    );
  const libraryURI = String(Zotero.URI.getLibraryURI(parent.libraryID)).replace(/\/$/u, '');
  if (!/^https?:\/\/zotero\.org\/(?:(?:users|groups)\/\d+|users\/local\/\w+)$/u.test(libraryURI))
    throw new ArtifactError('identity-unavailable', 'Zotero library identity is unavailable');
  return { libraryURI, parentItemKey: parent.key };
}

/** Zotero's general URI resolver accepts foreign personal URIs; compare the known local key instead. */
export function artifactBelongsToParent(
  parent: Zotero.Item,
  libraryURI: string,
  parentItemKey: string,
): boolean {
  const identity = artifactParentIdentity(parent);
  if (parentItemKey !== identity.parentItemKey) return false;
  const normalized = libraryURI.replace(/^https:/u, 'http:');
  if (normalized === identity.libraryURI.replace(/^https:/u, 'http:')) return true;
  return (
    parent.libraryID === Zotero.Libraries.userLibraryID &&
    normalized ===
      String(Zotero.URI.getLocalUserURI())
        .replace(/^https:/u, 'http:')
        .replace(/\/$/u, '')
  );
}

export async function artifactPDF(
  itemID: number,
): Promise<{
  item: Zotero.Item;
  parent: Zotero.Item;
  source: ArtifactSource;
  isCurrent: () => Promise<boolean>;
}> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || item.deleted || !item.isPDFAttachment())
    throw new ArtifactError('source-unavailable', 'PDF attachment unavailable');
  const parent = item.parentID ? await Zotero.Items.getAsync(item.parentID) : null;
  if (!parent)
    throw new ArtifactError(
      'parent-required',
      'Attach this standalone PDF to a regular reference before saving Neo artifacts',
    );
  artifactParentIdentity(parent);
  const path = await item.getFilePathAsync();
  if (!path) throw new ArtifactError('source-unavailable', 'PDF file is not available locally');
  const value = await Zotero.Utilities.Internal.md5Async(path);
  if (!/^[a-f0-9]{32}$/iu.test(value))
    throw new ArtifactError('source-unavailable', 'PDF MD5 digest unavailable');
  const attachmentKey = item.key,
    parentKey = parent.key,
    parentID = parent.id,
    libraryID = parent.libraryID;
  return {
    item,
    parent,
    source: {
      attachmentKey,
      contentHash: { algorithm: 'md5', value: value.toLowerCase() },
      precision: 'document',
    },
    async isCurrent() {
      const currentItem = await Zotero.Items.getAsync(itemID),
        currentParent = await Zotero.Items.getAsync(parentID);
      if (
        !currentItem ||
        currentItem.deleted ||
        currentItem.key !== attachmentKey ||
        currentItem.libraryID !== libraryID ||
        currentItem.parentID !== parentID ||
        !currentParent ||
        currentParent.deleted ||
        currentParent.key !== parentKey ||
        currentParent.libraryID !== libraryID ||
        !currentParent.isRegularItem()
      )
        return false;
      const currentPath = await currentItem.getFilePathAsync();
      return currentPath === path && (await Zotero.Utilities.Internal.md5Async(path)) === value;
    },
  };
}

export async function artifactAttachments(parent: Zotero.Item): Promise<Zotero.Item[]> {
  const items = await Zotero.Items.getAsync(parent.getAttachments(true));
  // Trashed artifact metadata is evidence of removal, not permission to resurrect a sidecar.
  return items.filter(
    (item) =>
      item.attachmentContentType === 'application/json' ||
      item.attachmentFilename?.endsWith('.json') ||
      item.attachmentFilename?.startsWith(ARTIFACT_PREFIX) ||
      item.getField?.('title') === 'Zotero Neo artifact',
  );
}

export async function readArtifactAttachment(item: Zotero.Item): Promise<string> {
  const path = await item.getFilePathAsync();
  if (!path)
    throw new ArtifactError('pending-download', 'Artifact file is not downloaded or is missing');
  const file = Zotero.File.pathToFile(path);
  if (!file.exists())
    throw new ArtifactError('pending-download', 'Artifact file is not downloaded or is missing');
  if (file.fileSize > ARTIFACT_MAX_BYTES)
    throw new ArtifactError('oversized', 'Artifact exceeds 32 MiB');
  const text = await Zotero.File.getContentsAsync(path, 'UTF-8', ARTIFACT_MAX_BYTES);
  if (typeof text !== 'string')
    throw new ArtifactError('unavailable', 'Artifact file is unreadable');
  return text;
}

export async function importArtifactAttachment(
  parent: Zotero.Item,
  text: string,
  current: () => boolean | Promise<boolean>,
): Promise<Zotero.Item> {
  const library = Zotero.Libraries.get(parent.libraryID);
  if (!library || !library.editable || !library.filesEditable)
    throw new ArtifactError('read-only', 'This library does not allow stored artifact attachments');
  const file = Zotero.getTempDirectory().clone();
  file.append(`${ARTIFACT_PREFIX}artifact.json`);
  file.createUnique(0, 0o600);
  try {
    await Zotero.File.putContentsAsync(file.path, text, 'UTF-8');
    if (file.fileSize > ARTIFACT_MAX_BYTES)
      throw new ArtifactError('oversized', 'Artifact exceeds 32 MiB');
    if (!(await current()))
      throw new ArtifactError('stale-source', 'Artifact source changed before publication');
    const item = await Zotero.Attachments.importFromFile({
      file,
      parentItemID: parent.id,
      libraryID: parent.libraryID,
      contentType: 'application/json',
      title: 'Zotero Neo artifact',
      charset: 'UTF-8',
    });
    if ((await readArtifactAttachment(item)) !== text)
      throw new ArtifactError(
        'verification-failed',
        'Stored artifact could not be read back; attachment retained for recovery',
      );
    return item;
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError(
      'publish-unavailable',
      `Zotero could not store the artifact: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await Zotero.File.removeIfExists(file.path);
    await Zotero.File.removeIfExists(`${file.path}.tmp`);
  }
}
