import { afterEach, describe, expect, it, vi } from 'vitest';
import { artifactHeads, createArtifactRepository, validateArtifact } from '../../src/artifacts';
import { artifactHost } from '../fixtures/artifact-host';

const payload = {
  version: 1,
  stage: 'proposal',
  query: { text: 'Paper title', authors: ['Author'] },
  paper: {
    source: 'crossref',
    sourceID: '10.1/paper',
    title: 'Paper',
    authors: ['Author'],
    year: 2026,
    venue: 'Journal',
  },
  snapshot: { itemKey: 'PARENT01', values: { title: 'Original' } },
  changes: [{ field: 'title', before: 'Original', after: 'Paper' }],
  selectedFields: ['title'],
  appliedFields: [],
};
afterEach(() => vi.unstubAllGlobals());

describe('versioned Zotero artifact attachments', () => {
  it('publishes stored siblings, reuses identical revision content, and rejects revision collisions', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    const first = await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'one',
      payload,
    });
    expect(first.reused).toBe(false);
    expect(host.imports).toHaveBeenCalledTimes(1);
    const attachment = host.children.find((item) => item.key === first.attachmentKey)!;
    expect(attachment.parentID).toBe(host.parent.id);
    expect(attachment.attachmentLinkMode).toBe(0);
    expect(first.artifact).toMatchObject({
      libraryURI: 'http://zotero.org/users/42',
      parentItemKey: 'PARENT01',
    });
    const second = await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'one',
      payload: JSON.parse(JSON.stringify(payload)),
    });
    expect(second).toMatchObject({ reused: true, attachmentKey: first.attachmentKey });
    await expect(
      repo.publish(host.parent, {
        kind: 'metadata-review',
        recordID: 'review',
        revisionID: 'one',
        payload: { ...payload, selectedFields: [] },
      }),
    ).rejects.toMatchObject({ kind: 'revision-collision' });
    expect(host.imports).toHaveBeenCalledTimes(1);
  });

  it('retains independent offline revisions and requires an explicit merge rather than timestamp arbitration', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'base',
      payload,
    });
    await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'left',
      parentRevisions: ['base'],
      payload,
    });
    await createArtifactRepository().publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'right',
      parentRevisions: ['base'],
      payload: { ...payload, selectedFields: [] },
    });
    const listing = await repo.list(host.parent);
    expect(listing.complete).toBe(true);
    expect(
      artifactHeads(listing.artifacts, 'review')
        .map((artifact) => artifact.revisionID)
        .sort(),
    ).toEqual(['left', 'right']);
    await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'merge',
      parentRevisions: ['left', 'right'],
      payload,
    });
    expect(
      artifactHeads((await repo.list(host.parent)).artifacts, 'review').map(
        (artifact) => artifact.revisionID,
      ),
    ).toEqual(['merge']);
    expect(
      host.children.filter((item) => item.attachmentContentType === 'application/json'),
    ).toHaveLength(4);
  });

  it.each([
    'unknown-schema',
    'corrupt',
    'pending-download',
    'revision-collision',
    'identity-mismatch',
    'missing-revision',
    'invalid-lineage',
    'removed-artifact',
  ])('preserves %s evidence and blocks unsafe publication', async (failure) => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    const { artifact } = await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      revisionID: 'base',
      payload,
    });
    const original = JSON.stringify(artifact);
    if (failure === 'unknown-schema')
      host.addJSON(JSON.stringify({ ...artifact, schemaVersion: 99 }));
    if (failure === 'corrupt') host.addJSON('{broken');
    if (failure === 'pending-download') host.addJSON(null);
    if (failure === 'revision-collision')
      host.addJSON(JSON.stringify({ ...artifact, payload: { ...payload, selectedFields: [] } }));
    if (failure === 'identity-mismatch')
      host.addJSON(JSON.stringify({ ...artifact, parentItemKey: 'OTHER001' }));
    if (failure === 'missing-revision')
      host.addJSON(
        JSON.stringify({ ...artifact, revisionID: 'orphan', parentRevisions: ['missing'] }),
      );
    if (failure === 'invalid-lineage') {
      host.addJSON(
        JSON.stringify({ ...artifact, revisionID: 'cycle-a', parentRevisions: ['cycle-b'] }),
      );
      host.addJSON(
        JSON.stringify({ ...artifact, revisionID: 'cycle-b', parentRevisions: ['cycle-a'] }),
      );
    }
    if (failure === 'removed-artifact')
      host.children.find((item) => item.attachmentContentType === 'application/json')!.deleted =
        true;
    const before = [...host.files];
    const listing = await repo.list(host.parent);
    expect(listing.complete).toBe(false);
    expect(listing.issues.some((issue) => issue.kind === failure)).toBe(true);
    await expect(
      repo.publish(host.parent, { kind: 'metadata-review', recordID: 'review', payload }),
    ).rejects.toMatchObject({ kind: 'incomplete' });
    expect([...host.files]).toEqual(before);
    expect(JSON.stringify(artifact)).toBe(original);
  });

  it('ignores unrelated malformed or missing JSON but reports malformed Neo files and renamed unknown schemas', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    host.addJSON('{broken unrelated JSON', 'ordinary-data.json');
    host.addJSON(null, 'unrelated-undownloaded.json');
    expect(await repo.list(host.parent)).toMatchObject({ complete: true, issues: [] });
    const published = await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'review',
      payload,
    });
    host.addJSON('{broken Neo JSON', 'zotero-neo-broken.json');
    expect((await repo.list(host.parent)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'corrupt' })]),
    );
    host.addJSON(
      JSON.stringify({ ...published.artifact, schemaVersion: 99 }),
      'renamed-external.json',
    );
    const listing = await repo.list(host.parent);
    expect(listing.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'unknown-schema' })]),
    );
    await expect(
      repo.publish(host.parent, { kind: 'metadata-review', recordID: 'another', payload }),
    ).rejects.toMatchObject({ kind: 'incomplete' });
  });

  it.each(['ai-qa', 'document-corrections'])(
    'leaves retired %s attachments, including trashed or unsupported payloads, out of active lineage',
    async (kind) => {
      const host = artifactHost();
      const repo = createArtifactRepository();
      const legacy = JSON.stringify({
        format: 'zotero-neo',
        kind,
        schemaVersion: 99,
        payload: { oldShape: true },
      });
      const live = host.addJSON(legacy, 'renamed-external.json');
      const trashed = host.addJSON(legacy);
      trashed.deleted = true;
      const legacyFiles = [...host.files].filter(([, value]) => value === legacy);
      expect(legacyFiles).toHaveLength(2);
      expect(await repo.list(host.parent)).toMatchObject({
        complete: true,
        artifacts: [],
        issues: [],
      });

      const published = await repo.publish(host.parent, {
        kind: 'metadata-review',
        recordID: 'review',
        payload,
      });
      expect(await repo.list(host.parent)).toMatchObject({
        complete: true,
        artifacts: [published.artifact],
        issues: [],
      });
      expect([...host.files].filter(([, value]) => value === legacy)).toEqual(legacyFiles);
      expect(host.children).toEqual(expect.arrayContaining([live, trashed]));
      expect(live.deleted).toBe(false);
      expect(trashed.deleted).toBe(true);
    },
  );

  it('distinguishes account-less identity and read-only libraries', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    host.library.filesEditable = false;
    await expect(
      repo.publish(host.parent, { kind: 'metadata-review', recordID: 'review', payload }),
    ).rejects.toMatchObject({ kind: 'read-only' });
    host.setURI('http://zotero.org/users/local/abc');
    expect(await repo.list(host.parent)).toMatchObject({
      availability: 'local-only',
      complete: true,
    });
  });

  it('uses native local-only identity and accepts its known local key after account sign-in, not a foreign personal URI', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    host.setURI('http://zotero.org/users/local/knownLocal');
    const saved = await repo.publish(host.parent, {
      kind: 'metadata-review',
      recordID: 'local-review',
      revisionID: 'local-one',
      payload,
    });
    expect(await repo.list(host.parent)).toMatchObject({
      availability: 'local-only',
      complete: true,
    });
    const before = [...host.files];
    host.setURI('http://zotero.org/users/42');
    expect(await repo.list(host.parent)).toMatchObject({
      availability: 'sync-unverified',
      complete: true,
    });
    expect(
      (
        await repo.publish(host.parent, {
          kind: 'metadata-review',
          recordID: 'local-review',
          revisionID: 'local-one',
          payload,
        })
      ).reused,
    ).toBe(true);
    expect([...host.files]).toEqual(before);
    host.addJSON(
      JSON.stringify({
        ...saved.artifact,
        revisionID: 'foreign',
        libraryURI: 'http://zotero.org/users/local/someoneElse',
      }),
    );
    expect((await repo.list(host.parent)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'identity-mismatch' })]),
    );
  });

  it('rejects invalid known payloads and stale source without creating attachments', async () => {
    const host = artifactHost(),
      repo = createArtifactRepository();
    await expect(
      repo.publish(host.parent, {
        kind: 'metadata-review',
        recordID: 'review',
        payload: { version: 1 },
      }),
    ).rejects.toMatchObject({ kind: 'invalid-payload' });
    await expect(
      repo.publish(
        host.parent,
        { kind: 'metadata-review', recordID: 'review', payload },
        () => false,
      ),
    ).rejects.toMatchObject({ kind: 'stale-source' });
    expect(host.imports).not.toHaveBeenCalled();
    expect(() => validateArtifact({ format: 'zotero-neo', schemaVersion: 2 })).toThrow(
      'Unsupported',
    );
  });
});
