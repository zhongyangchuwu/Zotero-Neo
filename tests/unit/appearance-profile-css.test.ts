import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAppearanceProfileCss } from '../../src/platform/appearance-profile-css';

type Entry =
  | { kind: 'directory'; symlink?: boolean }
  | { kind: 'file'; text: string; size?: number; symlink?: boolean };

function mount(files: Record<string, Entry>) {
  const entries = new Map(Object.entries(files));
  class ProfileFile {
    constructor(public path: string) {}
    clone() {
      return new ProfileFile(this.path);
    }
    append(name: string) {
      this.path += `/${name}`;
    }
    exists() {
      return entries.has(this.path);
    }
    isSymlink() {
      return entries.get(this.path)?.symlink === true;
    }
    isDirectory() {
      return entries.get(this.path)?.kind === 'directory';
    }
    isFile() {
      return entries.get(this.path)?.kind === 'file';
    }
    get fileSize() {
      const entry = entries.get(this.path);
      return entry?.kind === 'file' ? (entry.size ?? entry.text.length) : 0;
    }
  }
  const read = vi.fn(async (path: string) => {
    const entry = entries.get(path);
    return entry?.kind === 'file' ? entry.text : undefined;
  });
  vi.stubGlobal('Zotero', {
    getProfileDirectory: () => new ProfileFile('/profile'),
    File: { getContentsAsync: read },
  });
  return read;
}

const DOCS = '/profile/docs';
const CURRENT = `${DOCS}/custom-neo.css`;
const LEGACY = `${DOCS}/custom-picker.css`;
const legacyFile = { kind: 'file', text: '.picker-root { opacity: 0.9; }' } as const;

afterEach(() => vi.unstubAllGlobals());

describe('Neo profile CSS', () => {
  it.each(['.neo-settings { opacity: 0.8; }\n', ''])(
    'uses the current file as-is (%j) instead of the legacy stylesheet',
    async (css) => {
      const read = mount({
        [DOCS]: { kind: 'directory' },
        [CURRENT]: { kind: 'file', text: css },
        [LEGACY]: legacyFile,
      });
      await expect(readAppearanceProfileCss()).resolves.toBe(css);
      expect(read.mock.calls.map(([path]) => path)).toEqual([CURRENT]);
    },
  );

  it('falls back when the current file is absent', async () => {
    const read = mount({ [DOCS]: { kind: 'directory' }, [LEGACY]: legacyFile });
    await expect(readAppearanceProfileCss()).resolves.toBe(legacyFile.text);
    expect(read.mock.calls.map(([path]) => path)).toEqual([LEGACY]);
  });

  it('returns no styles when the optional files are absent', async () => {
    const read = mount({ [DOCS]: { kind: 'directory' } });
    await expect(readAppearanceProfileCss()).resolves.toBe('');
    expect(read).not.toHaveBeenCalled();
  });

  it('does not read through a symlinked profile docs directory', async () => {
    const read = mount({ [DOCS]: { kind: 'directory', symlink: true }, [LEGACY]: legacyFile });
    await expect(readAppearanceProfileCss()).rejects.toThrow('Unsafe Neo CSS directory');
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'directory' },
    { kind: 'file', text: '', symlink: true },
    { kind: 'file', text: '', size: 1024 * 1024 + 1 },
  ] as const)('rejects an unsafe current file (%j) without falling back', async (file) => {
    const read = mount({
      [DOCS]: { kind: 'directory' },
      [CURRENT]: file,
      [LEGACY]: legacyFile,
    });
    await expect(readAppearanceProfileCss()).rejects.toThrow('Unsafe or oversized Neo CSS file');
    expect(read).not.toHaveBeenCalled();
  });
});
