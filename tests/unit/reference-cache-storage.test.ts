import { afterEach, expect, it, vi } from 'vitest';
import { readReferenceCache, writeReferenceCache } from '../../src/platform/reference-cache';

afterEach(() => vi.unstubAllGlobals());

it('reads and atomically replaces only the profile reference cache file', async () => {
  const files = new Map<string, string>();
  class File {
    constructor(public leafName = '') {}
    clone() { return new File(this.leafName); }
    append(name: string) { this.leafName = name; }
    get path() { return `/profile/${this.leafName}`; }
    exists() { return files.has(this.path); }
    get fileSize() { return files.get(this.path)?.length ?? 0; }
  }
  vi.stubGlobal('Zotero', {
    getProfileDirectory: () => new File(),
    File: {
      getContentsAsync: async (path: string) => files.get(path),
      putContentsAsync: async (path: string, text: string) => { files.set(path, text); },
      removeIfExists: async (path: string) => { files.delete(path); },
    },
  });
  vi.stubGlobal('IOUtils', { move: async (from: string, to: string) => {
    files.set(to, files.get(from)!);
    files.delete(from);
  } });
  expect(await readReferenceCache()).toBeNull();
  await writeReferenceCache('{"version":1,"entries":[]}');
  expect(await readReferenceCache()).toBe('{"version":1,"entries":[]}');
  expect([...files.keys()]).toEqual(['/profile/zotero-neo-reference-cache.json']);
  await writeReferenceCache('ignored', () => false);
  expect(await readReferenceCache()).toBe('{"version":1,"entries":[]}');
  files.set('/profile/zotero-neo-reference-cache.json', 'x'.repeat(4 * 1024 * 1024 + 1));
  await expect(readReferenceCache()).rejects.toThrow('size limit');
});
