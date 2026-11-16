import type { AIQAStorage } from '../ai-qa/repository';
import type { AIQARecord, AIQASource } from '../ai-qa/contracts';
import {
  ArtifactError,
  artifactHeads,
  canonicalJSON,
  createArtifactRepository,
  type ArtifactIssue,
  type ArtifactSource,
  type NeoArtifact,
} from '../artifacts';
import { artifactAttachments, artifactPDF } from './artifacts';
import { artifactFailureIssues, setArtifactStorageIssues } from './artifact-feedback';

const MAX_BYTES = 16 * 1024 * 1024;
type PortableRecord = Omit<AIQARecord, 'source'> & {
  source: Omit<AIQASource, 'itemID' | 'libraryID'>;
};
interface ReadingState {
  readonly records: readonly AIQARecord[];
  readonly revisions: ReadonlyMap<string, string>;
  readonly availability: 'local-only' | 'sync-unverified';
  readonly issues: readonly ArtifactIssue[];
}

async function legacyContents(source: AIQASource): Promise<string | null> {
  const item = await Zotero.Items.getAsync(source.itemID);
  if (
    !item ||
    item.deleted ||
    !item.isPDFAttachment() ||
    item.key !== source.key ||
    item.libraryID !== source.libraryID
  )
    throw new ArtifactError('source-unavailable', 'PDF attachment unavailable');
  const file = Zotero.Attachments.getStorageDirectory(item).clone();
  file.append('.zotero-neo-reader-ai.json');
  if (!file.exists()) return null;
  if (file.fileSize > MAX_BYTES) throw new Error('AI Q&A store exceeds size limit');
  const text = await Zotero.File.getContentsAsync(file.path, 'UTF-8', MAX_BYTES);
  if (typeof text !== 'string') throw new Error('AI Q&A store unreadable');
  return text;
}
function portable(record: AIQARecord): PortableRecord {
  const source = {
    key: record.source.key,
    fingerprint: record.source.fingerprint,
    fileName: record.source.fileName.split(/[\\/]/u).at(-1) ?? '',
  };
  // A legacy endpoint may contain credentials or signed query parameters. They are not an artifact.
  let endpoint = '';
  try {
    const url = new URL(record.endpoint);
    endpoint = url.origin;
  } catch {
    /* Invalid legacy endpoint is not necessary to recover the result. */
  }
  return {
    id: record.id,
    revision: record.revision,
    source,
    kind: record.kind,
    question: record.question,
    contextTitle: record.contextTitle,
    evidence: record.evidence.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      text: entry.text,
      format: entry.format,
      pageLabel: entry.pageLabel,
      precision: entry.precision,
      location: entry.location
        ? { pageIndex: entry.location.pageIndex, rects: entry.location.rects }
        : null,
      nativePosition: entry.nativePosition,
    })),
    output: {
      paragraphs: record.output.paragraphs.map((entry) => ({
        text: entry.text,
        evidenceIDs: entry.evidenceIDs,
      })),
      guide: record.output.guide.map((entry) => ({
        evidenceID: entry.evidenceID,
        role: entry.role,
        reason: entry.reason,
      })),
    },
    model: record.model,
    endpoint,
    usage: { inputTokens: record.usage.inputTokens, outputTokens: record.usage.outputTokens },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    userText: record.userText,
  };
}

function readingArtifactSource(current: ArtifactSource, record: AIQARecord): ArtifactSource {
  const hash = record.source.fingerprint.toLowerCase();
  if (record.source.key !== current.attachmentKey || !/^[a-f0-9]{32}$/u.test(hash))
    throw new ArtifactError(
      'invalid-source',
      'AI history requires its original MD5 source fingerprint; no replacement hash was invented',
    );
  return {
    attachmentKey: current.attachmentKey,
    contentHash: { algorithm: 'md5', value: hash },
    precision: record.evidence.length ? 'region' : 'document',
  };
}
const idFor = (source: AIQASource, id: string) => `ai-qa:${source.key}:${id}`;
function materialize(artifact: NeoArtifact, source: AIQASource): AIQARecord | null {
  const payload = artifact.payload as { deleted: boolean; record: PortableRecord | null };
  if (payload.deleted) return null;
  const record = payload.record!;
  if (record.source.key !== source.key || artifact.recordID !== idFor(source, record.id))
    throw new ArtifactError(
      'identity-mismatch',
      'AI reading record identity does not match its source',
    );
  return {
    ...record,
    source: { ...record.source, itemID: source.itemID, libraryID: source.libraryID },
  };
}

/** Per-record immutable commits; legacy sidecars are recovery inputs and are never removed or rewritten. */
export function attachmentReadingStorage(): AIQAStorage {
  const repository = createArtifactRepository(),
    observed = new Map<string, ReadingState>();
  const slot = (source: AIQASource) => `${source.libraryID}:${source.key}`;
  const allowLegacy = new Map<string, boolean>();
  async function load(source: AIQASource): Promise<ReadingState> {
    allowLegacy.set(slot(source), false);
    const item = await Zotero.Items.getAsync(source.itemID);
    if (!item || item.deleted || !item.isPDFAttachment())
      throw new ArtifactError('source-unavailable', 'PDF attachment unavailable');
    if (item.key !== source.key || item.libraryID !== source.libraryID)
      throw new ArtifactError('source-changed', 'AI source attachment changed');
    if (!item.parentID) {
      allowLegacy.set(slot(source), true);
      throw new ArtifactError(
        'parent-required',
        'Attach this standalone PDF to a regular reference before saving Neo artifacts',
      );
    }
    const parent = await Zotero.Items.getAsync(item.parentID);
    if (!parent)
      throw new ArtifactError(
        'parent-required',
        'AI history parent is unavailable; formal history could not be checked',
      );
    // Discover authority from attachment metadata, even when PDF bytes are offline.
    const listing = await repository.list(parent, 'ai-qa').catch(async (error: unknown) => {
      if (error instanceof ArtifactError && error.kind === 'identity-unavailable')
        allowLegacy.set(slot(source), (await artifactAttachments(parent)).length === 0);
      throw error;
    });
    const authoritative = listing.artifacts.some(
      (artifact) => artifact.source?.attachmentKey === source.key,
    );
    allowLegacy.set(slot(source), listing.complete && !authoritative);
    if (!listing.complete)
      throw new ArtifactError(
        'incomplete',
        'AI reading artifacts are incomplete; no overwrite is allowed',
        listing.issues,
      );
    const artifacts = [...listing.artifacts],
      issues: ArtifactIssue[] = [];
    const pdf = await artifactPDF(source.itemID).catch((error: unknown) => {
      if (
        !authoritative ||
        !(error instanceof ArtifactError) ||
        error.kind !== 'source-unavailable'
      )
        throw error;
      issues.push(...artifactFailureIssues(error));
      return undefined;
    });
    if (pdf) {
      if (
        pdf.item.key !== source.key ||
        pdf.item.libraryID !== source.libraryID ||
        pdf.parent.id !== parent.id
      )
        throw new ArtifactError('source-changed', 'AI source attachment changed');
      const migrations: {
        recordID: string;
        payload: { version: number; deleted: boolean; record: PortableRecord };
        source: ArtifactSource;
      }[] = [];
      try {
        const legacy = await legacyContents(source);
        if (legacy !== null) {
          const data = JSON.parse(legacy) as { version?: unknown; records?: AIQARecord[] };
          if (
            data.version !== 1 ||
            !Array.isArray(data.records) ||
            data.records.length > 1000 ||
            new Set(data.records.map((record) => record.id)).size !== data.records.length
          )
            throw new ArtifactError('invalid', 'Invalid legacy AI history; file retained');
          for (const record of data.records) {
            const recordID = idFor(source, record.id);
            // Formal records and tombstones supersede their retained legacy entries.
            if (artifacts.some((artifact) => artifact.recordID === recordID)) continue;
            if (
              !record.source ||
              record.source.key !== source.key ||
              record.source.itemID !== source.itemID ||
              record.source.libraryID !== source.libraryID
            )
              throw new ArtifactError(
                'identity-mismatch',
                'Legacy AI history belongs to another attachment',
              );
            migrations.push({
              recordID,
              payload: { version: 1, deleted: false, record: portable(record) },
              source: readingArtifactSource(pdf.source, record),
            });
          }
        }
      } catch (error) {
        if (!authoritative) throw error;
        // Recovery is optional once formal history exists; its failures remain visible.
        migrations.length = 0;
        issues.push({
          kind: 'legacy-unavailable',
          message: `Retained AI sidecar could not be recovered: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      for (const migration of migrations) {
        const result = await repository.publish(
          pdf.parent,
          {
            kind: 'ai-qa',
            ...migration,
            revisionID: `legacy:${Zotero.Utilities.Internal.md5(canonicalJSON([migration.recordID, migration.payload]))}`,
          },
          pdf.isCurrent,
        );
        artifacts.push(result.artifact);
        allowLegacy.set(slot(source), false);
      }
    }
    const records: AIQARecord[] = [],
      revisions = new Map<string, string>();
    for (const recordID of new Set(
      artifacts
        .filter((artifact) => artifact.source?.attachmentKey === source.key)
        .map((artifact) => artifact.recordID),
    )) {
      const heads = artifactHeads(artifacts, recordID);
      if (heads.length !== 1)
        throw new ArtifactError(
          'conflict',
          'Independent AI reading revisions exist; resolve branches explicitly',
        );
      revisions.set(recordID, heads[0].revisionID);
      const record = materialize(heads[0], source);
      if (record) records.push(record);
    }
    return { records, revisions, availability: listing.availability, issues };
  }
  return {
    async read(source) {
      try {
        const state = await load(source);
        observed.set(slot(source), state);
        setArtifactStorageIssues(source.itemID, [
          ...state.issues,
          ...(state.availability === 'local-only'
            ? [
                {
                  kind: 'local-only',
                  message:
                    'AI history is stored locally in Zotero; cross-device file sync is unverified',
                },
              ]
            : []),
        ]);
        return JSON.stringify({ version: 1, records: state.records });
      } catch (error) {
        setArtifactStorageIssues(source.itemID, artifactFailureIssues(error));
        observed.delete(slot(source));
        // Account-less, standalone, read-only and offline migration must not hide existing local work.
        if (
          allowLegacy.get(slot(source)) &&
          error instanceof ArtifactError &&
          [
            'identity-unavailable',
            'parent-required',
            'source-unavailable',
            'read-only',
            'publish-unavailable',
          ].includes(error.kind)
        ) {
          const legacy = await legacyContents(source);
          if (legacy !== null) return legacy;
        }
        throw error;
      }
    },
    async write(source, contents, current) {
      if (contents.length > MAX_BYTES)
        throw new ArtifactError('oversized', 'AI Q&A store exceeds size limit');
      if (!(await current())) return false;
      try {
        const previous = observed.get(slot(source));
        if (!previous)
          throw new ArtifactError(
            'unavailable',
            'Reload AI history from stored artifacts before saving',
          );
        const saved = await load(source);
        if (
          canonicalJSON([...saved.revisions].sort()) !==
          canonicalJSON([...previous.revisions].sort())
        )
          throw new ArtifactError('conflict', 'AI history changed; reload before saving');
        const next = JSON.parse(contents) as { version: number; records: AIQARecord[] };
        if (
          next.version !== 1 ||
          !Array.isArray(next.records) ||
          next.records.length > 1000 ||
          new Set(next.records.map((record) => record.id)).size !== next.records.length
        )
          throw new ArtifactError('invalid', 'Invalid AI history');
        const pdf = await artifactPDF(source.itemID);
        if (pdf.source.contentHash.value !== source.fingerprint.toLowerCase())
          throw new ArtifactError('source-changed', 'PDF bytes changed before saving AI history');
        const before = new Map(previous.records.map((record) => [record.id, record]));
        const after = new Map(next.records.map((record) => [record.id, record]));
        for (const id of new Set([...before.keys(), ...after.keys()])) {
          const old = before.get(id),
            record = after.get(id);
          if (old && record && canonicalJSON(portable(old)) === canonicalJSON(portable(record)))
            continue;
          const recordID = idFor(source, id),
            parentRevision = previous.revisions.get(recordID);
          // A removed ID cannot be silently reused by stale devices or legacy migration.
          if (!old && parentRevision)
            throw new ArtifactError(
              'deleted',
              'This AI record was deleted; create a new record identity',
            );
          await repository.publish(
            pdf.parent,
            {
              kind: 'ai-qa',
              recordID,
              parentRevisions: parentRevision ? [parentRevision] : [],
              source: readingArtifactSource(pdf.source, record ?? old!),
              payload: { version: 1, deleted: !record, record: record ? portable(record) : null },
            },
            async () => (await current()) && (await pdf.isCurrent()),
          );
        }
        const committed = await load(source);
        observed.set(slot(source), committed);
        setArtifactStorageIssues(source.itemID, [
          ...committed.issues,
          ...(committed.availability === 'local-only'
            ? [
                {
                  kind: 'local-only',
                  message:
                    'AI history is stored locally in Zotero; cross-device file sync is unverified',
                },
              ]
            : []),
        ]);
        return true;
      } catch (error) {
        setArtifactStorageIssues(source.itemID, artifactFailureIssues(error));
        if (error instanceof ArtifactError && error.kind === 'stale-source') return false;
        throw error;
      }
    },
  };
}
