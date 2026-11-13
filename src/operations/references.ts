import type {
  ReferenceAdditionReceipt,
  ReferenceLocalMatch,
  ReferenceQuery,
  ScholarlyPaper,
} from '../references/contracts';
import { normalizeArxiv, normalizeDOI } from '../references/identifiers';

function writableLibrary(libraryID: number): void {
  const library = Zotero.Libraries.get(libraryID);
  if (!library || !library.editable || library.archived || library.libraryType === 'feed')
    throw new Error('Reference library is read-only or unavailable');
}

function itemIdentifiers(item: Zotero.Item): { doi: string | null; arxiv: string | null } {
  const extra = String(item.getField('extra') || '');
  const extraDOI = extra.match(/(?:^|\n)\s*doi\s*:\s*(\S+)/iu);
  const doi = normalizeDOI(String(item.getField('DOI') || '')) ?? normalizeDOI(extraDOI?.[1]);
  const arxiv = extra.match(/(?:arxiv\s*:\s*|arxiv\.org\/(?:abs|pdf)\/)([a-z0-9.\/-]+(?:v\d+)?)/iu);
  return { doi, arxiv: normalizeArxiv(arxiv?.[1]) };
}

function match(item: Zotero.Item): ReferenceLocalMatch {
  const attachmentID =
    item.getAttachments().find((id) => {
      const attachment = Zotero.Items.get(id);
      return !!attachment && !attachment.deleted && attachment.isPDFAttachment();
    }) ?? null;
  return { itemID: item.id, attachmentID, title: String(item.getField('title') || '') };
}

async function searchItems(query: ReferenceQuery, libraryID: number): Promise<Zotero.Item[]> {
  if (!Number.isInteger(libraryID) || !Zotero.Libraries.get(libraryID)) return [];
  const terms: Array<[string, string]> = [];
  const doi = normalizeDOI(query.doi);
  const arxiv = normalizeArxiv(query.arxivID);
  if (doi) terms.push(['DOI', doi], ['extra', doi]);
  if (arxiv) terms.push(['extra', arxiv]);
  if (query.text.trim()) terms.push(['title', query.text.trim()]);
  const found = new Map<number, Zotero.Item>();
  for (const [field, value] of terms) {
    const search = new Zotero.Search();
    search.addCondition('libraryID', 'is', libraryID);
    search.addCondition('deleted', 'false');
    search.addCondition('noChildren', 'true');
    search.addCondition(field, 'contains', value);
    const items = Zotero.Items.get(await search.search());
    for (const item of items) {
      if (item && !item.deleted && item.libraryID === libraryID && item.isRegularItem())
        found.set(item.id, item);
    }
  }
  return [...found.values()];
}

export async function findReferenceItems(
  query: ReferenceQuery,
  libraryID: number,
): Promise<readonly ReferenceLocalMatch[]> {
  return (await searchItems(query, libraryID)).map(match);
}

const additions = new Map<number, Promise<unknown>>();
export async function addReferencePaper(
  paper: ScholarlyPaper,
  libraryID: number,
  isCurrent: () => boolean | Promise<boolean>,
): Promise<ReferenceAdditionReceipt> {
  const previous = additions.get(libraryID) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      if (!(await isCurrent())) throw new Error('Reference destination changed');
      writableLibrary(libraryID);
      const doi = normalizeDOI(paper.doi);
      const arxiv = normalizeArxiv(paper.arxivID);
      const items = await searchItems(
        { text: paper.title, doi: doi ?? undefined, arxivID: arxiv ?? undefined },
        libraryID,
      );
      if (!(await isCurrent())) throw new Error('Reference destination changed');
      writableLibrary(libraryID);
      const exact = items.filter((item) => {
        const ids = itemIdentifiers(item);
        return !!((doi && ids.doi === doi) || (arxiv && ids.arxiv === arxiv));
      });
      if (exact.length > 1) throw new Error('Multiple existing items match this reference');
      if (exact.length === 1) {
        const ids = itemIdentifiers(exact[0]);
        if ((doi && ids.doi && doi !== ids.doi) || (arxiv && ids.arxiv && arxiv !== ids.arxiv))
          throw new Error('Existing item identifiers conflict with this reference');
        return { ...match(exact[0]), reused: true };
      }
      const title = paper.title.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
      if (
        items.some(
          (item) =>
            String(item.getField('title') || '')
              .trim()
              .toLocaleLowerCase()
              .replace(/\s+/gu, ' ') === title,
        )
      )
        throw new Error('An existing item has the same title; choose it explicitly');
      if (!title) throw new Error('Reference title is required');
      const item = new Zotero.Item('journalArticle');
      item.libraryID = libraryID;
      item.setField('title', paper.title);
      if (paper.year !== null) item.setField('date', String(paper.year));
      if (paper.venue) item.setField('publicationTitle', paper.venue);
      if (paper.abstract) item.setField('abstractNote', paper.abstract);
      if (doi) item.setField('DOI', doi);
      if (paper.url) item.setField('url', paper.url);
      const extra = [arxiv ? `arXiv: ${arxiv}` : '', paper.pdfURL ? `PDF: ${paper.pdfURL}` : '']
        .filter(Boolean)
        .join('\n');
      if (extra) item.setField('extra', extra);
      item.setCreators(
        paper.authors.map((name) => ({ creatorType: 'author', lastName: name, fieldMode: 1 })),
      );
      if (!(await isCurrent())) throw new Error('Reference destination changed');
      writableLibrary(libraryID);
      await item.saveTx();
      return { ...match(item), reused: false };
    });
  additions.set(libraryID, task);
  try {
    return await task;
  } finally {
    if (additions.get(libraryID) === task) additions.delete(libraryID);
  }
}
