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

export interface DocumentRegion {
  readonly id: string;
  /** Several page rectangles may belong to one backend block; order retains gaps from unusable blocks. */
  readonly sourceBlock?: { readonly id: string; readonly order: number };
  /** Explicit provider membership; captions are optional and never determine object existence. */
  readonly sourceObject?: { readonly id: string; readonly kind: 'figure' | 'table' };
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
  /** Distinguish explicit provider membership from conservative geometric association and fallbacks. */
  readonly association: 'backend' | 'geometry' | 'caption-only' | 'ambiguous';
}

export interface DocumentLocation {
  readonly pageIndex: number;
  readonly rects: readonly DocumentRect[];
}

/** Fallback when native blocks do not include explicit flow classification. */
export function documentRegionFlow(kind: DocumentRegionKind): DocumentRegion['flow'] {
  if (kind === 'header' || kind === 'footer') return 'excluded';
  return ['caption', 'image', 'table', 'formula', 'footnote'].includes(kind) ? 'auxiliary' : 'body';
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
