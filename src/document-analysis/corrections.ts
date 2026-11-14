import { documentCacheSlot } from './cache';
import {
  record,
  type DocumentCacheKey,
  type DocumentRegion,
  type ParsedDocument,
} from './contracts';

export const NATIVE_CORRECTION_KEY: DocumentCacheKey = {
  backend: 'zotero-sdt',
  adapterVersion: 1,
  configuration: 'native-local-corrections',
};
export const MAX_DOCUMENT_CORRECTIONS = 1000;
export type DocumentCorrection =
  | { readonly type: 'body'; readonly regionID: string }
  | { readonly type: 'caption'; readonly regionID: string; readonly bodyID: string };
export interface DocumentCorrections {
  readonly version: 1;
  /** Exact canonical parser output, not a region-ID or timestamp approximation. Duration is not content. */
  readonly identity: string;
  readonly edits: readonly DocumentCorrection[];
}

export function documentCorrectionIdentity(parsed: ParsedDocument, key: DocumentCacheKey): string {
  return JSON.stringify([
    documentCacheSlot(key),
    parsed.schemaVersion,
    parsed.sourceFingerprint,
    parsed.backend,
    parsed.modelRevision,
    parsed.pages.map((p) => [p.pageIndex, p.viewBox, p.rotation]),
    parsed.regions.map((r) => [
      r.id,
      r.kind,
      r.pageIndex,
      r.rect,
      r.text,
      r.format,
      r.flow,
      r.anchorPrecision,
      r.sourceBlock ? [r.sourceBlock.id, r.sourceBlock.order] : null,
      r.sourceObject ? [r.sourceObject.id, r.sourceObject.kind] : null,
    ]),
  ]);
}

export function emptyDocumentCorrections(
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): DocumentCorrections {
  return { version: 1, identity: documentCorrectionIdentity(parsed, key), edits: [] };
}

function bodyMembers(parsed: ParsedDocument, body: DocumentRegion): readonly DocumentRegion[] {
  return parsed.regions.filter(
    (r) =>
      r.pageIndex === body.pageIndex &&
      r.kind !== 'caption' &&
      (r.id === body.id ||
        (body.sourceObject
          ? r.sourceObject?.id === body.sourceObject.id
          : body.sourceBlock && !r.sourceObject && r.sourceBlock?.id === body.sourceBlock.id)),
  );
}

/** Disk edits are admitted as a complete set; invalid/conflicting input is never partially applied. */
export function readDocumentCorrections(
  value: unknown,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
): DocumentCorrections | null {
  const saved = record(value);
  if (
    saved?.version !== 1 ||
    saved.identity !== documentCorrectionIdentity(parsed, key) ||
    !Array.isArray(saved.edits) ||
    saved.edits.length > MAX_DOCUMENT_CORRECTIONS
  )
    return null;
  const regions = new Map(parsed.regions.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const bodies = new Set<string>();
  const edits: DocumentCorrection[] = [];
  for (const candidate of saved.edits) {
    const edit = record(candidate);
    const region = typeof edit?.regionID === 'string' ? regions.get(edit.regionID) : undefined;
    if (!region || seen.has(region.id)) return null;
    seen.add(region.id);
    if (edit!.type === 'body') edits.push({ type: 'body', regionID: region.id });
    else if (
      edit!.type === 'caption' &&
      region.kind === 'caption' &&
      typeof edit!.bodyID === 'string'
    ) {
      const body = regions.get(edit!.bodyID);
      if (!body || !['image', 'table'].includes(body.kind) || region.pageIndex !== body.pageIndex)
        return null;
      for (const member of bodyMembers(parsed, body)) {
        if (bodies.has(member.id)) return null;
        bodies.add(member.id);
      }
      edits.push({ type: 'caption', regionID: region.id, bodyID: body.id });
    } else return null;
  }
  if (edits.some((e) => e.type === 'body' && bodies.has(e.regionID))) return null;
  return { version: 1, identity: saved.identity as string, edits };
}

/** Restore removes the explicit override; it does not infer another caption or rewrite parser data. */
export function changeDocumentCorrection(
  state: DocumentCorrections,
  parsed: ParsedDocument,
  key: DocumentCacheKey,
  regionID: string,
  edit: DocumentCorrection | null,
): DocumentCorrections {
  let edits = state.edits.filter((e) => e.regionID !== regionID);
  if (edit) {
    if (edit.regionID !== regionID) throw new Error('Correction region mismatch');
    if (edit.type === 'caption') {
      const body = parsed.regions.find((r) => r.id === edit.bodyID);
      if (!body) throw new Error('Correction body unavailable');
      const members = new Set(bodyMembers(parsed, body).map((r) => r.id));
      edits = edits.filter((e) =>
        e.type === 'caption' ? !members.has(e.bodyID) : !members.has(e.regionID),
      );
    } else {
      edits = edits.filter((e) => {
        if (e.type !== 'caption') return true;
        const body = parsed.regions.find((r) => r.id === e.bodyID);
        return !body || !bodyMembers(parsed, body).some((r) => r.id === regionID);
      });
    }
    edits.push(edit);
  }
  const next = readDocumentCorrections({ ...state, edits }, parsed, key);
  if (!next) throw new Error('Invalid document correction');
  return next;
}

/** Effective regions are the shared consumer boundary. The original parser result remains untouched. */
export function applyDocumentCorrections(
  parsed: ParsedDocument,
  state: DocumentCorrections,
): ParsedDocument {
  if (!state.edits.length) return parsed;
  const overrides = new Map<string, DocumentRegion>();
  const byID = new Map(parsed.regions.map((r) => [r.id, r]));
  // Retire old captions first so explicit swaps are independent of edit order.
  for (const edit of state.edits) {
    if (edit.type !== 'caption') continue;
    const body = byID.get(edit.bodyID)!;
    if (!body.sourceObject) continue;
    for (const old of parsed.regions) {
      if (
        old.kind === 'caption' &&
        old.id !== edit.regionID &&
        old.sourceObject?.id === body.sourceObject.id
      ) {
        overrides.set(old.id, {
          ...old,
          sourceObject: {
            id: `local-unpaired:${old.id}`,
            kind: body.kind === 'table' ? 'table' : 'figure',
          },
        });
      }
    }
  }
  for (const edit of state.edits) {
    const region = byID.get(edit.regionID)!;
    if (edit.type === 'body') {
      const { sourceObject: _object, ...rest } = region;
      overrides.set(region.id, { ...rest, kind: 'text', flow: 'body' });
    } else {
      const body = byID.get(edit.bodyID)!;
      const kind = body.kind === 'table' ? 'table' : 'figure';
      const members = bodyMembers(parsed, body);
      const sourceObject = { id: `local-caption:${region.id}`, kind } as const;
      for (const member of [...members, region])
        overrides.set(member.id, { ...member, sourceObject });
    }
  }
  return { ...parsed, regions: parsed.regions.map((r) => overrides.get(r.id) ?? r) };
}

/** Carry only semantic overrides onto genuine native ink runs; never manufacture text/character anchors. */
export function correctedNativeTextRegions(
  textRegions: readonly DocumentRegion[],
  effective: ParsedDocument,
): readonly DocumentRegion[] {
  const regions = new Map(effective.regions.map((r) => [r.id, r]));
  return textRegions.map((r) => {
    const originalID = r.id.split(':ink:')[0]!;
    const corrected = regions.get(originalID);
    return corrected ? { ...corrected, id: r.id, rect: r.rect } : r;
  });
}
