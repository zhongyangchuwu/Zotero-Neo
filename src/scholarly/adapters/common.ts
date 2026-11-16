import {
  ScholarlyError,
  type ScholarlyPaper,
  type ScholarlyQuery,
  type ScholarlySource,
} from '../contracts';

export interface ScholarlyAdapter {
  readonly source: ScholarlySource;
  request(query: ScholarlyQuery): { url: string; exact: boolean };
  decode(body: string, exact: boolean, retrievedAt: string): readonly ScholarlyPaper[];
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/gu, ' ').slice(0, 100000)
    : null;
}
export function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function url(value: unknown): string | null {
  const result = text(value);
  return result && /^https?:\/\//iu.test(result) ? result : null;
}
export function json(body: string, source: ScholarlySource): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ScholarlyError('decode', source, `Invalid ${source} response`);
  }
}
export function blankPaper(
  source: ScholarlySource,
  sourceID: string,
  title: string,
  retrievedAt: string,
): ScholarlyPaper {
  return {
    source,
    sourceID,
    title,
    authors: [],
    year: null,
    venue: null,
    abstract: null,
    doi: null,
    arxivID: null,
    url: null,
    pdfURL: null,
    referenceCount: null,
    citationCount: null,
    retrievedAt,
  };
}
