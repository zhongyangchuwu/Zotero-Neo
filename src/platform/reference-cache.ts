const MAX_BYTES = 4 * 1024 * 1024;

function cacheFile(): nsIFile {
  const directory =
    typeof Zotero.getProfileDirectory === 'function'
      ? Zotero.getProfileDirectory()
      : Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
  const file = directory.clone();
  file.append('zotero-neo-reference-cache.json');
  return file;
}

export async function readReferenceCache(): Promise<string | null> {
  const file = cacheFile();
  if (!file.exists()) return null;
  if (file.fileSize > MAX_BYTES) throw new Error('Reference cache exceeds size limit');
  const contents = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
  if (typeof contents !== 'string') throw new Error('Reference cache could not be read');
  return contents;
}

export async function writeReferenceCache(
  contents: string,
  current: () => boolean = () => true,
): Promise<void> {
  if (contents.length > MAX_BYTES) throw new Error('Reference cache exceeds size limit');
  const file = cacheFile();
  const stage = file.clone();
  stage.leafName += `.stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await Zotero.File.putContentsAsync(stage.path, contents, 'UTF-8');
    if (stage.fileSize > MAX_BYTES) throw new Error('Reference cache exceeds size limit');
    if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
    if (!current()) return;
    await IOUtils.move(stage.path, file.path);
  } finally {
    await Zotero.File.removeIfExists(stage.path);
    await Zotero.File.removeIfExists(`${stage.path}.tmp`);
  }
}
