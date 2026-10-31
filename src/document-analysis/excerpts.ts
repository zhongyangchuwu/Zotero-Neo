import type { DocumentLocation, DocumentObjectGroup, DocumentRegion } from './contracts';
import { documentObjectGroups } from './object-groups';
import { documentVisualBodies } from './visual-bodies';

export interface DocumentExcerpt {
  readonly id: string;
  readonly kind: 'figure' | 'table' | 'formula';
  readonly part: 'object' | 'body';
  readonly association?: DocumentObjectGroup['association'];
  readonly label?: string;
  readonly title: string;
  readonly caption: string;
  readonly regionIds: readonly string[];
  readonly locations: readonly DocumentLocation[];
  readonly structures: readonly {
    readonly format: DocumentRegion['format'];
    readonly text: string;
  }[];
}

function excerpt(
  id: string,
  kind: DocumentExcerpt['kind'],
  part: DocumentExcerpt['part'],
  title: string,
  members: readonly DocumentRegion[],
): DocumentExcerpt {
  const pages = new Map<number, Map<string, DocumentRegion['rect']>>();
  for (const region of members) {
    const rects = pages.get(region.pageIndex) ?? new Map();
    rects.set(region.rect.join(','), region.rect);
    pages.set(region.pageIndex, rects);
  }
  return {
    id,
    kind,
    part,
    title,
    regionIds: members.map((r) => r.id),
    caption: [
      ...new Set(
        members
          .filter((r) => r.kind === 'caption' || r.kind === 'footnote')
          .map((r) => r.text.trim())
          .filter(Boolean),
      ),
    ].join('\n'),
    locations: [...pages]
      .sort(([a], [b]) => a - b)
      .map(([pageIndex, rects]) => ({ pageIndex, rects: [...rects.values()] })),
    structures: members
      .filter(
        (r) =>
          ((kind === 'formula' && r.kind === 'formula') || r.kind === 'table') && r.text.trim(),
      )
      .map((r) => ({ format: r.format, text: r.text })),
  };
}

/** Excerpts retain every known member and source page. Independent bodies remain an explicit correction fallback. */
export function documentExcerpts(regions: readonly DocumentRegion[]): readonly DocumentExcerpt[] {
  const result: DocumentExcerpt[] = [];
  for (const group of documentObjectGroups(regions)) {
    const ids = new Set(group.memberRegionIds),
      members = regions.filter((r) => ids.has(r.id));
    if (members.length)
      result.push({
        ...excerpt(group.id, group.kind, 'object', group.title, members),
        association: group.association,
        label: group.label,
      });
  }
  for (const body of documentVisualBodies(regions)) {
    const members = regions.filter(
      (r) =>
        r.pageIndex === body.location.pageIndex &&
        (r.kind === 'image' || r.kind === 'table') &&
        body.location.rects.some((rect) => rect.join(',') === r.rect.join(',')),
    );
    if (members.length) result.push(excerpt(body.id, body.kind, 'body', '', members));
  }
  for (const region of regions)
    if (region.kind === 'formula' && !region.sourceObject)
      result.push(excerpt(`formula:${region.id}`, 'formula', 'object', region.text, [region]));
  return result;
}

export function excerptBounds(
  location: DocumentLocation,
): readonly [number, number, number, number] {
  return [
    Math.min(...location.rects.map((r) => r[0])),
    Math.min(...location.rects.map((r) => r[1])),
    Math.max(...location.rects.map((r) => r[2])),
    Math.max(...location.rects.map((r) => r[3])),
  ];
}
