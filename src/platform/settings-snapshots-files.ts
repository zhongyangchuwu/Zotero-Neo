import { SettingsSnapshotError, type SettingsCryptoContext } from '../settings-snapshots/contracts';
import {
  assertSettingsCurrent,
  assertSettingsTextSize,
  validateSettingsDocument,
} from '../settings-snapshots/document';
import { MAX_SETTINGS_ARMORED_BYTES } from '../settings-snapshots/crypto-protocol';

interface NativePicker {
  readonly modeOpen: number;
  readonly modeSave: number;
  readonly modeGetFolder: number;
  readonly returnOK: number;
  readonly returnReplace: number;
  readonly file: string;
  defaultString: string;
  init(window: Window, title: string, mode: number): void;
  appendFilter(label: string, pattern: string): void;
  show(): Promise<number>;
}
export interface SettingsFileChoice {
  readonly path: string;
  readonly replace: boolean;
}
export interface SettingsSnapshotFiles {
  chooseOpen(window: Window): Promise<string | null>;
  chooseSave(window: Window, name: string): Promise<SettingsFileChoice | null>;
  choosePath(window: Window, kind: 'file' | 'directory'): Promise<string | null>;
  read(path: string, context: SettingsCryptoContext): Promise<string>;
  write(
    choice: SettingsFileChoice,
    ciphertext: string,
    context: SettingsCryptoContext,
  ): Promise<void>;
}
function picker(): NativePicker {
  const module = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs') as {
    FilePicker: new () => NativePicker;
  };
  return new module.FilePicker();
}
function fileError(code: string, message: string): never {
  throw new SettingsSnapshotError(code, message);
}

/** Native pickers and atomic byte publication are shared by snapshots and data-only template files. */
export function createSettingsSnapshotFiles(): SettingsSnapshotFiles {
  async function read(path: string, context: SettingsCryptoContext): Promise<string> {
    assertSettingsCurrent(context);
    try {
      const file = Zotero.File.pathToFile(path);
      if (!file.exists() || !file.isFile())
        return fileError('file-unavailable', 'The settings file is not available');
      if (file.fileSize > MAX_SETTINGS_ARMORED_BYTES)
        return fileError('oversized', 'The settings file exceeds the resource limit');
      const contents = await Zotero.File.getContentsAsync(
        path,
        'UTF-8',
        MAX_SETTINGS_ARMORED_BYTES + 1,
      );
      assertSettingsCurrent(context);
      if (typeof contents !== 'string' || contents.length > MAX_SETTINGS_ARMORED_BYTES)
        return fileError('file-unavailable', 'The settings file could not be read completely');
      return contents;
    } catch (error) {
      if (error instanceof SettingsSnapshotError) throw error;
      return fileError('file-unavailable', 'The settings file could not be read');
    }
  }
  return {
    async chooseOpen(window) {
      const dialog = picker();
      dialog.init(window, 'Open Workspace Backup / 打开工作区备份', dialog.modeOpen);
      dialog.appendFilter('Workspace backups and templates / 工作区备份与模板', '*.age;*.json');
      return (await dialog.show()) === dialog.returnOK ? dialog.file : null;
    },
    async chooseSave(window, name) {
      const dialog = picker();
      dialog.init(window, 'Save Workspace Backup / 保存工作区备份', dialog.modeSave);
      dialog.appendFilter(
        name.toLowerCase().endsWith('.json')
          ? 'Standard backup / 普通备份'
          : 'Encrypted backup / 加密备份',
        name.toLowerCase().endsWith('.json') ? '*.json' : '*.age',
      );
      dialog.defaultString = name;
      const result = await dialog.show();
      return result === dialog.returnOK || result === dialog.returnReplace
        ? { path: dialog.file, replace: result === dialog.returnReplace }
        : null;
    },
    async choosePath(window, kind) {
      const dialog = picker();
      dialog.init(
        window,
        'Map a local path / 选择本机路径',
        kind === 'directory' ? dialog.modeGetFolder : dialog.modeOpen,
      );
      return (await dialog.show()) === dialog.returnOK ? dialog.file : null;
    },
    read,
    async write(choice, ciphertext, context) {
      assertSettingsCurrent(context);
      if (ciphertext.length > MAX_SETTINGS_ARMORED_BYTES)
        return fileError('oversized', 'The settings file exceeds the resource limit');
      if (ciphertext.startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) {
        if (!/^[\x09\x0a\x0d\x20-\x7e]*$/u.test(ciphertext))
          return fileError('invalid-ciphertext', 'The age container must be ASCII armored');
      } else {
        assertSettingsTextSize(ciphertext);
        let value: unknown;
        try {
          value = JSON.parse(ciphertext) as unknown;
        } catch {
          return fileError('invalid-file', 'The settings file does not contain valid JSON');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return fileError('invalid-file', 'This is not a snapshot or template document');
        const metadata = value as Record<string, unknown>;
        if (metadata.format === 'zotero-neo-settings') validateSettingsDocument(value);
        else if (metadata.format !== 'zotero-neo-settings-template' || metadata.schemaVersion !== 1)
          return fileError('invalid-file', 'This is not a snapshot or template document');
      }
      const destination = Zotero.File.pathToFile(choice.path),
        parent = destination.parent;
      if (!parent || !parent.exists())
        return fileError('file-unavailable', 'Choose an existing destination directory');
      const temporary = parent.clone();
      temporary.append(`${destination.leafName}.neo-staging`);
      temporary.createUnique(0, 0o600);
      try {
        await Zotero.File.putContentsAsync(temporary.path, ciphertext, 'UTF-8');
        assertSettingsCurrent(context);
        if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
        await IOUtils.move(temporary.path, destination.path, { noOverwrite: !choice.replace });
        if ((await read(destination.path, context)) !== ciphertext)
          return fileError(
            'verification-failed',
            'The saved file could not be read back correctly',
          );
      } catch (error) {
        if (error instanceof SettingsSnapshotError) throw error;
        return fileError(
          'file-unavailable',
          'The settings file could not be saved; choose a writable destination',
        );
      } finally {
        await Zotero.File.removeIfExists(temporary.path);
        await Zotero.File.removeIfExists(`${temporary.path}.tmp`);
      }
    },
  };
}
