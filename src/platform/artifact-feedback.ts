import { ArtifactError, type ArtifactIssue } from '../artifacts/contracts';

const feedback = new Map<number, readonly ArtifactIssue[]>();
/** Read/save diagnostics for UI owners; local legacy recovery is not a claim of sync success. */
export function artifactStorageIssues(itemID: number): readonly ArtifactIssue[] {
  return feedback.get(itemID) ?? [];
}
export function setArtifactStorageIssues(itemID: number, issues: readonly ArtifactIssue[]): void {
  if (issues.length) feedback.set(itemID, issues);
  else feedback.delete(itemID);
}
export function artifactFailureIssues(error: unknown): readonly ArtifactIssue[] {
  if (error instanceof ArtifactError)
    return [{ kind: error.kind, message: error.message }, ...error.issues];
  return [{ kind: 'unavailable', message: error instanceof Error ? error.message : String(error) }];
}
