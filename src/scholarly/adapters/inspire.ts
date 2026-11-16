import { ScholarlyError } from '../contracts';
import { normalizeArxiv, normalizeDOI } from '../identifiers';
import { scholarlySearchText } from '../query';
import { blankPaper, count, json, object, text, url, type ScholarlyAdapter } from './common';

export const inspireAdapter: ScholarlyAdapter = {
  source: 'inspire',
  request(query) {
    if (query.doi)
      return {
        exact: true,
        url: `https://inspirehep.net/api/doi/${encodeURIComponent(query.doi)}`,
      };
    if (query.arxivID)
      return {
        exact: true,
        url: `https://inspirehep.net/api/arxiv/${encodeURIComponent(query.arxivID.replace(/v\d+$/u, ''))}`,
      };
    return {
      exact: false,
      url: `https://inspirehep.net/api/literature?q=${encodeURIComponent(scholarlySearchText(query))}&size=10`,
    };
  },
  decode(body, exact, retrievedAt) {
    const parsed = json(body, 'inspire');
    const records = exact ? [parsed] : object(parsed.hits).hits;
    if (!Array.isArray(records))
      throw new ScholarlyError('decode', 'inspire', 'Invalid INSPIRE response');
    return records.slice(0, 10).map((record) => {
      const data = object(object(record).metadata);
      const id =
        typeof data.control_number === 'number'
          ? String(data.control_number)
          : text(data.control_number);
      const titles = Array.isArray(data.titles) ? data.titles : [];
      const title = text(object(titles[0]).title);
      if (!id || !title) throw new ScholarlyError('decode', 'inspire', 'Invalid INSPIRE record');
      const first = (value: unknown): Record<string, unknown> =>
        object(Array.isArray(value) ? value[0] : null);
      const publication = first(data.publication_info);
      const doi = normalizeDOI(text(first(data.dois).value));
      const arxivID = normalizeArxiv(text(first(data.arxiv_eprints).value));
      const authors = Array.isArray(data.authors) ? data.authors.slice(0, 1000) : [];
      const date =
        text(first(data.imprints).date) ??
        (count(publication.year) !== null ? String(publication.year) : text(data.preprint_date));
      const citekey = Array.isArray(data.texkeys) ? text(data.texkeys[0]) : null;
      const pages =
        text(publication.page_start) && text(publication.page_end)
          ? `${text(publication.page_start)}-${text(publication.page_end)}`
          : (text(publication.page_start) ?? text(publication.artid));
      return {
        ...blankPaper('inspire', id, title, retrievedAt),
        doi,
        arxivID,
        authors: authors
          .map((author) => text(object(author).full_name))
          .filter((name): name is string => !!name),
        year:
          count(publication.year) ??
          (date && /^\d{4}/u.test(date) ? Number(date.slice(0, 4)) : null),
        venue: text(publication.journal_title),
        abstract: text(first(data.abstracts).value),
        url: `https://inspirehep.net/literature/${encodeURIComponent(id)}`,
        pdfURL: url(first(data.documents).url),
        citationCount: count(data.citation_count),
        referenceCount: Array.isArray(data.references) ? data.references.length : null,
        ...(citekey ? { citekey } : {}),
        bibliography: {
          ...(date ? { date } : {}),
          ...(text(publication.journal_volume)
            ? { volume: text(publication.journal_volume)! }
            : {}),
          ...(text(publication.journal_issue) ? { issue: text(publication.journal_issue)! } : {}),
          ...(pages ? { pages } : {}),
          ...(text(first(data.imprints).publisher)
            ? { publisher: text(first(data.imprints).publisher)! }
            : {}),
        },
      };
    });
  },
};
