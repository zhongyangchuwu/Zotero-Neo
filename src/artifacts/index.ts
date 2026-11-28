import {
  artifactAttachments,
  artifactBelongsToParent,
  artifactParentIdentity,
  importArtifactAttachment,
  readArtifactAttachment,
  ARTIFACT_MAX_BYTES,
  ARTIFACT_PREFIX,
} from '../platform/artifacts';
import {
  ArtifactError,
  type ArtifactInput,
  type ArtifactKind,
  type ArtifactListing,
  type NeoArtifact,
  type NeoArtifactRepository,
} from './contracts';
import { canonicalJSON, validateArtifact } from './validation';
import { record } from '../document-analysis/contracts';
export * from './contracts';
export { canonicalJSON, validateArtifact } from './validation';

const queues = new Map<string, Promise<unknown>>();
function identityContent(artifact: NeoArtifact): string {
  const { createdAt: _time, producer: _producer, libraryURI: _uri, ...content } = artifact;
  return canonicalJSON(content);
}

function lineageError(artifact: NeoArtifact, ancestor: NeoArtifact): string | null {
  if (ancestor.recordID !== artifact.recordID || ancestor.kind !== artifact.kind)
    return 'Artifact parent revision belongs to another record';
  return null;
}

/** Native attachment files are the authority. No global index, overwrite or automatic cleanup. */
export function createArtifactRepository(): NeoArtifactRepository {
  async function scan(
    parent: Zotero.Item,
    kind?: ArtifactKind,
  ): Promise<ArtifactListing & { keys: Map<string, string> }> {
    const identity = artifactParentIdentity(parent);
    const artifacts: NeoArtifact[] = [],
      issues: { kind: string; message: string; attachmentKey?: string }[] = [],
      keys = new Map<string, string>();
    const revisions = new Map<string, NeoArtifact>();
    for (const attachment of await artifactAttachments(parent)) {
      let recognized =
        attachment.attachmentFilename.startsWith(ARTIFACT_PREFIX) ||
        attachment.getField?.('title') === 'Zotero Neo artifact';
      try {
        const text = await readArtifactAttachment(attachment);
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          if (!attachment.deleted)
            throw new ArtifactError('corrupt', 'Invalid artifact JSON; file preserved');
        }
        const envelope = record(value);
        // Identifiable retired attachments stay stored and do not participate in active histories.
        if (
          envelope?.format === 'zotero-neo' &&
          (envelope.kind === 'ai-qa' || envelope.kind === 'document-corrections')
        )
          continue;
        if (attachment.deleted)
          throw new ArtifactError(
            'removed-artifact',
            'An artifact attachment is in the trash; restore or resolve it explicitly before saving',
          );
        // Ordinary unrelated JSON is not a Neo artifact. Named Neo files must never disappear silently.
        if (envelope?.format === 'zotero-neo') recognized = true;
        if (!recognized) continue;
        const artifact = validateArtifact(value);
        if (!artifactBelongsToParent(parent, artifact.libraryURI, artifact.parentItemKey))
          throw new ArtifactError(
            'identity-mismatch',
            'Artifact belongs to another library or parent item',
          );
        const existing = revisions.get(artifact.revisionID);
        if (existing && identityContent(existing) !== identityContent(artifact))
          throw new ArtifactError(
            'revision-collision',
            'Artifact revision identity has conflicting contents',
          );
        if (!existing) {
          artifacts.push(artifact);
          revisions.set(artifact.revisionID, artifact);
        }
        keys.set(artifact.revisionID, attachment.key);
      } catch (error) {
        if (!recognized) continue;
        issues.push({
          kind: error instanceof ArtifactError ? error.kind : 'unavailable',
          message: error instanceof Error ? error.message : String(error),
          attachmentKey: attachment.key,
        });
      }
    }
    // Missing parents mean metadata/file sync may be incomplete. Never infer a unique global head.
    for (const artifact of artifacts) {
      for (const revision of artifact.parentRevisions) {
        const ancestor = revisions.get(revision);
        if (!ancestor)
          issues.push({
            kind: 'missing-revision',
            message: `Revision ${revision} is not available locally`,
            attachmentKey: keys.get(artifact.revisionID),
          });
        else {
          const message = lineageError(artifact, ancestor);
          if (message)
            issues.push({
              kind: 'invalid-lineage',
              message,
              attachmentKey: keys.get(artifact.revisionID),
            });
        }
      }
    }
    // Topological traversal avoids recursion on externally supplied revision chains.
    const counts = new Map<string, number>(),
      descendants = new Map<string, string[]>();
    for (const artifact of artifacts) {
      counts.set(
        artifact.revisionID,
        artifact.parentRevisions.filter((revision) => revisions.has(revision)).length,
      );
      for (const revision of artifact.parentRevisions) {
        const children = descendants.get(revision) ?? [];
        children.push(artifact.revisionID);
        descendants.set(revision, children);
      }
    }
    const ready = [...counts].filter(([, count]) => count === 0).map(([revision]) => revision);
    for (let index = 0; index < ready.length; index += 1) {
      for (const child of descendants.get(ready[index]) ?? []) {
        const remaining = counts.get(child)! - 1;
        counts.set(child, remaining);
        if (!remaining) ready.push(child);
      }
    }
    if (ready.length !== artifacts.length)
      issues.push({ kind: 'invalid-lineage', message: 'Artifact revision graph contains a cycle' });
    return {
      artifacts: kind ? artifacts.filter((artifact) => artifact.kind === kind) : artifacts,
      availability: identity.libraryURI.includes('/users/local/')
        ? 'local-only'
        : 'sync-unverified',
      complete: !issues.length,
      issues,
      keys,
    };
  }
  return {
    async list(parent, kind) {
      const { keys: _keys, ...listing } = await scan(parent, kind);
      return listing;
    },
    async publish(parent, input: ArtifactInput, isCurrent = () => true) {
      const identity = artifactParentIdentity(parent),
        slot = `${parent.libraryID}:${parent.key}`;
      const predecessor = queues.get(slot) ?? Promise.resolve();
      const task = predecessor
        .catch(() => {})
        .then(async () => {
          const artifact = validateArtifact({
            format: 'zotero-neo',
            schemaVersion: 1,
            ...identity,
            kind: input.kind,
            recordID: input.recordID,
            revisionID: input.revisionID ?? Zotero.Utilities.randomString(32),
            parentRevisions: [...(input.parentRevisions ?? [])].sort(),
            createdAt: new Date().toISOString(),
            producer: { name: 'Zotero Neo', version: '1' },
            ...(input.source ? { source: input.source } : {}),
            payload: input.payload,
          });
          const text = canonicalJSON(artifact);
          if (text.length > ARTIFACT_MAX_BYTES)
            throw new ArtifactError('oversized', 'Artifact exceeds 32 MiB');
          const listing = await scan(parent);
          if (!listing.complete)
            throw new ArtifactError(
              'incomplete',
              'Artifact files are unavailable, unsupported or inconsistent; no publication performed',
              listing.issues,
            );
          const existing = listing.artifacts.find(
            (entry) => entry.revisionID === artifact.revisionID,
          );
          if (existing) {
            if (identityContent(existing) !== identityContent(artifact))
              throw new ArtifactError(
                'revision-collision',
                'Revision identity cannot be reused for different contents',
              );
            return {
              artifact: existing,
              attachmentKey: listing.keys.get(existing.revisionID)!,
              reused: true,
            };
          }
          for (const revision of artifact.parentRevisions) {
            const ancestor = listing.artifacts.find((entry) => entry.revisionID === revision);
            if (!ancestor)
              throw new ArtifactError(
                'missing-revision',
                'Cannot publish against an unavailable parent revision',
              );
            const message = lineageError(artifact, ancestor);
            if (message) throw new ArtifactError('invalid-lineage', message);
          }
          const attachment = await importArtifactAttachment(parent, text, isCurrent);
          return { artifact, attachmentKey: attachment.key, reused: false };
        });
      queues.set(slot, task);
      try {
        return await task;
      } finally {
        if (queues.get(slot) === task) queues.delete(slot);
      }
    },
  };
}
