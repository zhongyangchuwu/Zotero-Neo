import { documentCacheSlot, readDocumentCacheRecord } from './cache';
import {
  record,
  documentRect,
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

/** The legacy identity contains the complete replay baseline, not just a hash or region IDs. */
export function recoverDocumentCorrections(value: unknown): {
  parsed: ParsedDocument;
  key: DocumentCacheKey;
  corrections: DocumentCorrections;
} | null {
  const saved = record(value);
  if (typeof saved?.identity !== 'string') return null;
  try {
    const identity: unknown = JSON.parse(saved.identity);
    if (!Array.isArray(identity) || identity.length !== 7 || typeof identity[0] !== 'string')
      return null;
    const slot: unknown = JSON.parse(identity[0]);
    if (
      !Array.isArray(slot) ||
      slot.length !== 3 ||
      typeof slot[0] !== 'string' ||
      !Number.isSafeInteger(slot[1]) ||
      typeof slot[2] !== 'string' ||
      !Array.isArray(identity[5]) ||
      !Array.isArray(identity[6])
    )
      return null;
    const key: DocumentCacheKey = {
      backend: slot[0],
      adapterVersion: slot[1] as number,
      configuration: slot[2],
    };
    const pages = [];
    for (const [index, raw] of identity[5].entries()) {
      if (
        !Array.isArray(raw) ||
        raw.length !== 3 ||
        raw[0] !== index ||
        ![0, 90, 180, 270].includes(raw[2])
      )
        return null;
      const viewBox = documentRect(raw[1]);
      if (!viewBox) return null;
      pages.push({ pageIndex: index, viewBox, rotation: raw[2] as 0 | 90 | 180 | 270 });
    }
    const regions = [];
    for (const raw of identity[6]) {
      if (
        !Array.isArray(raw) ||
        raw.length !== 10 ||
        !(raw[8] === null || Array.isArray(raw[8])) ||
        !(raw[9] === null || Array.isArray(raw[9]))
      )
        return null;
      regions.push({
        id: raw[0],
        kind: raw[1],
        pageIndex: raw[2],
        rect: raw[3],
        text: raw[4],
        format: raw[5],
        flow: raw[6],
        anchorPrecision: raw[7],
        ...(raw[8] ? { sourceBlock: { id: raw[8][0], order: raw[8][1] } } : {}),
        ...(raw[9] ? { sourceObject: { id: raw[9][0], kind: raw[9][1] } } : {}),
      });
    }
    if (typeof identity[2] !== 'string') return null;
    const parsed = readDocumentCacheRecord(
      {
        cacheVersion: 1,
        savedAt: 0,
        key,
        parsed: {
          schemaVersion: identity[1],
          sourceFingerprint: identity[2],
          backend: identity[3],
          modelRevision: identity[4],
          durationMs: 0,
          pages,
          regions,
        },
      },
      { fingerprint: identity[2], fileName: '', pages },
      key,
    )?.parsed;
    if (!parsed) return null;
    const corrections = readDocumentCorrections(value, parsed, key);
    return corrections ? { parsed, key, corrections } : null;
  } catch {
    return null;
  }
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
