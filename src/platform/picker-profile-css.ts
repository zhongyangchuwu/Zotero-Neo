const MAX_BYTES = 1024 * 1024;

/** Reads an optional stylesheet from the active Zotero profile, not the data directory. */
export async function readPickerProfileCss(): Promise<string> {
  if (typeof Zotero === 'undefined') return '';
  const profile =
    typeof Zotero.getProfileDirectory === 'function'
      ? Zotero.getProfileDirectory()
      : typeof Services !== 'undefined' && Services.dirsvc
        ? Services.dirsvc.get('ProfD', Components.interfaces.nsIFile)
        : null;
  if (!profile) return '';
  const file = profile.clone();
  file.append('docs');
  if (!file.exists()) return '';
  if (file.isSymlink() || !file.isDirectory()) throw new Error('Unsafe Picker CSS directory');
  file.append('custom-picker.css');
  if (!file.exists()) return '';
  if (file.isSymlink() || !file.isFile() || file.fileSize > MAX_BYTES)
    throw new Error('Unsafe or oversized Picker CSS file');
  const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
  if (typeof text !== 'string') throw new Error('Picker CSS file could not be read');
  return text;
}
