export type ArtifactKind = 'metadata-review' | 'document-corrections' | 'ai-qa';
export interface ArtifactSource {
  readonly attachmentKey: string;
  readonly contentHash: { readonly algorithm: 'md5' | 'sha256'; readonly value: string };
  readonly precision: 'document' | 'region';
  readonly parserIdentity?: string;
}
export interface NeoArtifact {
  readonly format: 'zotero-neo';
  readonly schemaVersion: 1;
  readonly kind: ArtifactKind;
  readonly libraryURI: string;
  readonly parentItemKey: string;
  readonly recordID: string;
  readonly revisionID: string;
  readonly parentRevisions: readonly string[];
  readonly createdAt: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly source?: ArtifactSource;
  readonly payload: object;
}
export interface ArtifactIssue {
  readonly kind: string;
  readonly message: string;
  readonly attachmentKey?: string;
}
export interface ArtifactListing {
  readonly artifacts: readonly NeoArtifact[];
  readonly availability: 'local-only' | 'sync-unverified';
  /** All locally known artifact files were readable; not proof that remote sync has finished. */
  readonly complete: boolean;
  readonly issues: readonly ArtifactIssue[];
}
export interface ArtifactInput {
  readonly kind: ArtifactKind;
  readonly recordID: string;
  readonly payload: object;
  readonly source?: ArtifactSource;
  readonly parentRevisions?: readonly string[];
  readonly revisionID?: string;
}
export interface NeoArtifactRepository {
  list(parent: Zotero.Item, kind?: ArtifactKind): Promise<ArtifactListing>;
  publish(
    parent: Zotero.Item,
    input: ArtifactInput,
    isCurrent?: () => boolean | Promise<boolean>,
  ): Promise<{
    artifact: NeoArtifact;
    attachmentKey: string;
    reused: boolean;
  }>;
}
export class ArtifactError extends Error {
  constructor(
    readonly kind: string,
    message: string,
    readonly issues: readonly ArtifactIssue[] = [],
  ) {
    super(message);
    this.name = 'ArtifactError';
  }
}

/** Returns every branch head. A tombstone is a head, never absence of a record. */
export function artifactHeads(artifacts: readonly NeoArtifact[], recordID: string): NeoArtifact[] {
  const records = artifacts.filter((artifact) => artifact.recordID === recordID);
  const ancestors = new Set(records.flatMap((artifact) => [...artifact.parentRevisions]));
  return records.filter((artifact) => !ancestors.has(artifact.revisionID));
}
