import type { SettingState, SettingsOperationContext } from '../settings-snapshots/contracts';
import { assertSettingsCurrent, assertSettingsTextSize } from '../settings-snapshots/document';
import {
  mainSettingsTemplatePlugins,
  mainSettingsTemplatePreferenceType,
  mainSettingsTemplateDigest,
  observeMainSettingsTemplatePlugins,
  type MainTemplatePlugin,
} from '../toolkit/main';
import { readTransferPreference, writeTransferPreference } from './settings-snapshots-host';

export const MAX_TEMPLATE_BYTES = 512 * 1024;
const FILE_NAME = /^plugin-[a-f0-9]{64}\.json$/u;
function directory(create: boolean): nsIFile {
  const file = (
    typeof Zotero.getProfileDirectory === 'function'
      ? Zotero.getProfileDirectory()
      : Services.dirsvc.get('ProfD', Components.interfaces.nsIFile)
  ).clone();
  file.append('zotero-neo-settings-templates');
  if (create && !file.exists()) file.create(Components.interfaces.nsIFile.DIRECTORY_TYPE!, 0o700);
  if (file.exists() && (file.isSymlink() || !file.isDirectory()))
    throw new Error('Unsafe template directory');
  return file;
}
function target(name: string): nsIFile {
  if (!FILE_NAME.test(name)) throw new Error('Invalid template file identity');
  const file = directory(true);
  file.append(name);
  if (file.exists() && (file.isSymlink() || !file.isFile()))
    throw new Error('Unsafe template file');
  return file;
}
export interface SettingsTemplateHost {
  plugins(): Promise<readonly MainTemplatePlugin[]>;
  preferenceType(key: string): 'boolean' | 'number' | 'string' | null;
  digest(text: string): string;
  readPreference(key: string): SettingState;
  writePreference(key: string, state: SettingState, admit: () => void): 'exact' | 'default';
  readFiles(): Promise<readonly { readonly name: string; readonly text: string }[]>;
  writeFile(name: string, text: string, context: SettingsOperationContext): Promise<void>;
  observePlugins(invalidate: () => void): () => void;
}
export const settingsTemplateHost: SettingsTemplateHost = {
  plugins: mainSettingsTemplatePlugins,
  preferenceType: mainSettingsTemplatePreferenceType,
  digest: mainSettingsTemplateDigest,
  readPreference: readTransferPreference,
  writePreference: writeTransferPreference,
  observePlugins: observeMainSettingsTemplatePlugins,
  async readFiles() {
    const folder = directory(false);
    if (!folder.exists()) return [];
    const files = folder.directoryEntries;
    const result: { name: string; text: string }[] = [];
    let examined = 0,
      bytes = 0;
    while (files.hasMoreElements()) {
      if (++examined > 1024) throw new Error('Template directory exceeds entry limit');
      const file = files.getNext().QueryInterface!(Components.interfaces.nsIFile);
      if (!FILE_NAME.test(file.leafName)) continue;
      if (
        result.length >= 256 ||
        file.isSymlink() ||
        !file.isFile() ||
        file.fileSize > MAX_TEMPLATE_BYTES
      )
        throw new Error('Unsafe or oversized local template store');
      bytes += file.fileSize;
      if (bytes > 16 * 1024 * 1024) throw new Error('Local templates exceed total size limit');
      const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_TEMPLATE_BYTES);
      if (typeof text !== 'string') throw new Error('Template file cannot be read');
      result.push({ name: file.leafName, text });
    }
    return result;
  },
  async writeFile(name, text, context) {
    assertSettingsTextSize(text, MAX_TEMPLATE_BYTES);
    assertSettingsCurrent(context);
    const file = target(name);
    const stage = file.clone();
    stage.leafName += `.stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await Zotero.File.putContentsAsync(stage.path, text, 'UTF-8');
      if (stage.fileSize > MAX_TEMPLATE_BYTES || stage.isSymlink())
        throw new Error('Unsafe staged template');
      if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
      assertSettingsCurrent(context);
      target(name);
      await IOUtils.move(stage.path, file.path);
    } finally {
      await Zotero.File.removeIfExists(stage.path);
      await Zotero.File.removeIfExists(`${stage.path}.tmp`);
    }
  },
};
