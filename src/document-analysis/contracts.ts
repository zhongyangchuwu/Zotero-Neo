export type DocumentRegionKind =
  | 'text'
  | 'heading'
  | 'caption'
  | 'image'
  | 'table'
  | 'formula'
  | 'list'
  | 'code'
  | 'footnote'
  | 'references'
  | 'header'
  | 'footer'
  | 'other';
export type DocumentRect = readonly [number, number, number, number];

export interface DocumentPage {
  readonly pageIndex: number;
  /** Unrotated PDF user coordinates; never CSS pixels. */
  readonly viewBox: DocumentRect;
  readonly rotation: 0 | 90 | 180 | 270;
}

export interface DocumentSource {
  readonly fingerprint: string;
  readonly fileName: string;
  readonly pages: readonly DocumentPage[];
}

export interface DocumentRegion {
  readonly id: string;
  /** Several page rectangles may belong to one backend block; order retains gaps from unusable blocks. */
  readonly sourceBlock?: { readonly id: string; readonly order: number };
  readonly kind: DocumentRegionKind;
  readonly pageIndex: number;
  readonly rect: DocumentRect;
  readonly text: string;
  readonly format: 'text' | 'html' | 'latex' | 'markdown';
  readonly flow: 'body' | 'auxiliary' | 'excluded';
  /** A region box permits navigation, not character-accurate text annotation. */
  readonly anchorPrecision: 'region';
}

export interface DocumentObjectGroup {
  readonly id: string;
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly title: string;
  readonly captionRegionIds: readonly string[];
  readonly memberRegionIds: readonly string[];
  /** Geometry is a conservative association, not a model-provided semantic guarantee. */
  readonly association: 'geometry' | 'caption-only' | 'ambiguous';
}

export interface DocumentLocation {
  readonly pageIndex: number;
  readonly rects: readonly DocumentRect[];
}

export interface ParsedDocument {
  readonly schemaVersion: 1;
  readonly sourceFingerprint: string;
  readonly backend: string;
  readonly modelRevision: string | null;
  readonly durationMs: number;
  readonly pages: readonly DocumentPage[];
  readonly regions: readonly DocumentRegion[];
}

export interface ParseContext {
  readonly signal: AbortSignal;
}

/** Complete parsers can satisfy several stages together; protocol adapters own their HTTP details. */
export interface DocumentParser {
  readonly id: string;
  readonly capabilities: readonly ('layout' | 'text' | 'reading-order' | 'tables')[];
  parse(source: DocumentSource, context: ParseContext): Promise<ParsedDocument>;
}

/** Semantic defaults are shared across providers; explicit native flow classification remains authoritative. */
export function documentRegionFlow(kind: DocumentRegionKind): DocumentRegion['flow'] {
  if (kind === 'header' || kind === 'footer') return 'excluded';
  return ['caption', 'image', 'table', 'formula', 'footnote'].includes(kind) ? 'auxiliary' : 'body';
}

export interface NativeDocumentData {
  readonly metadata: unknown;
  readonly catalog: unknown;
  readonly blocks: readonly unknown[];
}

export function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object'
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function documentRect(value: unknown): DocumentRect | null {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every(Number.isFinite) &&
    value[2] > value[0] &&
    value[3] > value[1]
    ? (value as unknown as DocumentRect)
    : null;
}

export function checkParseCurrent(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Document analysis cancelled');
}
