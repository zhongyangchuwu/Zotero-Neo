import type { ScholarlyPaper, ScholarlyQuery } from '../scholarly/contracts';
import type { MetadataField, MetadataPlan } from './model';

export interface MetadataReviewPayload {
  readonly version: 1;
  readonly stage: 'proposal' | 'applied';
  readonly query: ScholarlyQuery;
  readonly paper: ScholarlyPaper;
  readonly snapshot: {
    readonly itemKey: string;
    readonly values: MetadataPlan['snapshot']['values'];
  };
  readonly changes: MetadataPlan['changes'];
  readonly selectedFields: readonly MetadataField[];
  readonly appliedFields: readonly MetadataField[];
}

export function metadataReviewPayload(
  plan: MetadataPlan,
  selectedFields: readonly MetadataField[],
  appliedFields: readonly MetadataField[] = [],
): MetadataReviewPayload {
  return {
    version: 1,
    stage: appliedFields.length ? 'applied' : 'proposal',
    query: plan.snapshot.query,
    paper: plan.paper,
    snapshot: { itemKey: plan.snapshot.itemKey, values: plan.snapshot.values },
    changes: plan.changes,
    selectedFields: [...selectedFields],
    appliedFields: [...appliedFields],
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown, limit = 32768): value is string {
  return typeof value === 'string' && value.length <= limit;
}

/** External files are proposals, never executable commands or trusted provider responses. */
export function readMetadataReviewPaper(value: unknown, itemKey: string): ScholarlyPaper | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    !['proposal', 'applied'].includes(String(value.stage)) ||
    !record(value.snapshot) ||
    value.snapshot.itemKey !== itemKey ||
    !record(value.paper)
  )
    return null;
  const p = value.paper;
  if (
    !['semantic-scholar', 'arxiv', 'crossref', 'inspire'].includes(String(p.source)) ||
    !string(p.sourceID, 512) ||
    !p.sourceID ||
    !string(p.title, 4096) ||
    !p.title ||
    !Array.isArray(p.authors) ||
    p.authors.length > 2000 ||
    !p.authors.every((author) => string(author, 512)) ||
    !(
      p.year === null ||
      (Number.isInteger(p.year) && Number(p.year) >= 1000 && Number(p.year) <= 9999)
    ) ||
    !string(p.retrievedAt, 64) ||
    !Number.isFinite(Date.parse(p.retrievedAt))
  )
    return null;
  for (const key of ['venue', 'abstract', 'doi', 'arxivID', 'url', 'pdfURL']) {
    if (p[key] !== null && !string(p[key])) return null;
  }
  for (const key of ['url', 'pdfURL']) {
    if (typeof p[key] === 'string' && !/^https?:\/\/[^\s\u0000-\u001f]+$/iu.test(p[key]))
      return null;
  }
  for (const key of ['referenceCount', 'citationCount']) {
    if (p[key] !== null && !(Number.isInteger(p[key]) && Number(p[key]) >= 0)) return null;
  }
  const paper: ScholarlyPaper = {
    source: p.source as ScholarlyPaper['source'],
    sourceID: p.sourceID,
    title: p.title,
    authors: [...p.authors] as string[],
    year: p.year as number | null,
    venue: p.venue as string | null,
    abstract: p.abstract as string | null,
    doi: p.doi as string | null,
    arxivID: p.arxivID as string | null,
    url: p.url as string | null,
    pdfURL: p.pdfURL as string | null,
    referenceCount: p.referenceCount as number | null,
    citationCount: p.citationCount as number | null,
    retrievedAt: p.retrievedAt,
  };
  if (p.citekey !== undefined) {
    if (!string(p.citekey, 512) || /[\r\n\u0000]/u.test(p.citekey)) return null;
    Object.assign(paper, { citekey: p.citekey });
  }
  if (p.bibliography !== undefined) {
    if (!record(p.bibliography)) return null;
    const bibliography: Record<string, unknown> = {};
    for (const key of ['date', 'volume', 'issue', 'pages', 'publisher']) {
      const field = p.bibliography[key];
      if (field !== undefined) {
        if (!string(field, 4096)) return null;
        bibliography[key] = field;
      }
    }
    if (p.bibliography.creators !== undefined) {
      if (
        !Array.isArray(p.bibliography.creators) ||
        p.bibliography.creators.length > 2000 ||
        !p.bibliography.creators.every(
          (creator) =>
            record(creator) && string(creator.firstName, 512) && string(creator.lastName, 512),
        )
      )
        return null;
      bibliography.creators = p.bibliography.creators.map((creator) => ({
        firstName: creator.firstName,
        lastName: creator.lastName,
      }));
    }
    Object.assign(paper, { bibliography });
  }
  if (p.version !== undefined) {
    if (!record(p.version)) return null;
    const version: Record<string, string> = {};
    for (const key of ['id', 'updated', 'published']) {
      if (p.version[key] !== undefined) {
        if (!string(p.version[key], 512)) return null;
        version[key] = p.version[key];
      }
    }
    Object.assign(paper, { version });
  }
  return paper;
}
