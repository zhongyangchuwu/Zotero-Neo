/** A source occurrence. Offsets are UTF-16 indices into the unchanged input. */
export type IdentifierMatch = {
  readonly kind: 'doi' | 'arxiv' | 'http';
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  readonly value: string;
};
