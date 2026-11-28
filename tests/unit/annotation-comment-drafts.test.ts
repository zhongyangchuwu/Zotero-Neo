import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rescueAnnotationCommentDrafts } from '../../src/platform/annotation-comment-drafts';

const prefix = 'extensions.zotero-neo.annotationComment.drafts.';
const key = `${prefix}1.TESTKEY1`;
const draft = JSON.stringify([{ id: 'draft', base: 'Previous', text: '尚未提交 📝\n第 2 行' }]);
const raw = (value: string) => Buffer.from(value, 'utf8').toString('latin1');
const failure = 'Could not safely rescue legacy annotation comment drafts';
const users = new Map<string, string | boolean>();
const defaults = new Set<string>();
const locked = new Set<string>();
let profile: string;
let serial: number;
const backup = (id = 1) => join(profile, `zotero-neo-annotation-comment-drafts-fixture-${id}.json`);
const clear = vi.fn((name: string) => users.delete(name));
const read = vi.fn(async (path: string, options: { maxBytes: number }) =>
  readFileSync(path).subarray(0, options.maxBytes),
);
const write = vi.fn(async (path: string, bytes: Uint8Array, _options: { flush: boolean }) => {
  writeFileSync(path, bytes);
});

function nativeFile(initial: string) {
  let path = initial;
  return {
    get path() {
      return path;
    },
    clone: () => nativeFile(path),
    append: (leaf: string) => {
      path = join(path, leaf);
    },
  };
}

beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), 'neo-draft-rescue-'));
  serial = 0;
  users.set(key, raw(draft));
  vi.stubGlobal('Zotero', {
    getMainWindow: () => ({ TextDecoder, TextEncoder, btoa }),
    Utilities: { randomString: () => `fixture-${++serial}` },
  });
  vi.stubGlobal('Components', { interfaces: { nsIFile: Symbol() } });
  vi.stubGlobal('Services', {
    dirsvc: {
      get: (id: string) => {
        if (id !== 'ProfD') throw new Error('Not the Gecko profile');
        return nativeFile(profile);
      },
    },
    prefs: {
      getChildList: (start: string) =>
        [...new Set([...users.keys(), ...defaults])].filter((name) => name.startsWith(start)),
      prefHasUserValue: (name: string) => users.has(name),
      prefIsLocked: (name: string) => locked.has(name),
      getPrefType: (name: string) => (typeof users.get(name) === 'string' ? 32 : 128),
      getCharPref: (name: string) => users.get(name),
      clearUserPref: clear,
    },
  });
  vi.stubGlobal('IOUtils', {
    createUniqueFile: async (directory: string, name: string, mode: number) => {
      const path = join(directory, name);
      writeFileSync(path, '', { flag: 'wx', mode });
      return path;
    },
    write,
    move: async (
      source: string,
      destination: string,
      { noOverwrite }: { noOverwrite: boolean },
    ) => {
      if (!noOverwrite) throw new Error('Refusing to clobber the destination');
      linkSync(source, destination);
      unlinkSync(source);
    },
    read,
    remove: async (path: string) => rmSync(path, { force: true }),
  });
});

afterEach(() => {
  users.clear();
  defaults.clear();
  locked.clear();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  rmSync(profile, { recursive: true, force: true });
});

it('notifies once after publishing an exact, private, readable rescue, then leaves unrelated prefs alone', async () => {
  const brokenJSON = `${prefix}1.BADJSON1`;
  const brokenUTF8 = `${prefix}1.BADUTF81`;
  const malformed = '\uFEFFmalformed JSON: 注释\r\n';
  const invalidBytes = '\xc3\x28\xff';
  const lockedKey = `${prefix}1.LOCKED01`;
  const wrongType = `${prefix}1.BOOLEAN1`;
  const defaultOnly = `${prefix}1.DEFAULT1`;
  const unrelated = 'extensions.zotero-neo.annotationComment.draftsOther';
  users.set(brokenJSON, raw(malformed));
  users.set(brokenUTF8, invalidBytes);
  users.set(lockedKey, raw('locked user value'));
  users.set(wrongType, true);
  users.set(unrelated, raw('unrelated data'));
  defaults.add(defaultOnly);
  locked.add(lockedKey);

  const seen: string[] = [];
  const notify = (path: string) => {
    seen.push(path);
    expect(path).toBe(backup());
    expect(clear).not.toHaveBeenCalled();
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('尚未提交 📝');
    expect(JSON.parse(text)).toEqual({
      drafts: [
        { key, raw: draft },
        { key: brokenJSON, raw: malformed },
        { key: brokenUTF8, rawBase64: Buffer.from(invalidBytes, 'latin1').toString('base64') },
      ],
    });
  };
  await rescueAnnotationCommentDrafts(notify);
  await rescueAnnotationCommentDrafts(notify);

  expect(seen).toEqual([backup()]);
  expect(readdirSync(profile)).toEqual(['zotero-neo-annotation-comment-drafts-fixture-1.json']);
  if (process.platform !== 'win32') expect(statSync(backup()).mode & 0o777).toBe(0o600);
  expect(write).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), { flush: true });
  expect([...users.keys()]).toEqual([lockedKey, wrongType, unrelated]);
  expect(defaults.has(defaultOnly)).toBe(true);
});

it('preserves the source and cleans staging when writing fails', async () => {
  write.mockImplementationOnce(async (path) => {
    writeFileSync(path, 'partial');
    throw new Error(draft);
  });
  const notify = vi.fn();
  await expect(rescueAnnotationCommentDrafts(notify)).rejects.toHaveProperty('message', failure);

  expect(readdirSync(profile)).toEqual([]);
  expect(users.get(key)).toBe(raw(draft));
  expect(notify).not.toHaveBeenCalled();
});

it('does not overwrite an existing export or clear the source on a filename collision', async () => {
  writeFileSync(backup(), 'earlier rescue');
  const notify = vi.fn();
  await expect(rescueAnnotationCommentDrafts(notify)).rejects.toHaveProperty('message', failure);

  expect(readFileSync(backup(), 'utf8')).toBe('earlier rescue');
  expect(readdirSync(profile)).toEqual(['zotero-neo-annotation-comment-drafts-fixture-1.json']);
  expect(users.get(key)).toBe(raw(draft));
  expect(notify).not.toHaveBeenCalled();
});

it('preserves preferences without notifying when the published file cannot be read', async () => {
  read.mockRejectedValueOnce(new Error(draft));
  const notify = vi.fn();
  await expect(rescueAnnotationCommentDrafts(notify)).rejects.toHaveProperty('message', failure);

  expect(users.get(key)).toBe(raw(draft));
  expect(notify).not.toHaveBeenCalled();
});

it('preserves preferences without notifying when the readback bytes differ', async () => {
  read.mockImplementationOnce(async (path) => {
    const bytes = readFileSync(path);
    bytes[0] = 0;
    return bytes;
  });
  const notify = vi.fn();
  await expect(rescueAnnotationCommentDrafts(notify)).rejects.toHaveProperty('message', failure);

  expect(users.get(key)).toBe(raw(draft));
  expect(notify).not.toHaveBeenCalled();
});

it('keeps both copies if the notice fails and allows rescue at the next startup', async () => {
  const notify = vi.fn(async () => {
    throw new Error(draft);
  });
  await expect(rescueAnnotationCommentDrafts(notify)).rejects.toHaveProperty('message', failure);

  expect(notify).toHaveBeenCalledWith(backup());
  expect(users.get(key)).toBe(raw(draft));
  expect(readFileSync(backup(), 'utf8')).toContain('尚未提交 📝');

  const retry = vi.fn();
  await rescueAnnotationCommentDrafts(retry);
  expect(retry).toHaveBeenCalledExactlyOnceWith(backup(2));
  expect(readFileSync(backup(2))).toEqual(readFileSync(backup()));
  expect(users.has(key)).toBe(false);
});

it('retains the original source if the backup changes while the notice is open', async () => {
  await expect(rescueAnnotationCommentDrafts((path) => appendFileSync(path, '\n'))).rejects.toThrow(
    failure,
  );

  expect(users.get(key)).toBe(raw(draft));
});

it('clears only the captured strings that still match after the notice', async () => {
  const changed = `${prefix}2.CHANGED1`;
  const removed = `${prefix}2.REMOVED1`;
  const typed = `${prefix}2.RETYPED1`;
  const added = `${prefix}2.NEWVALUE`;
  users.set(changed, '\xff');
  users.set(removed, raw('old value'));
  users.set(typed, raw('old value'));

  await rescueAnnotationCommentDrafts(async () => {
    await Promise.resolve();
    users.set(changed, '\xfe');
    users.delete(removed);
    users.set(typed, false);
    users.set(added, raw('new value'));
  });

  expect(clear.mock.calls).toEqual([[key]]);
  expect(users.get(changed)).toBe('\xfe');
  expect(users.get(typed)).toBe(false);
  expect(users.get(added)).toBe(raw('new value'));
  expect(existsSync(backup())).toBe(true);
});
