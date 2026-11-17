import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createSnapshotAttachments } from '../../src/platform/settings-snapshot-attachments';
import type { CreateManagedSnapshot } from '../../src/settings-snapshots/ports';
import type { SettingsOperationContext } from '../../src/settings-snapshots/contracts';

let root: string;
let serial: number;
let writable: boolean;
let syncFailure: boolean;
let metadataFailure: boolean;
let beforeMove: ((from: string, to: string) => void) | null;
let beforeTransaction: (() => void) | null;
const items = new Map<string, NativeItem>();
interface NativeFile {
  path: string;
  readonly parent: NativeFile;
  clone(): NativeFile;
  append(name: string): void;
  createUnique(): void;
}
function file(path: string): NativeFile {
  return {
    path,
    get parent() {
      return file(dirname(this.path));
    },
    clone() {
      return file(this.path);
    },
    append(name: string) {
      this.path = join(this.path, name);
    },
    createUnique() {
      this.path += `-${++serial}`;
      writeFileSync(this.path, '', { mode: 0o600 });
    },
  };
}
class NativeItem {
  readonly libraryID = 2;
  readonly id = ++serial;
  readonly key = `ITEM${this.id}`;
  deleted = false;
  attachmentLinkMode = 0;
  attachmentContentType = 'application/json';
  attachmentSyncState: string | number = 'in_sync';
  title = 'Settings';
  collections: number[] = [];
  path: string;
  pendingNote = '';
  savedNote = '';
  constructor(text: string, extension = 'json') {
    const directory = join(root, this.key);
    mkdirSync(directory);
    this.path = join(directory, `settings.${extension}`);
    writeFileSync(this.path, text);
    items.set(this.key, this);
  }
  get attachmentPath() {
    return this.path;
  }
  get attachmentFilename() {
    return basename(this.path);
  }
  isAttachment() {
    return true;
  }
  getField() {
    return this.title;
  }
  setField(_key: string, value: string) {
    this.title = value;
  }
  getCollections() {
    return this.collections;
  }
  setCollections(value: number[]) {
    this.collections = value;
  }
  getFilePath() {
    return this.path;
  }
  async getFilePathAsync() {
    return existsSync(this.path) ? this.path : false;
  }
  hasChanged() {
    return this.pendingNote !== this.savedNote;
  }
  async save() {
    if (syncFailure || metadataFailure) throw new Error('Native save failed');
    this.savedNote = this.pendingNote;
  }
}
const context = (): SettingsOperationContext => ({
  signal: new AbortController().signal,
  isCurrent: () => true,
});
const request: CreateManagedSnapshot = {
  adapterID: 'plugin',
  libraryID: 2,
  collectionID: null,
  title: 'Settings',
  container: 'json',
  autoUpdate: false,
  includeSecrets: false,
  includeLibrarySettings: false,
  consent: true,
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'neo-managed-owned-'));
  serial = 0;
  writable = true;
  syncFailure = false;
  metadataFailure = false;
  beforeMove = null;
  beforeTransaction = null;
  items.clear();
  vi.stubGlobal('IOUtils', {
    stat: async (path: string) => ({ size: statSync(path).size }),
    readUTF8: async (path: string) => readFileSync(path, 'utf8'),
    computeHexDigest: async (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    writeUTF8: async (path: string, text: string) => {
      writeFileSync(path, text);
    },
    createUniqueFile: async (parent: string, prefix: string) => {
      const path = join(parent, `${prefix}-${++serial}`);
      writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
      return path;
    },
    remove: async (path: string, options?: { ignoreAbsent?: boolean }) => {
      if (options?.ignoreAbsent && !existsSync(path)) return;
      unlinkSync(path);
    },
    move: async (from: string, to: string, options: { noOverwrite: boolean }) => {
      beforeMove?.(from, to);
      // Native noOverwrite semantics at the OS boundary. Never replace an existing destination.
      if (!options.noOverwrite) throw new Error('Unsafe replacement');
      linkSync(from, to);
      unlinkSync(from);
    },
  });
  vi.stubGlobal('Zotero', {
    DB: {
      executeTransaction: async (operation: () => Promise<unknown>) => {
        beforeTransaction?.();
        return operation();
      },
    },
    Libraries: {
      get: () => ({
        editable: writable,
        filesEditable: writable,
        libraryID: 2,
        libraryType: 'group',
      }),
      getAll: () => [
        { editable: writable, filesEditable: writable, libraryID: 2, libraryType: 'group' },
      ],
      getName: () => 'Test library',
    },
    Collections: { get: (id: number) => ({ id, libraryID: 2 }), getByLibrary: () => [] },
    Items: {
      getByLibraryAndKeyAsync: async (_libraryID: number, key: string) => items.get(key) || false,
      getAll: async () => [...items.values()],
      loadDataTypes: async () => undefined,
    },
    File: { pathToFile: file },
    getTempDirectory: () => file(root),
    Attachments: {
      LINK_MODE_IMPORTED_FILE: 0,
      importFromFile: vi.fn(async (options) => {
        const item = new NativeItem('', options.file.path.includes('.age') ? 'age' : 'json');
        copyFileSync(options.file.path, item.path);
        item.title = options.title;
        item.collections = options.collections;
        return item;
      }),
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});

it.each([
  ['json', '{"same":"file transport"}\n'],
  [
    'age',
    '-----BEGIN AGE ENCRYPTED FILE-----\nY2lwaGVydGV4dA==\n-----END AGE ENCRYPTED FILE-----\n',
  ],
] as const)(
  'preserves exact %s file bytes in visible stored attachments and requests native tracking',
  async (container, text) => {
    const carrier = createSnapshotAttachments();
    const stored = await carrier.create({ ...request, container }, text, context());
    expect((await carrier.read(stored.source, context())).text).toBe(text);
    const item = items.get(stored.source.itemKey)!;
    expect(item.attachmentSyncState).toBe('to_upload');
    expect(item.title).toBe(request.title);
    expect(readFileSync(item.path, 'utf8')).toBe(text);
  },
);

it('discovers unbound remote files in a chosen library and reports pending/missing without creating replacements', async () => {
  const carrier = createSnapshotAttachments();
  const item = new NativeItem('remote');
  const source = { libraryID: 2, itemKey: item.key, title: item.title };
  unlinkSync(item.path);
  item.attachmentSyncState = 'to_download';
  expect(await carrier.sources(2, context())).toEqual([source]);
  await expect(carrier.read(source, context())).rejects.toMatchObject({ code: 'download-pending' });
  item.attachmentSyncState = 'in_sync';
  await expect(carrier.read(source, context())).rejects.toMatchObject({ code: 'missing-file' });
  expect(items.size).toBe(1);
});

it.each(['external', 'deleted', 'read-only'])(
  'preserves bytes and refuses publication for %s targets',
  async (change) => {
    const carrier = createSnapshotAttachments();
    const stored = await carrier.create(request, 'original', context());
    const item = items.get(stored.source.itemKey)!;
    if (change === 'external') writeFileSync(item.path, 'external');
    if (change === 'deleted') item.deleted = true;
    if (change === 'read-only') writable = false;
    await expect(
      carrier.publish(stored.source, stored.identity, 'replacement', context()),
    ).rejects.toMatchObject({
      code:
        change === 'external'
          ? 'external-change'
          : change === 'deleted'
            ? 'missing-attachment'
            : 'read-only',
    });
    expect(readFileSync(item.path, 'utf8')).toBe(change === 'external' ? 'external' : 'original');
    expect(readdirSync(dirname(item.path))).toEqual(['settings.json']);
  },
);

it('detects a mutation at displacement and restores the actual external data instead of replacing it', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  beforeMove = (from) => {
    if (from === stored.identity.path) {
      writeFileSync(from, 'external-race');
      beforeMove = null;
    }
  };
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'external-change' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('external-race');
});

it('never overwrites a racing destination and retains the displaced original for recovery', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  beforeMove = (from, to) => {
    if (basename(from).startsWith('.neo-settings-stage') && to === stored.identity.path) {
      writeFileSync(to, 'racing-sync');
      beforeMove = null;
    }
  };
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'publication-ambiguous' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('racing-sync');
  const recovery = readdirSync(dirname(stored.identity.path)).find((name) =>
    name.startsWith('.neo-settings-recovery'),
  )!;
  expect(readFileSync(join(dirname(stored.identity.path), recovery), 'utf8')).toBe('original');
});

it('retains old recovery bytes when native file tracking fails after local publication', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  syncFailure = true;
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'publication-ambiguous' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('replacement');
  const recovery = readdirSync(dirname(stored.identity.path)).find((name) =>
    name.startsWith('.neo-settings-recovery'),
  )!;
  expect(readFileSync(join(dirname(stored.identity.path), recovery), 'utf8')).toBe('original');
});

it('checks expected identity before rename/recollection and never rewrites snapshot contents for metadata edits', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const configured = await carrier.configure(
    stored.source,
    stored.identity,
    { title: 'Renamed', collectionID: 7 },
    context(),
  );
  expect(configured.source.title).toBe('Renamed');
  expect(configured.identity.collections).toEqual([7]);
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('original');
  writeFileSync(stored.identity.path, 'external');
  await expect(
    carrier.configure(
      configured.source,
      configured.identity,
      { title: 'Unsafe', collectionID: null },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'external-change' });
  expect(items.get(stored.source.itemKey)!.title).toBe('Renamed');
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('external');
});

it('leaves original bytes intact when native metadata persistence fails', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  metadataFailure = true;
  await expect(
    carrier.configure(
      stored.source,
      stored.identity,
      { title: 'Renamed', collectionID: 7 },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'configure-ambiguous' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('original');
});

it('does not resurrect a deleted local file', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  unlinkSync(stored.identity.path);
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'missing-file' });
  expect(existsSync(stored.identity.path)).toBe(false);
});

it('preserves original data and removes staging content when a file permission failure prevents the stage write', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  vi.spyOn(IOUtils, 'writeUTF8').mockRejectedValueOnce(new Error('Permission denied'));
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'attachment-write-failed' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('original');
  expect(readdirSync(dirname(stored.identity.path))).toEqual(['settings.json']);
});

it('rechecks the native attachment path after displacement even when the cached item changes in place', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const item = items.get(stored.source.itemKey)!;
  const externalPath = join(dirname(stored.identity.path), 'external.json');
  writeFileSync(externalPath, 'external-identity');
  beforeMove = (from) => {
    if (from === stored.identity.path) {
      item.path = externalPath;
      beforeMove = null;
    }
  };
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'external-change' });
  expect(readFileSync(stored.identity.path, 'utf8')).toBe('original');
  expect(readFileSync(externalPath, 'utf8')).toBe('external-identity');
});

it('rebases native rename, collection membership and relocated identical bytes without weakening publication baselines', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const item = items.get(stored.source.itemKey)!;
  item.title = 'Renamed in Zotero';
  item.collections = [9, 7];
  const movedPath = join(dirname(item.path), 'renamed.json');
  linkSync(item.path, movedPath);
  unlinkSync(item.path);
  item.path = movedPath;
  const current = await carrier.inspect(stored.source, stored.identity, context());
  expect(current.source).toEqual({ ...stored.source, title: item.title });
  expect(current.identity).toEqual({
    ...stored.identity,
    path: movedPath,
    title: item.title,
    collections: [7, 9],
  });
  expect(current.text).toBe('original');
  // Only the explicit observation may rebase; publication still checks a frozen complete baseline.
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'external-change' });
  await expect(
    carrier.configure(
      stored.source,
      stored.identity,
      { title: 'Stale edit', collectionID: null },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'external-change' });
  const published = await carrier.publish(
    current.source,
    current.identity,
    'replacement',
    context(),
  );
  expect(published.identity).toMatchObject({
    path: movedPath,
    title: 'Renamed in Zotero',
    collections: [7, 9],
  });
  expect(item.title).toBe('Renamed in Zotero');
  expect(item.collections).toEqual([9, 7]);
  expect(readFileSync(movedPath, 'utf8')).toBe('replacement');
});

it.each(['external-bytes', 'relocated-other-bytes', 'deleted', 'read-only'])(
  'does not rebase %s into an authorized content baseline',
  async (change) => {
    const carrier = createSnapshotAttachments();
    const stored = await carrier.create(request, 'original', context());
    const item = items.get(stored.source.itemKey)!;
    item.title = 'Harmless rename cannot authorize changed content';
    item.collections = [7];
    if (change === 'relocated-other-bytes') item.path = join(dirname(item.path), 'other.json');
    if (change === 'external-bytes' || change === 'relocated-other-bytes')
      writeFileSync(item.path, 'external');
    if (change === 'deleted') item.deleted = true;
    if (change === 'read-only') writable = false;
    await expect(carrier.inspect(stored.source, stored.identity, context())).rejects.toMatchObject({
      code:
        change === 'deleted'
          ? 'missing-attachment'
          : change === 'read-only'
            ? 'read-only'
            : 'external-change',
    });
    expect(readFileSync(item.path, 'utf8')).toBe(
      change === 'external-bytes' || change === 'relocated-other-bytes' ? 'external' : 'original',
    );
  },
);

it.each(['publish', 'configure'] as const)(
  'preserves another native owner’s unsaved note and existing bytes during %s',
  async (operation) => {
    const carrier = createSnapshotAttachments();
    const stored = await carrier.create(request, 'original', context());
    const item = items.get(stored.source.itemKey)!;
    item.pendingNote = 'Native editor draft';
    const action =
      operation === 'publish'
        ? carrier.publish(stored.source, stored.identity, 'replacement', context())
        : carrier.configure(stored.source, stored.identity, { title: 'Changed' }, context());
    await expect(action).rejects.toMatchObject({ code: 'dirty-attachment' });
    expect(item.pendingNote).toBe('Native editor draft');
    expect(item.savedNote).toBe('');
    expect(item.title).toBe(stored.identity.title);
    expect(readFileSync(item.path, 'utf8')).toBe('original');
  },
);

it('rechecks unsaved edits after native metadata transaction queueing', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const item = items.get(stored.source.itemKey)!;
  beforeTransaction = () => {
    item.pendingNote = 'Draft entered while waiting';
  };
  await expect(
    carrier.configure(stored.source, stored.identity, { title: 'Changed' }, context()),
  ).rejects.toMatchObject({ code: 'dirty-attachment' });
  expect(item.pendingNote).toBe('Draft entered while waiting');
  expect(item.savedNote).toBe('');
  expect(item.title).toBe(stored.identity.title);
  expect(readFileSync(item.path, 'utf8')).toBe('original');
});

it('preserves all native collections on title-only edits, replacing them only on explicit collection edits', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const item = items.get(stored.source.itemKey)!;
  item.collections = [9, 7];
  const followed = await carrier.inspect(stored.source, stored.identity, context());
  const renamed = await carrier.configure(
    followed.source,
    followed.identity,
    { title: 'Changed' },
    context(),
  );
  expect(item.collections).toEqual([7, 9]);
  expect(renamed.identity.collections).toEqual([7, 9]);
  const moved = await carrier.configure(
    renamed.source,
    renamed.identity,
    { title: 'Changed', collectionID: null },
    context(),
  );
  expect(item.collections).toEqual([]);
  expect(moved.identity.collections).toEqual([]);
  expect(readFileSync(item.path, 'utf8')).toBe('original');
});

it('retains recovery bytes without saving a native draft entered while file tracking waits', async () => {
  const carrier = createSnapshotAttachments();
  const stored = await carrier.create(request, 'original', context());
  const item = items.get(stored.source.itemKey)!;
  beforeTransaction = () => {
    item.pendingNote = 'Draft entered while tracking waits';
  };
  await expect(
    carrier.publish(stored.source, stored.identity, 'replacement', context()),
  ).rejects.toMatchObject({ code: 'publication-ambiguous' });
  expect(item.pendingNote).toBe('Draft entered while tracking waits');
  expect(item.savedNote).toBe('');
  expect(readFileSync(item.path, 'utf8')).toBe('replacement');
  const recovery = readdirSync(dirname(item.path)).find((name) =>
    name.startsWith('.neo-settings-recovery'),
  )!;
  expect(readFileSync(join(dirname(item.path), recovery), 'utf8')).toBe('original');
});
