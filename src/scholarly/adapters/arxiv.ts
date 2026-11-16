import { parseReferenceXML } from '../../platform/reference-http';
import { ScholarlyError } from '../contracts';
import { normalizeArxiv, normalizeDOI } from '../identifiers';
import { blankPaper, text, url, type ScholarlyAdapter } from './common';

const atom = 'http://www.w3.org/2005/Atom';
const arxiv = 'http://arxiv.org/schemas/atom';
const phrase = (value: string): string => `"${value.replace(/["\\]/gu, ' ')}"`;
export const arxivAdapter: ScholarlyAdapter = {
  source: 'arxiv',
  request(query) {
    const base = 'https://export.arxiv.org/api/query?';
    if (query.arxivID)
      return { exact: true, url: `${base}id_list=${encodeURIComponent(query.arxivID)}` };
    if (query.doi)
      return {
        exact: true,
        url: `${base}search_query=${encodeURIComponent(`doi:${phrase(query.doi)}`)}&start=0&max_results=10`,
      };
    const terms = [
      query.title ? `ti:${phrase(query.title)}` : query.text ? `all:${phrase(query.text)}` : null,
      ...(query.authors ?? []).map((name) => `au:${phrase(name)}`),
      query.year ? `submittedDate:[${query.year}01010000 TO ${query.year}12312359]` : null,
      query.venue ? `jr:${phrase(query.venue)}` : null,
    ].filter((term): term is string => !!term);
    return {
      exact: false,
      url: `${base}search_query=${encodeURIComponent(terms.join(' AND '))}&start=0&max_results=10`,
    };
  },
  decode(body, _exact, retrievedAt) {
    const doc = parseReferenceXML(body);
    if (doc.getElementsByTagName('parsererror').length)
      throw new ScholarlyError('decode', 'arxiv', 'Invalid arXiv response');
    const entries = Array.from(doc.getElementsByTagNameNS(atom, 'entry'));
    if (!entries.length && !doc.getElementsByTagNameNS(atom, 'feed').length)
      throw new ScholarlyError('decode', 'arxiv', 'Invalid arXiv feed');
    return entries.slice(0, 10).map((entry) => {
      const element = (name: string): string | null =>
        text(entry.getElementsByTagNameNS(atom, name)[0]?.textContent);
      const sourceElement = (name: string): string | null =>
        text(entry.getElementsByTagNameNS(arxiv, name)[0]?.textContent);
      const id = normalizeArxiv(element('id'));
      const title = element('title');
      if (!id || !title) throw new ScholarlyError('decode', 'arxiv', 'Invalid arXiv entry');
      const published = element('published');
      const updated = element('updated');
      const links = Array.from(entry.getElementsByTagNameNS(atom, 'link'));
      return {
        ...blankPaper('arxiv', id, title, retrievedAt),
        authors: Array.from(entry.getElementsByTagNameNS(atom, 'author'))
          .slice(0, 1000)
          .map((author) => text(author.getElementsByTagNameNS(atom, 'name')[0]?.textContent))
          .filter((name): name is string => !!name),
        year: published && /^\d{4}/u.test(published) ? Number(published.slice(0, 4)) : null,
        venue: sourceElement('journal_ref'),
        abstract: element('summary'),
        doi: normalizeDOI(sourceElement('doi')),
        arxivID: id,
        url: url(element('id')),
        pdfURL: url(
          links
            .find(
              (link) =>
                link.getAttribute('title') === 'pdf' ||
                link.getAttribute('type') === 'application/pdf',
            )
            ?.getAttribute('href'),
        ),
        version: {
          ...(/v\d+$/u.test(id) ? { id: id.match(/v\d+$/u)![0] } : {}),
          ...(published ? { published } : {}),
          ...(updated ? { updated } : {}),
        },
      };
    });
  },
};
