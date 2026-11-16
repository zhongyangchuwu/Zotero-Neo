import { ScholarlyError } from '../contracts';
import { normalizeArxiv, normalizeDOI } from '../identifiers';
import { scholarlySearchText } from '../query';
import { blankPaper, count, json, object, text, url, type ScholarlyAdapter } from './common';

const endpoint = 'https://api.semanticscholar.org/graph/v1/paper/';
const fields =
  'title,authors,year,venue,abstract,url,externalIds,openAccessPdf,referenceCount,citationCount';
export const semanticScholarAdapter: ScholarlyAdapter = {
  source: 'semantic-scholar',
  request(query) {
    const id = query.doi ? `DOI:${query.doi}` : query.arxivID ? `ARXIV:${query.arxivID}` : null;
    return {
      exact: !!id,
      url: id
        ? `${endpoint}${encodeURIComponent(id)}?fields=${fields}`
        : `${endpoint}search?query=${encodeURIComponent(scholarlySearchText(query))}&limit=10&fields=${fields}`,
    };
  },
  decode(body, exact, retrievedAt) {
    const parsed = json(body, 'semantic-scholar');
    const records = exact ? [parsed] : parsed.data;
    if (!Array.isArray(records))
      throw new ScholarlyError('decode', 'semantic-scholar', 'Invalid Semantic Scholar response');
    return records.slice(0, 10).map((record) => {
      const data = object(record);
      const id = text(data.paperId);
      const title = text(data.title);
      if (!id || !title)
        throw new ScholarlyError('decode', 'semantic-scholar', 'Invalid Semantic Scholar paper');
      const ids = object(data.externalIds);
      return {
        ...blankPaper('semantic-scholar', id, title, retrievedAt),
        authors: Array.isArray(data.authors)
          ? data.authors
              .slice(0, 1000)
              .map((author) => text(object(author).name))
              .filter((name): name is string => !!name)
          : [],
        year: count(data.year),
        venue: text(data.venue),
        abstract: text(data.abstract),
        doi: normalizeDOI(text(ids.DOI)),
        arxivID: normalizeArxiv(text(ids.ArXiv)),
        url: url(data.url),
        pdfURL: url(object(data.openAccessPdf).url),
        referenceCount: count(data.referenceCount),
        citationCount: count(data.citationCount),
      };
    });
  },
};
