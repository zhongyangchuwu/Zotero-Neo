import { afterEach, describe, expect, it, vi } from 'vitest';
import { artifactHost } from '../fixtures/artifact-host';
import { artifactHeads, createArtifactRepository } from '../../src/artifacts';
import {
  changeDocumentCorrection,
  emptyDocumentCorrections,
} from '../../src/document-analysis/corrections';
import type { ParsedDocument } from '../../src/document-analysis/contracts';
import {
  documentCacheRecord,
  documentCacheSlot,
  readDocumentCacheRecord,
} from '../../src/document-analysis/cache';
import {
  readAttachmentDocumentCorrections,
  saveAttachmentDocumentCorrections,
} from '../../src/platform/document-corrections';
import { artifactStorageIssues } from '../../src/platform/artifact-feedback';
import { observeAttachmentDocumentCache } from '../../src/platform/document-analysis-cache';

const key = { backend: 'native', adapterVersion: 1, configuration: 'manual' };
function baseline(fingerprint: string): ParsedDocument {
  return {
    schemaVersion: 1,
    backend: key.backend,
    sourceFingerprint: fingerprint,
    modelRevision: 'exact-model',
    durationMs: 17,
    pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
    regions: [
      {
        id: 'caption-1',
        kind: 'caption',
        pageIndex: 0,
        rect: [10, 10, 100, 40],
        text: 'Human correction baseline',
        format: 'text',
        flow: 'auxiliary',
        anchorPrecision: 'region',
      },
    ],
  };
}
function setup() {
  const host = artifactHost(),
    parsed = baseline(host.digest);
  const manual = changeDocumentCorrection(
    emptyDocumentCorrections(parsed, key),
    parsed,
    key,
    'caption-1',
    { type: 'body', regionID: 'caption-1' },
  );
  const sidecar = `/legacy/.zotero-neo-corrections-${host.md5(documentCacheSlot(key))}.json`;
  host.files.set(sidecar, JSON.stringify(manual));
  return { host, parsed, manual, sidecar };
}
afterEach(() => vi.unstubAllGlobals());

describe('manual corrections stored artifact integration', () => {
  it('migrates the exact necessary baseline once, preserves the sidecar, and never resurrects restored corrections', async () => {
    const { host, parsed, manual, sidecar } = setup(),
      repo = createArtifactRepository();
    const original = host.files.get(sidecar);
    const source = {
      fingerprint: parsed.sourceFingerprint,
      fileName: 'paper.pdf',
      pages: parsed.pages,
    };
    const cachePath = `/legacy/.zotero-neo-analysis-${host.md5(documentCacheSlot(key))}.json`;
    host.files.set(cachePath, JSON.stringify(documentCacheRecord(source, key, parsed)));
    const state = await readAttachmentDocumentCorrections(2, parsed, key);
    expect(state).toEqual(manual);
    expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
    expect(host.imports).toHaveBeenCalledTimes(1);
    expect(
      await saveAttachmentDocumentCorrections({
        itemID: 2,
        parsed,
        key,
        previous: state,
        next: { ...state },
        current: async () => true,
      }),
    ).toBe(true);
    expect(host.imports).toHaveBeenCalledTimes(1);
    const first = (await repo.list(host.parent, 'document-corrections')).artifacts[0];
    expect(first.payload).toEqual({
      version: 1,
      baseline: { ...parsed, durationMs: 0 },
      cacheKey: key,
      corrections: manual,
    });
    expect(first.source).toMatchObject({
      contentHash: { algorithm: 'md5', value: host.digest },
      precision: 'region',
    });
    const restored = changeDocumentCorrection(state, parsed, key, 'caption-1', null);
    expect(
      await saveAttachmentDocumentCorrections({
        itemID: 2,
        parsed,
        key,
        previous: state,
        next: restored,
        current: async () => true,
      }),
    ).toBe(true);
    expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
    expect(host.imports).toHaveBeenCalledTimes(2);
    expect(host.files.get(sidecar)).toBe(original);
    const listing = await repo.list(host.parent, 'document-corrections');
    expect(listing.artifacts).toHaveLength(2);
    expect(artifactHeads(listing.artifacts, first.recordID)).toHaveLength(1);
    expect(
      readDocumentCacheRecord(JSON.parse(host.files.get(cachePath)!), source, key)?.parsed,
    ).toEqual(parsed);
  });

  it('honors an authoritative empty correction restore when the PDF is missing', async () => {
    const { host, parsed, manual, sidecar } = setup();
    const state = await readAttachmentDocumentCorrections(2, parsed, key);
    const restored = changeDocumentCorrection(state, parsed, key, 'caption-1', null);
    await saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous: state,
      next: restored,
      current: async () => true,
    });
    host.files.delete('/pdf');
    expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
    expect(artifactStorageIssues(2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'source-unavailable' })]),
    );
    expect(host.files.get(sidecar)).toBe(JSON.stringify(manual));
    expect(host.imports).toHaveBeenCalledTimes(2);
  });

  it.each(['malformed', 'oversized', 'unreadable'] as const)(
    'keeps formal corrections readable when an obsolete sidecar is %s',
    async (failure) => {
      const { host, parsed, manual, sidecar } = setup();
      await readAttachmentDocumentCorrections(2, parsed, key);
      if (failure === 'malformed') host.files.set(sidecar, '{broken JSON');
      else if (failure === 'oversized') host.files.set(sidecar, 'x'.repeat(32 * 1024 * 1024 + 1));
      else {
        const readContents = Zotero.File.getContentsAsync;
        vi.spyOn(Zotero.File, 'getContentsAsync').mockImplementation((...args) => {
          if (args[0] === sidecar) throw new Error('Retained sidecar cannot be read');
          return readContents(...args);
        });
      }
      const retained = host.files.get(sidecar);
      expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
      expect(host.files.get(sidecar)).toBe(retained);
      expect(host.imports).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['pending', 'corrupt', 'unknown-schema', 'removed'] as const)(
    'does not infer absent correction history from a %s attachment when the PDF is missing',
    async (failure) => {
      const { host, parsed, sidecar } = setup();
      const attachment = host.addJSON(
        failure === 'pending'
          ? null
          : failure === 'corrupt'
            ? '{broken JSON'
            : JSON.stringify({ format: 'zotero-neo', schemaVersion: 99 }),
      );
      if (failure === 'removed') attachment.deleted = true;
      host.files.delete('/pdf');
      await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toMatchObject({
        kind: 'incomplete',
      });
      expect(artifactStorageIssues(2)[0].kind).toBe('incomplete');
      expect(host.files.has(sidecar)).toBe(true);
      expect(host.imports).not.toHaveBeenCalled();
    },
  );

  it('does not fall back to manual sidecars when formal attachment identity cannot be checked', async () => {
    const { host, parsed } = setup();
    await readAttachmentDocumentCorrections(2, parsed, key);
    host.setURI('http://zotero.org/users/local/no-account');
    host.files.delete('/pdf');
    await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toMatchObject({
      kind: 'identity-unavailable',
    });
    expect(host.imports).toHaveBeenCalledTimes(1);
  });

  it('does not infer absent correction authority from an unavailable source attachment', async () => {
    const { host, parsed } = setup();
    host.pdf.deleted = true;
    await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toMatchObject({
      kind: 'source-unavailable',
    });
    expect(host.imports).not.toHaveBeenCalled();
  });

  it('recovers matching local corrections with a missing PDF only after proving formal history absent', async () => {
    const { host, parsed, manual, sidecar } = setup();
    host.files.delete('/pdf');
    expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
    expect(artifactStorageIssues(2)[0].kind).toBe('source-unavailable');
    expect(host.files.get(sidecar)).toBe(JSON.stringify(manual));
    expect(host.imports).not.toHaveBeenCalled();
    const changed = { ...parsed, modelRevision: 'another-parser' };
    await expect(readAttachmentDocumentCorrections(2, changed, key)).rejects.toMatchObject({
      kind: 'source-unavailable',
    });
  });
  it('stores and restores manual corrections without an account and labels the native local artifacts honestly', async () => {
    const { host, parsed, manual } = setup();
    host.setURI('http://zotero.org/users/local/knownLocal');
    const state = await readAttachmentDocumentCorrections(2, parsed, key);
    expect(state).toEqual(manual);
    expect(artifactStorageIssues(2)[0].kind).toBe('local-only');
    await saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous: state,
      next: emptyDocumentCorrections(parsed, key),
      current: async () => true,
    });
    expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
    expect(artifactStorageIssues(2)[0].kind).toBe('local-only');
    expect(host.imports).toHaveBeenCalledTimes(2);
  });

  it('recovers a legacy historical baseline before migrating when PDF bytes or parser output have already changed', async () => {
    const { host, parsed, manual, sidecar } = setup();
    host.files.set('/pdf', 'new content before first migration');
    const current = {
      ...baseline(host.md5('new content before first migration')),
      modelRevision: 'new-model',
    };
    expect((await readAttachmentDocumentCorrections(2, current, key)).edits).toEqual([]);
    const listing = await createArtifactRepository().list(host.parent, 'document-corrections');
    expect(listing.artifacts).toHaveLength(1);
    expect(listing.artifacts[0].payload).toMatchObject({
      baseline: { ...parsed, durationMs: 0 },
      corrections: manual,
    });
    expect(listing.artifacts[0].source?.contentHash).toEqual({
      algorithm: 'md5',
      value: parsed.sourceFingerprint,
    });
    expect(host.files.get(sidecar)).toBe(JSON.stringify(manual));
    expect(artifactStorageIssues(2)[0].kind).toBe('source-changed');
  });
  it('retains old source/parser history but never reapplies coordinates to a changed baseline', async () => {
    const { host, parsed } = setup();
    await readAttachmentDocumentCorrections(2, parsed, key);
    const changedParser = {
      ...parsed,
      modelRevision: 'new-model',
      regions: [{ ...parsed.regions[0], text: 'Different parser text with same region ID' }],
    };
    expect((await readAttachmentDocumentCorrections(2, changedParser, key)).edits).toEqual([]);
    expect(artifactStorageIssues(2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'source-changed' })]),
    );
    host.files.set('/pdf', 'new PDF bytes');
    await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toMatchObject({
      kind: 'source-changed',
    });
    const changedPDF = baseline(host.md5('new PDF bytes'));
    expect((await readAttachmentDocumentCorrections(2, changedPDF, key)).edits).toEqual([]);
    expect((await createArtifactRepository().list(host.parent)).artifacts).toHaveLength(1);
  });

  it('detects concurrent windows and keeps the first manual commit intact', async () => {
    const { parsed } = setup();
    const left = await readAttachmentDocumentCorrections(2, parsed, key),
      right = await readAttachmentDocumentCorrections(2, parsed, key);
    const restore = emptyDocumentCorrections(parsed, key);
    await saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous: left,
      next: restore,
      current: async () => true,
    });
    await expect(
      saveAttachmentDocumentCorrections({
        itemID: 2,
        parsed,
        key,
        previous: right,
        next: restore,
        current: async () => true,
      }),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(artifactStorageIssues(2)[0].kind).toBe('conflict');
    expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
  });

  it('recovers local manual work without claiming a successful read-only or account-less migration', async () => {
    const { host, parsed, manual, sidecar } = setup();
    host.library.filesEditable = false;
    const state = await readAttachmentDocumentCorrections(2, parsed, key);
    expect(state).toEqual(manual);
    expect(artifactStorageIssues(2)[0].kind).toBe('read-only');
    const next = emptyDocumentCorrections(parsed, key);
    await expect(
      saveAttachmentDocumentCorrections({
        itemID: 2,
        parsed,
        key,
        previous: state,
        next,
        current: async () => true,
      }),
    ).rejects.toMatchObject({ kind: 'read-only' });
    expect(host.files.get(sidecar)).toBe(JSON.stringify(manual));
    host.setURI('http://zotero.org/users/local/no-account');
    expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
    expect(artifactStorageIssues(2)[0].kind).toBe('identity-unavailable');
  });

  it('does not use an old sidecar as an empty or restored state when formal files are pending or removed', async () => {
    const { host, parsed } = setup();
    await readAttachmentDocumentCorrections(2, parsed, key);
    const state = await readAttachmentDocumentCorrections(2, parsed, key);
    await saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous: state,
      next: emptyDocumentCorrections(parsed, key),
      current: async () => true,
    });
    host.addJSON(null);
    await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toMatchObject({
      kind: 'incomplete',
    });
    expect(artifactStorageIssues(2).some((issue) => issue.kind === 'pending-download')).toBe(true);
    expect(host.imports).toHaveBeenCalledTimes(2);
  });

  it('does not publish or notify after cancellation or a failed native import and permits a later explicit save', async () => {
    const { host, parsed, manual } = setup();
    const previous = await readAttachmentDocumentCorrections(2, parsed, key);
    const next = emptyDocumentCorrections(parsed, key);
    const notify = vi.fn();
    const stop = observeAttachmentDocumentCache(2, notify);
    try {
      let checks = 0;
      expect(
        await saveAttachmentDocumentCorrections({
          itemID: 2,
          parsed,
          key,
          previous,
          next,
          current: async () => ++checks === 1,
        }),
      ).toBe(false);
      expect(host.imports).toHaveBeenCalledTimes(1);
      expect(notify).not.toHaveBeenCalled();
      expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
      host.imports.mockRejectedValueOnce(new Error('disk unavailable'));
      await expect(
        saveAttachmentDocumentCorrections({
          itemID: 2,
          parsed,
          key,
          previous,
          next,
          current: async () => true,
        }),
      ).rejects.toThrow('disk unavailable');
      expect(notify).not.toHaveBeenCalled();
      expect([...host.files.keys()].some((path) => path.startsWith('/temp/'))).toBe(false);
      expect(await readAttachmentDocumentCorrections(2, parsed, key)).toEqual(manual);
      expect(
        await saveAttachmentDocumentCorrections({
          itemID: 2,
          parsed,
          key,
          previous,
          next,
          current: async () => true,
        }),
      ).toBe(true);
      expect(notify).toHaveBeenCalledOnce();
      expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
    } finally {
      stop();
    }
  });

  it('rechecks a queued owner after an earlier owner is cancelled and releases the queue', async () => {
    const { host, parsed } = setup();
    const previous = await readAttachmentDocumentCorrections(2, parsed, key);
    const next = emptyDocumentCorrections(parsed, key);
    const entered = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<boolean>();
    const first = saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous,
      next,
      current: async () => {
        entered.resolve();
        return gate.promise;
      },
    });
    await entered.promise;
    let current = true;
    const second = saveAttachmentDocumentCorrections({
      itemID: 2,
      parsed,
      key,
      previous,
      next,
      current: async () => current,
    });
    current = false;
    gate.resolve(false);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(host.imports).toHaveBeenCalledTimes(1);
    expect(
      await saveAttachmentDocumentCorrections({
        itemID: 2,
        parsed,
        key,
        previous,
        next,
        current: async () => true,
      }),
    ).toBe(true);
    expect((await readAttachmentDocumentCorrections(2, parsed, key)).edits).toEqual([]);
  });

  it.each(['malformed', 'oversized'] as const)(
    'rejects a %s legacy correction file without publishing or losing it',
    async (failure) => {
      const { host, parsed, sidecar } = setup();
      const content = failure === 'malformed' ? '{broken' : 'x'.repeat(32 * 1024 * 1024 + 1);
      host.files.set(sidecar, content);
      const read = vi.spyOn(Zotero.File, 'getContentsAsync');
      await expect(readAttachmentDocumentCorrections(2, parsed, key)).rejects.toThrow();
      expect(host.imports).not.toHaveBeenCalled();
      expect(host.files.get(sidecar)).toBe(content);
      if (failure === 'oversized') expect(read).not.toHaveBeenCalled();
    },
  );
});
