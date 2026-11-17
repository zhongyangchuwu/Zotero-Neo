import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createSettingsTransferFiles } from '../../src/platform/settings-transfer-files';
import type { SettingsCryptoContext } from '../../src/settings-transfer/contracts';
import { MAX_SETTINGS_BYTES } from '../../src/settings-transfer/document';
import { MAX_SETTINGS_ARMORED_BYTES } from '../../src/settings-transfer/crypto-protocol';

let root: string,
  serial = 0;
const armor =
  '-----BEGIN AGE ENCRYPTED FILE-----\nY2lwaGVydGV4dA==\n-----END AGE ENCRYPTED FILE-----\n';
function nativeFile(initial: string) {
  let path = initial;
  return {
    get path() {
      return path;
    },
    get leafName() {
      return basename(path);
    },
    get parent() {
      return nativeFile(dirname(path));
    },
    get fileSize() {
      return statSync(path).size;
    },
    exists: () => existsSync(path),
    isFile: () => statSync(path).isFile(),
    clone: () => nativeFile(path),
    append: (leaf: string) => {
      path = join(path, leaf);
    },
    createUnique: (_type: number, mode: number) => {
      path += `-${++serial}`;
      writeFileSync(path, '', { flag: 'wx', mode });
    },
  };
}
const ctx = (abort = new AbortController()): SettingsCryptoContext => ({
  window: {} as Window,
  signal: abort.signal,
  isCurrent: () => true,
});
let read: Mock<(path: string) => Promise<string>>,
  write: Mock<(path: string, text: string) => Promise<void>>,
  move: Mock<(source: string, target: string, options: { noOverwrite: boolean }) => Promise<void>>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'neo-settings-files-'));
  mkdirSync(join(root, 'folder'));
  read = vi.fn(async (path: string) => readFileSync(path, 'utf8'));
  write = vi.fn(async (path: string, text: string) => {
    writeFileSync(path, text);
  });
  move = vi.fn(async (source: string, target: string, options: { noOverwrite: boolean }) => {
    if (options.noOverwrite) {
      linkSync(source, target);
      unlinkSync(source);
    } else renameSync(source, target);
  });
  vi.stubGlobal('Zotero', {
    File: {
      pathToFile: nativeFile,
      getContentsAsync: read,
      putContentsAsync: write,
      removeIfExists: async (path: string) => {
        if (existsSync(path)) unlinkSync(path);
      },
    },
    Utilities: { randomString: () => 'fixture' },
  });
  vi.stubGlobal('IOUtils', { move });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

it('publishes only ciphertext, retains restrictive permissions, verifies readback and never overwrites without picker consent', async () => {
  const files = createSettingsTransferFiles(),
    path = join(root, 'settings.age');
  await files.write({ path, replace: false }, armor, ctx());
  expect(readFileSync(path, 'utf8')).toBe(armor);
  expect(statSync(path).mode & 0o777).toBe(0o600);
  writeFileSync(path, 'existing user file');
  await expect(files.write({ path, replace: false }, armor, ctx())).rejects.toMatchObject({
    code: 'file-unavailable',
  });
  expect(readFileSync(path, 'utf8')).toBe('existing user file');
  await files.write({ path, replace: true }, armor, ctx());
  expect(readFileSync(path, 'utf8')).toBe(armor);
  const plaintextPath = join(root, 'plaintext.json');
  await expect(
    files.write({ path: plaintextPath, replace: false }, '{"password":"private"}', ctx()),
  ).rejects.toMatchObject({ code: 'invalid-ciphertext' });
  expect(existsSync(plaintextPath)).toBe(false);
});

it('admits armored overhead above the plaintext bound but rejects oversized ciphertext before reading', async () => {
  const files = createSettingsTransferFiles(),
    path = join(root, 'large.age');
  const contents = armor + 'A'.repeat(MAX_SETTINGS_BYTES + 1 - armor.length);
  writeFileSync(path, contents);
  expect((await files.read(path, ctx())).length).toBe(MAX_SETTINGS_BYTES + 1);
  vi.stubGlobal('Zotero', {
    File: {
      pathToFile: () => ({
        exists: () => true,
        isFile: () => true,
        fileSize: MAX_SETTINGS_ARMORED_BYTES + 1,
      }),
      getContentsAsync: read,
    },
  });
  read.mockClear();
  await expect(files.read(path, ctx())).rejects.toMatchObject({ code: 'oversized' });
  expect(read).not.toHaveBeenCalled();
});

it('does not publish a staged file after cancellation and does not acknowledge corrupted readback', async () => {
  const files = createSettingsTransferFiles(),
    abort = new AbortController(),
    path = join(root, 'cancelled.age');
  write.mockImplementationOnce(async (temporary: string, contents: string) => {
    writeFileSync(temporary, contents);
    abort.abort();
  });
  await expect(files.write({ path, replace: false }, armor, ctx(abort))).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(existsSync(path)).toBe(false);
  expect(move).not.toHaveBeenCalled();
  const original = move.getMockImplementation()!;
  move.mockImplementationOnce(async (...args: Parameters<typeof original>) => {
    await original(...args);
    writeFileSync(args[1], 'truncated');
  });
  await expect(files.write({ path, replace: false }, armor, ctx())).rejects.toMatchObject({
    code: 'verification-failed',
  });
});

it('redacts unexpected file-system error details', async () => {
  read.mockRejectedValueOnce(new Error('sensitive-native-error-payload'));
  const path = join(root, 'settings.age');
  writeFileSync(path, armor);
  await expect(createSettingsTransferFiles().read(path, ctx())).rejects.toMatchObject({
    code: 'file-unavailable',
    message: 'The encrypted settings file could not be read',
  });
});

it('publishes in a fresh Bootstrap scope before another feature initializes IOUtils', async () => {
  const nativeMove = move;
  vi.stubGlobal('IOUtils', undefined);
  vi.stubGlobal('Components', {
    utils: {
      importGlobalProperties: (names: readonly string[]) => {
        if (names.includes('IOUtils')) vi.stubGlobal('IOUtils', { move: nativeMove });
      },
    },
  });
  const path = join(root, 'fresh-start.age');
  await createSettingsTransferFiles().write({ path, replace: false }, armor, ctx());
  expect(readFileSync(path, 'utf8')).toBe(armor);
});
