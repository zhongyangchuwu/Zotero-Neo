import { afterEach, describe, expect, it, vi } from 'vitest';
import { artifactHost } from '../fixtures/artifact-host';
import { createAIQARepository } from '../../src/ai-qa/repository';
import type { AIQARecord, AIQASource } from '../../src/ai-qa/contracts';
import { attachmentReadingStorage } from '../../src/platform/ai-qa-storage';
import { artifactHeads, createArtifactRepository } from '../../src/artifacts';
import { artifactStorageIssues } from '../../src/platform/artifact-feedback';

function setup() {
  const host = artifactHost();
  const source: AIQASource = {
    itemID: 2,
    libraryID: 2,
    key: 'PDFKEY01',
    fingerprint: host.digest,
    fileName: 'paper.pdf',
  };
  const record: AIQARecord = {
    id: 'reading-one',
    revision: 3,
    source: { ...source, fingerprint: host.md5('historical PDF') },
    kind: 'question',
    question: 'Why?',
    contextTitle: 'Paper',
    evidence: [],
    output: { paragraphs: [{ text: 'Original generated text', evidenceIDs: [] }], guide: [] },
    model: 'original-model',
    endpoint: 'https://name:secret@example.test/api?token=private',
    usage: { inputTokens: 12, outputTokens: 18 },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    userText: 'Human revision, not generated text',
  };
  const sidecar = '/legacy/.zotero-neo-reader-ai.json';
  host.files.set(sidecar, JSON.stringify({ version: 1, records: [record] }));
  return { host, source, record, sidecar };
}
afterEach(() => vi.unstubAllGlobals());

describe('AI history artifact storage without model calls', () => {
  it('migrates once with original/user text and source hashes intact, without local IDs or endpoint credentials', async () => {
    const { host, source, record, sidecar } = setup();
    const original = host.files.get(sidecar),
      repo = createAIQARepository(attachmentReadingStorage());
    const expected = { ...record, endpoint: 'https://example.test' };
    expect(await repo.list(source)).toEqual([expected]);
    expect(await createAIQARepository(attachmentReadingStorage()).list(source)).toEqual([expected]);
    expect(host.imports).toHaveBeenCalledTimes(1);
    const artifact = (await createArtifactRepository().list(host.parent, 'ai-qa')).artifacts[0];
    expect(artifact.payload).toMatchObject({
      record: {
        source: { key: source.key, fingerprint: record.source.fingerprint, fileName: 'paper.pdf' },
        output: record.output,
        userText: record.userText,
      },
    });
    expect(JSON.stringify(artifact)).not.toContain('secret');
    expect(JSON.stringify(artifact)).not.toContain('itemID');
    expect(JSON.stringify(artifact)).not.toContain('libraryID');
    expect(artifact.source?.contentHash).toEqual({
      algorithm: 'md5',
      value: record.source.fingerprint,
    });
    expect(host.files.get(sidecar)).toBe(original);
  });

  it('publishes meaningful edits and tombstones, never reimports deleted legacy results', async () => {
    const { host, source, record, sidecar } = setup(),
      repo = createAIQARepository(attachmentReadingStorage());
    await repo.list(source);
    const edit = await repo.edit(source, record.id, record.revision, 'Second human revision');
    expect(edit.output).toEqual(record.output);
    expect(edit.source.fingerprint).toBe(record.source.fingerprint);
    await repo.remove(source, record.id, edit.revision);
    expect(await createAIQARepository(attachmentReadingStorage()).list(source)).toEqual([]);
    const listing = await createArtifactRepository().list(host.parent, 'ai-qa');
    expect(listing.artifacts).toHaveLength(3);
    const heads = artifactHeads(listing.artifacts, listing.artifacts[0].recordID);
    expect(heads).toHaveLength(1);
    expect(heads[0].payload).toEqual({ version: 1, deleted: true, record: null });
    expect(host.files.get(sidecar)).toContain(record.userText!);
    expect(host.imports).toHaveBeenCalledTimes(3);
  });

  it('honors a formal tombstone when the PDF is missing and keeps source-unavailable feedback', async () => {
    const { host, source, record, sidecar } = setup(),
      repo = createAIQARepository(attachmentReadingStorage());
    await repo.list(source);
    await repo.remove(source, record.id, record.revision);
    host.files.delete('/pdf');
    expect(await createAIQARepository(attachmentReadingStorage()).list(source)).toEqual([]);
    expect(artifactStorageIssues(2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'source-unavailable' })]),
    );
    expect(host.files.get(sidecar)).toContain(record.userText!);
    expect(host.imports).toHaveBeenCalledTimes(2);
  });

  it.each(['malformed', 'oversized', 'unreadable'] as const)(
    'keeps formal AI records readable when an obsolete sidecar is %s',
    async (failure) => {
      const { host, source, record, sidecar } = setup(),
        repo = createAIQARepository(attachmentReadingStorage());
      await repo.list(source);
      const edited = await repo.edit(
        source,
        record.id,
        record.revision,
        'Authoritative human revision',
      );
      if (failure === 'malformed') host.files.set(sidecar, '{broken JSON');
      else if (failure === 'oversized') host.files.set(sidecar, 'x'.repeat(16 * 1024 * 1024 + 1));
      else {
        const readContents = Zotero.File.getContentsAsync;
        vi.spyOn(Zotero.File, 'getContentsAsync').mockImplementation((...args) => {
          if (args[0] === sidecar) throw new Error('Retained sidecar cannot be read');
          return readContents(...args);
        });
      }
      const retained = host.files.get(sidecar);
      expect(await createAIQARepository(attachmentReadingStorage()).list(source)).toEqual([edited]);
      expect(artifactStorageIssues(2)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'legacy-unavailable' })]),
      );
      expect(host.files.get(sidecar)).toBe(retained);
      expect(host.imports).toHaveBeenCalledTimes(2);
    },
  );

  it('continues migrating additional legacy records after another record has formal history', async () => {
    const { host, source, record, sidecar } = setup();
    await attachmentReadingStorage().read(source);
    const second = {
      ...record,
      id: 'reading-two',
      revision: 1,
      userText: 'Second retained manual result',
    };
    host.files.set(sidecar, JSON.stringify({ version: 1, records: [record, second] }));
    const repo = createAIQARepository(attachmentReadingStorage());
    expect(await repo.list(source)).toEqual(
      [record, second].map((entry) => ({ ...entry, endpoint: 'https://example.test' })),
    );
    expect(await createAIQARepository(attachmentReadingStorage()).list(source)).toHaveLength(2);
    expect(host.imports).toHaveBeenCalledTimes(2);
    expect(host.files.get(sidecar)).toContain(second.userText);
  });

  it.each(['pending', 'corrupt', 'unknown-schema', 'removed'] as const)(
    'does not infer absent formal AI history from a %s attachment when the PDF is missing',
    async (failure) => {
      const { host, source, sidecar } = setup();
      const attachment = host.addJSON(
        failure === 'pending'
          ? null
          : failure === 'corrupt'
            ? '{broken JSON'
            : JSON.stringify({ format: 'zotero-neo', schemaVersion: 99 }),
      );
      if (failure === 'removed') attachment.deleted = true;
      host.files.delete('/pdf');
      await expect(attachmentReadingStorage().read(source)).rejects.toMatchObject({
        kind: 'incomplete',
      });
      expect(artifactStorageIssues(2)[0].kind).toBe('incomplete');
      expect(host.files.has(sidecar)).toBe(true);
      expect(host.imports).not.toHaveBeenCalled();
    },
  );

  it('does not fall back to a sidecar when formal attachment identity cannot be checked', async () => {
    const { host, source } = setup();
    await attachmentReadingStorage().read(source);
    host.setURI('http://zotero.org/users/local/no-account');
    host.files.delete('/pdf');
    await expect(attachmentReadingStorage().read(source)).rejects.toMatchObject({
      kind: 'identity-unavailable',
    });
    expect(host.imports).toHaveBeenCalledTimes(1);
  });

  it('does not infer absent authority from an unavailable source attachment', async () => {
    const { host, source } = setup();
    host.pdf.deleted = true;
    await expect(attachmentReadingStorage().read(source)).rejects.toMatchObject({
      kind: 'source-unavailable',
    });
    expect(host.imports).not.toHaveBeenCalled();
  });

  it('recovers retained AI work from a missing PDF only after a complete authority-free listing', async () => {
    const { host, source, sidecar } = setup(),
      storage = attachmentReadingStorage();
    host.files.delete('/pdf');
    const local = await storage.read(source);
    expect(local).toBe(host.files.get(sidecar));
    expect(artifactStorageIssues(2)[0].kind).toBe('source-unavailable');
    await expect(storage.write(source, local!, async () => true)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(host.imports).not.toHaveBeenCalled();
  });

  it('keeps separate record histories and does not create revisions for unchanged data', async () => {
    const { host, source, record } = setup(),
      storage = attachmentReadingStorage(),
      repo = createAIQARepository(storage);
    await repo.list(source);
    const next = { ...record, id: 'reading-two', revision: 1, source };
    await repo.add(next, async () => true);
    expect(host.imports).toHaveBeenCalledTimes(2);
    await storage.write(source, (await storage.read(source))!, async () => true);
    expect(host.imports).toHaveBeenCalledTimes(2);
    await repo.edit(source, next.id, 1, 'Edit only second record');
    const listing = await createArtifactRepository().list(host.parent, 'ai-qa');
    expect(
      listing.artifacts.filter((artifact) => artifact.recordID.endsWith('reading-one')),
    ).toHaveLength(1);
    expect(
      listing.artifacts.filter((artifact) => artifact.recordID.endsWith('reading-two')),
    ).toHaveLength(2);
  });

  it('reports independent branches without choosing or overwriting either manual revision', async () => {
    const { host, source } = setup(),
      storage = attachmentReadingStorage(),
      repo = createArtifactRepository();
    await storage.read(source);
    const base = (await repo.list(host.parent, 'ai-qa')).artifacts[0],
      payload = base.payload as { record: AIQARecord };
    for (const branch of ['left', 'right'])
      await repo.publish(host.parent, {
        kind: 'ai-qa',
        recordID: base.recordID,
        revisionID: branch,
        parentRevisions: [base.revisionID],
        source: base.source,
        payload: {
          ...base.payload,
          record: { ...payload.record, revision: payload.record.revision + 1, userText: branch },
        },
      });
    await expect(storage.read(source)).rejects.toMatchObject({ kind: 'conflict' });
    expect(artifactStorageIssues(source.itemID)[0].kind).toBe('conflict');
    expect(
      artifactHeads((await repo.list(host.parent)).artifacts, base.recordID).map(
        (artifact) => artifact.payload,
      ),
    ).toEqual(
      expect.arrayContaining(
        ['left', 'right'].map((userText) =>
          expect.objectContaining({ record: expect.objectContaining({ userText }) }),
        ),
      ),
    );
  });

  it('rejects non-increasing external edits and resurrection after deletion instead of trusting a local version as identity', async () => {
    const { host, source } = setup(),
      storage = attachmentReadingStorage(),
      repo = createArtifactRepository();
    await storage.read(source);
    const base = (await repo.list(host.parent, 'ai-qa')).artifacts[0];
    await expect(
      repo.publish(host.parent, {
        kind: 'ai-qa',
        recordID: base.recordID,
        parentRevisions: [base.revisionID],
        source: base.source,
        payload: base.payload,
      }),
    ).rejects.toMatchObject({ kind: 'invalid-lineage' });
    const deleted = await repo.publish(host.parent, {
      kind: 'ai-qa',
      recordID: base.recordID,
      parentRevisions: [base.revisionID],
      source: base.source,
      payload: { version: 1, deleted: true, record: null },
    });
    await expect(
      repo.publish(host.parent, {
        kind: 'ai-qa',
        recordID: base.recordID,
        parentRevisions: [deleted.artifact.revisionID],
        source: base.source,
        payload: base.payload,
      }),
    ).rejects.toMatchObject({ kind: 'invalid-lineage' });
    expect(await storage.read(source)).toBe(JSON.stringify({ version: 1, records: [] }));
  });

  it('migrates and edits existing history in an account-less native local library with local-only feedback', async () => {
    const { host, source, record } = setup(),
      repo = createAIQARepository(attachmentReadingStorage());
    host.setURI('http://zotero.org/users/local/knownLocal');
    expect(await repo.list(source)).toEqual([
      expect.objectContaining({ userText: record.userText, output: record.output }),
    ]);
    expect(artifactStorageIssues(2)[0].kind).toBe('local-only');
    await repo.edit(source, record.id, record.revision, 'Local human revision');
    expect(artifactStorageIssues(2)[0].kind).toBe('local-only');
    expect((await createArtifactRepository().list(host.parent)).availability).toBe('local-only');
    expect(host.imports).toHaveBeenCalledTimes(2);
  });

  it('retains readable local history when native library identity is unavailable and refuses replacement writes', async () => {
    const { host, source, sidecar } = setup(),
      storage = attachmentReadingStorage();
    host.setURI('http://zotero.org/users/local/no-account');
    const local = await storage.read(source);
    expect(local).toBe(host.files.get(sidecar));
    expect(artifactStorageIssues(2)[0].kind).toBe('identity-unavailable');
    await expect(storage.write(source, local!, async () => true)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(host.imports).not.toHaveBeenCalled();
    expect(host.files.get(sidecar)).toBe(local);
  });

  it('rejects pending files and changed sources rather than treating either as empty history', async () => {
    const { host, source, record } = setup(),
      storage = attachmentReadingStorage();
    await storage.read(source);
    host.files.set('/pdf', 'new bytes');
    await expect(
      storage.write(
        source,
        JSON.stringify({ version: 1, records: [{ ...record, userText: 'new' }] }),
        async () => true,
      ),
    ).rejects.toMatchObject({ kind: 'source-changed' });
    host.addJSON(null);
    await expect(storage.read(source)).rejects.toMatchObject({ kind: 'incomplete' });
    expect(artifactStorageIssues(2).some((issue) => issue.kind === 'pending-download')).toBe(true);
    expect(host.imports).toHaveBeenCalledTimes(1);
  });
});
