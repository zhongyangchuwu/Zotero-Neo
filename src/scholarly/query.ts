import type { ScholarlyQuery } from './contracts';
import { normalizeArxiv, normalizeDOI } from './identifiers';

/** Read one bounded BibTeX entry, retaining nested braces instead of guessing author parts. */
function bibtexFields(input: string): { fields: Map<string, string>; citekey?: string } {
  const fields = new Map<string, string>();
  const start = /^\s*@\w+\s*[{(]\s*([^,\s]+)\s*,/u.exec(input);
  if (!start) return { fields };
  let position = start[0].length;
  while (position < input.length && fields.size < 64) {
    const field = /^\s*,?\s*([\w-]+)\s*=\s*/u.exec(input.slice(position));
    if (!field) break;
    position += field[0].length;
    let value = '';
    let more = true;
    while (more) {
      const opener = input[position];
      if (opener === '{' || opener === '"') {
        position++;
        let depth = 1;
        while (position < input.length && depth) {
          const character = input[position++]!;
          if (character === '\\' && position < input.length) {
            value += character + input[position++]!;
          } else if (opener === '{' && character === '{') {
            depth++;
            value += character;
          } else if (
            (opener === '{' && character === '}') ||
            (opener === '"' && character === '"')
          ) {
            depth--;
            if (depth) value += character;
          } else value += character;
        }
        if (depth) throw new Error('Incomplete BibTeX field');
      } else {
        const bare = /^[^,\s}()#]+/u.exec(input.slice(position));
        if (!bare) break;
        value += bare[0];
        position += bare[0].length;
      }
      while (/\s/u.test(input[position] ?? '') && position < input.length) position++;
      more = input[position] === '#';
      if (more) {
        position++;
        while (/\s/u.test(input[position] ?? '') && position < input.length) position++;
      }
    }
    const name = field[1]!.toLowerCase();
    fields.set(
      name,
      (name === 'author' ? value : value.replace(/[{}]/gu, '')).replace(/\s+/gu, ' ').trim(),
    );
  }
  return { fields, citekey: start[1] };
}

function bibtexAuthors(value: string): readonly string[] {
  const authors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length && authors.length < 19; index++) {
    if (value[index] === '\\') {
      index++;
      continue;
    }
    if (value[index] === '{') depth++;
    else if (value[index] === '}') depth--;
    else if (
      !depth &&
      value[index] === ' ' &&
      value.slice(index, index + 5).toLowerCase() === ' and '
    ) {
      authors.push(value.slice(start, index));
      index += 4;
      start = index + 1;
    }
  }
  authors.push(value.slice(start));
  return authors
    .map((name) => name.replace(/[{}]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 256))
    .filter(Boolean);
}

export function extractScholarlyQuery(query: ScholarlyQuery): ScholarlyQuery {
  if (
    (query.text.length > 4096 &&
      !(query.bibtex === undefined && /^\s*@\w+\s*[{(]/u.test(query.text))) ||
    (query.bibtex?.length ?? 0) > 32768 ||
    query.text.length > 32768 ||
    (query.title?.length ?? 0) > 2048 ||
    (query.venue?.length ?? 0) > 512 ||
    (query.doi?.length ?? 0) > 512 ||
    (query.arxivID?.length ?? 0) > 128 ||
    (query.citekey?.length ?? 0) > 256 ||
    (query.authors?.length ?? 0) > 20 ||
    query.authors?.some((name) => name.length > 256) ||
    (query.year !== undefined &&
      (!Number.isInteger(query.year) || query.year < 1 || query.year > 9999))
  )
    throw new Error('Scholarly query is too long or invalid');
  const raw = query.bibtex ?? (/^\s*@\w+\s*[{(]/u.test(query.text) ? query.text : '');
  const { fields, citekey } = bibtexFields(raw);
  if ((fields.get('doi')?.length ?? 0) > 512 || (citekey?.length ?? 0) > 256)
    throw new Error('Scholarly query is too long or invalid');
  const title = (query.title?.trim() || fields.get('title'))?.slice(0, 2048);
  const authors = query.authors?.length
    ? query.authors
    : fields.get('author')
      ? bibtexAuthors(fields.get('author')!)
      : undefined;
  const yearText = fields.get('year') ?? fields.get('date')?.slice(0, 4);
  const year = query.year ?? (yearText && /^\d{4}$/u.test(yearText) ? Number(yearText) : undefined);
  const venue = (query.venue ?? fields.get('journal') ?? fields.get('booktitle'))?.slice(0, 512);
  const doi =
    normalizeDOI(query.doi) ??
    normalizeDOI(fields.get('doi')) ??
    normalizeDOI(fields.get('url')) ??
    normalizeDOI(query.text);
  const arxivID =
    normalizeArxiv(query.arxivID) ??
    normalizeArxiv(fields.get('eprint')) ??
    normalizeArxiv(fields.get('url')) ??
    normalizeArxiv(query.text);
  const text = raw ? '' : query.text.trim();
  return {
    text,
    ...(doi ? { doi } : {}),
    ...(arxivID ? { arxivID } : {}),
    ...(title ? { title } : {}),
    ...(authors?.length ? { authors } : {}),
    ...(year ? { year } : {}),
    ...(venue ? { venue } : {}),
    ...((query.citekey ?? citekey) ? { citekey: query.citekey ?? citekey } : {}),
  };
}

export function scholarlySearchText(query: ScholarlyQuery): string {
  return [query.title || query.text, ...(query.authors ?? []), query.year, query.venue]
    .filter((value) => value !== undefined && value !== '')
    .join(' ')
    .slice(0, 4096);
}

/** Explicit versions must agree; a versionless arXiv query may identify any revision. */
export function matchesScholarlyQuery(
  query: ScholarlyQuery,
  paper: { doi: string | null; arxivID: string | null },
): boolean {
  const doiMatches = !!query.doi && paper.doi === query.doi;
  const arxivMatches =
    !!query.arxivID &&
    !!paper.arxivID &&
    (paper.arxivID === query.arxivID ||
      (!/v\d+$/u.test(query.arxivID) && paper.arxivID.replace(/v\d+$/u, '') === query.arxivID));
  if ((query.doi && paper.doi && !doiMatches) || (query.arxivID && paper.arxivID && !arxivMatches))
    return false;
  return doiMatches || arxivMatches;
}
