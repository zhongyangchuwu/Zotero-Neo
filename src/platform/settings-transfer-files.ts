import { SettingsTransferError, type SettingsCryptoContext } from '../settings-transfer/contracts';
import { assertSettingsCurrent } from '../settings-transfer/document';
import { MAX_SETTINGS_ARMORED_BYTES } from '../settings-transfer/crypto-protocol';

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
export interface SettingsTransferFiles {
  chooseOpen(window: Window): Promise<string | null>;
  chooseSave(window: Window, name: string): Promise<SettingsFileChoice | null>;
  choosePath(window: Window, kind: 'file' | 'directory'): Promise<string | null>;
  read(path: string, context: SettingsCryptoContext): Promise<string>;
  write(
    choice: SettingsFileChoice,
    ciphertext: string,
    context: SettingsCryptoContext,
  ): Promise<void>;
  backupPath(source: string): string;
}
function picker(): NativePicker {
  const module = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs') as {
    FilePicker: new () => NativePicker;
  };
  return new module.FilePicker();
}
function fileError(code: string, message: string): never {
  throw new SettingsTransferError(code, message);
}

/** Native file pickers and ciphertext I/O are kept out of adapters and UI renderers. */
export function createSettingsTransferFiles(): SettingsTransferFiles {
  async function read(path: string, context: SettingsCryptoContext): Promise<string> {
    assertSettingsCurrent(context);
    try {
      const file = Zotero.File.pathToFile(path);
      if (!file.exists() || !file.isFile())
        return fileError('file-unavailable', 'The encrypted settings file is not available');
      if (file.fileSize > MAX_SETTINGS_ARMORED_BYTES)
        return fileError('oversized', 'The encrypted settings file exceeds the resource limit');
      const contents = await Zotero.File.getContentsAsync(
        path,
        'UTF-8',
        MAX_SETTINGS_ARMORED_BYTES + 1,
      );
      assertSettingsCurrent(context);
      if (typeof contents !== 'string' || contents.length > MAX_SETTINGS_ARMORED_BYTES)
        return fileError(
          'file-unavailable',
          'The encrypted settings file could not be read completely',
        );
      return contents;
    } catch (error) {
      if (error instanceof SettingsTransferError) throw error;
      return fileError('file-unavailable', 'The encrypted settings file could not be read');
    }
  }
  return {
    async chooseOpen(window) {
      const dialog = picker();
      dialog.init(window, 'Open Neo settings / 打开 Neo 配置', dialog.modeOpen);
      dialog.appendFilter('Encrypted Neo settings', '*.age');
      return (await dialog.show()) === dialog.returnOK ? dialog.file : null;
    },
    async chooseSave(window, name) {
      const dialog = picker();
      dialog.init(window, 'Save encrypted Neo settings / 保存加密配置', dialog.modeSave);
      dialog.appendFilter('Encrypted Neo settings', '*.age');
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
      if (
        !ciphertext.startsWith('-----BEGIN AGE ENCRYPTED FILE-----') ||
        !/^[\x09\x0a\x0d\x20-\x7e]*$/u.test(ciphertext)
      )
        return fileError(
          'invalid-ciphertext',
          'Only an ASCII-armored encrypted settings file can be saved',
        );
      if (ciphertext.length > MAX_SETTINGS_ARMORED_BYTES)
        return fileError('oversized', 'The encrypted settings file exceeds the resource limit');
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
            'The encrypted file was not read back correctly; no configuration restore was admitted',
          );
      } catch (error) {
        if (error instanceof SettingsTransferError) throw error;
        return fileError(
          'file-unavailable',
          'The encrypted settings file could not be saved; choose a writable destination',
        );
      } finally {
        await Zotero.File.removeIfExists(temporary.path);
        await Zotero.File.removeIfExists(`${temporary.path}.tmp`);
      }
    },
    backupPath(source) {
      const file = Zotero.File.pathToFile(source),
        parent = file.parent;
      if (!parent)
        return fileError('file-unavailable', 'The import file has no backup destination');
      const name = file.leafName.replace(/\.age$/iu, '');
      const result = parent.clone();
      result.append(
        `${name}.before-${new Date().toISOString().replace(/[:.]/gu, '-')}-${Zotero.Utilities.randomString(8)}.age`,
      );
      return result.path;
    },
  };
}
