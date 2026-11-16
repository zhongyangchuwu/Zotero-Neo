import type { ScholarlyPaper, ScholarlyQuery } from '../scholarly/contracts';
import { normalizeArxiv, normalizeDOI } from '../scholarly/identifiers';
import { citationKey } from '../platform/better-bibtex';

export const METADATA_FIELDS = [
  'title',
  'creators',
  'date',
  'publicationTitle',
  'volume',
  'issue',
  'pages',
  'publisher',
  'DOI',
  'url',
  'abstractNote',
  'extra',
  'citationKey',
] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];
export type MetadataCreators = _ZoteroTypes.Item.CreatorJSON[];
export type MetadataValue = string | MetadataCreators;
export interface MetadataSnapshot {
  readonly itemID: number;
  readonly itemKey: string;
  readonly libraryID: number;
  readonly values: Readonly<Partial<Record<MetadataField, MetadataValue>>>;
  readonly query: ScholarlyQuery;
}
export interface MetadataChange {
  readonly field: MetadataField;
  readonly before: MetadataValue;
  readonly after: MetadataValue;
  readonly selected: boolean;
}
export interface MetadataPlan {
  readonly snapshot: MetadataSnapshot;
  readonly paper: ScholarlyPaper;
  readonly changes: readonly MetadataChange[];
}
export function metadataValueText(value: MetadataValue): string {
  return typeof value === 'string'
    ? value
    : value
        .map(
          (creator) =>
            creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' '),
        )
        .join('; ');
}
export function metadataValuesEqual(left: MetadataValue, right: MetadataValue): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return (
    left.length === right.length &&
    left.every((creator, index) => {
      const other = right[index];
      return (
        other &&
        creator.creatorType === other.creatorType &&
        (creator.name || '') === (other.name || '') &&
        (creator.firstName || '') === (other.firstName || '') &&
        (creator.lastName || '') === (other.lastName || '')
      );
    })
  );
}

/** Capture explicit bibliographic input; never send notes, annotations or PDF contents. */
export function snapshotMetadata(item: Zotero.Item, bibtex?: string): MetadataSnapshot {
  if (!item.isRegularItem() || item.deleted)
    throw new Error('A regular bibliographic item is required');
  const values: Partial<Record<MetadataField, MetadataValue>> = {};
  for (const field of METADATA_FIELDS) {
    if (field === 'creators') {
      values.creators = item.getCreatorsJSON().map((creator) => ({ ...creator }));
      continue;
    }
    try {
      if (
        field !== 'citationKey' &&
        Zotero.ItemFields &&
        !Zotero.ItemFields.isValidForType(Zotero.ItemFields.getID(field), item.itemTypeID)
      )
        continue;
      values[field] = String(item.getField(field) || '');
    } catch {
      // A field not supported by this native item type is not an update target.
    }
  }
  const extra = String(item.getField('extra') || '');
  const url = String(values.url || '');
  const doi =
    normalizeDOI(String(values.DOI || '')) ??
    normalizeDOI(extra.match(/(?:^|\n)\s*DOI\s*:\s*(\S+)/iu)?.[1]);
  const arxiv = normalizeArxiv(
    (extra + '\n' + url).match(
      /(?:arxiv\s*:\s*|arxiv\.org\/(?:abs|pdf)\/)([a-z0-9./-]+(?:v\d+)?)/iu,
    )?.[1],
  );
  const title = String(values.title || '')
    .trim()
    .slice(0, 2048);
  const authors = (values.creators as MetadataCreators | undefined)
    ?.filter((creator) => creator.creatorType === 'author')
    .slice(0, 20)
    .map((creator) =>
      (creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' ')).slice(
        0,
        256,
      ),
    );
  const year = String(values.date || '').match(/\b(?:18|19|20|21)\d{2}\b/u)?.[0];
  return {
    itemID: item.id,
    itemKey: item.key,
    libraryID: item.libraryID,
    values,
    query: {
      text: title,
      ...(title ? { title } : {}),
      ...(authors?.length ? { authors } : {}),
      ...(year ? { year: Number(year) } : {}),
      ...(values.publicationTitle ? { venue: String(values.publicationTitle) } : {}),
      ...(doi ? { doi } : {}),
      ...(arxiv ? { arxivID: arxiv } : {}),
      ...(bibtex?.trim() ? { bibtex: bibtex.trim() } : {}),
      ...(citationKey(item) ? { citekey: citationKey(item) } : {}),
    },
  };
}

/** Provider fields become proposals; empty/missing values never erase native fields. */
export function createMetadataPlan(
  snapshot: MetadataSnapshot,
  paper: ScholarlyPaper,
): MetadataPlan {
  const proposed: Partial<Record<MetadataField, MetadataValue>> = {
    title: paper.title,
    date: paper.bibliography?.date || (paper.year === null ? undefined : String(paper.year)),
    publicationTitle: paper.venue || undefined,
    DOI: paper.doi || undefined,
    url: paper.url || undefined,
    abstractNote: paper.abstract || undefined,
    volume: paper.bibliography?.volume,
    issue: paper.bibliography?.issue,
    pages: paper.bibliography?.pages,
    publisher: paper.bibliography?.publisher,
    citationKey: paper.citekey,
  };
  if (paper.bibliography?.creators?.length) {
    proposed.creators = paper.bibliography.creators.map((creator) => ({
      ...creator,
      creatorType: 'author',
    }));
  } else if (paper.authors.length) {
    proposed.creators = paper.authors.map((name) => ({ name, creatorType: 'author' }));
  }
  const changes: MetadataChange[] = [];
  for (const field of METADATA_FIELDS) {
    const before = snapshot.values[field];
    const after = proposed[field];
    if (
      before === undefined ||
      after === undefined ||
      !metadataValueText(after).trim() ||
      metadataValuesEqual(before, after)
    )
      continue;
    changes.push({
      field,
      before,
      after,
      selected: field !== 'citationKey' && !metadataValueText(before).trim(),
    });
  }
  return { snapshot, paper, changes };
}
