import { ScholarlyError } from '../contracts';
import { normalizeDOI } from '../identifiers';
import { scholarlySearchText } from '../query';
import { blankPaper, count, json, object, text, url, type ScholarlyAdapter } from './common';

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Crossref abstracts contain JATS, not HTML to execute or raw markup to put in abstractNote. */
function abstractText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return (
    raw
      .replace(/<\/(?:[\w-]+:)?(?:p|title|sec|div)\s*>/giu, '\n')
      .replace(/<\/?[a-z][^>]*>/giu, '')
      .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (entity, code: string) => {
        if (code.startsWith('#')) {
          const point =
            code[1]?.toLowerCase() === 'x'
              ? Number.parseInt(code.slice(2), 16)
              : Number.parseInt(code.slice(1), 10);
          return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
            ? String.fromCodePoint(point)
            : entity;
        }
        return XML_ENTITIES[code.toLowerCase()] ?? entity;
      })
      .trim() || null
  );
}

export const crossrefAdapter: ScholarlyAdapter = {
  source: 'crossref',
  request(query) {
    if (query.doi)
      return {
        exact: true,
        url: `https://api.crossref.org/works/${encodeURIComponent(query.doi)}`,
      };
    return {
      exact: false,
      url: `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(scholarlySearchText(query) || query.arxivID || '')}&rows=10`,
    };
  },
  decode(body, exact, retrievedAt) {
    const parsed = json(body, 'crossref');
    const message = object(parsed.message);
    const records = exact ? [message] : message.items;
    if (!Array.isArray(records) || parsed.status !== 'ok')
      throw new ScholarlyError('decode', 'crossref', 'Invalid Crossref response');
    return records.slice(0, 10).map((record) => {
      const data = object(record);
      const doi = normalizeDOI(text(data.DOI));
      const title = Array.isArray(data.title) ? text(data.title[0]) : null;
      if (!doi || !title) throw new ScholarlyError('decode', 'crossref', 'Invalid Crossref work');
      const authors = Array.isArray(data.author) ? data.author.slice(0, 1000).map(object) : [];
      const creators = authors
        .filter((author) => text(author.family))
        .map((author) => ({ firstName: text(author.given) ?? '', lastName: text(author.family)! }));
      const dateParts = object(data.published)['date-parts'] ?? object(data.issued)['date-parts'];
      const date =
        Array.isArray(dateParts) && Array.isArray(dateParts[0]) ? dateParts[0].slice(0, 3) : [];
      const validDate = date.length > 0 && date.every((part) => Number.isInteger(part) && part > 0);
      const bibliography = {
        ...(validDate
          ? {
              date: date
                .map((part, index) => (index ? String(part).padStart(2, '0') : String(part)))
                .join('-'),
            }
          : {}),
        ...(text(data.volume) ? { volume: text(data.volume)! } : {}),
        ...(text(data.issue) ? { issue: text(data.issue)! } : {}),
        ...(text(data.page) ? { pages: text(data.page)! } : {}),
        ...(text(data.publisher) ? { publisher: text(data.publisher)! } : {}),
        ...(creators.length ? { creators } : {}),
      };
      const links = Array.isArray(data.link) ? data.link.map(object) : [];
      return {
        ...blankPaper('crossref', doi, title, retrievedAt),
        doi,
        authors: authors
          .map(
            (author) =>
              text(author.name) ??
              text([text(author.given), text(author.family)].filter(Boolean).join(' ')),
          )
          .filter((name): name is string => !!name),
        year: validDate ? count(date[0]) : null,
        venue: Array.isArray(data['container-title']) ? text(data['container-title'][0]) : null,
        abstract: abstractText(data.abstract),
        url: url(data.URL),
        pdfURL: url(links.find((link) => link['content-type'] === 'application/pdf')?.URL),
        referenceCount: count(data['reference-count']),
        citationCount: count(data['is-referenced-by-count']),
        bibliography,
      };
    });
  },
};
