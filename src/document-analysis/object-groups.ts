import { documentCaptionIdentity } from './caption-identity';
import type {
  DocumentLocation,
  DocumentObjectGroup,
  DocumentRect,
  DocumentRegion,
} from './contracts';

const EPSILON = 0.01;
const CAPTION_GAP = 72;
const PANEL_GAP = 24;

interface RegionBlock {
  readonly regions: readonly DocumentRegion[];
  readonly rect: DocumentRect;
  readonly pageIndex: number;
}

function bounds(rects: readonly DocumentRect[]): DocumentRect {
  return [
    Math.min(...rects.map((rect) => rect[0])),
    Math.min(...rects.map((rect) => rect[1])),
    Math.max(...rects.map((rect) => rect[2])),
    Math.max(...rects.map((rect) => rect[3])),
  ];
}

function contains(outer: DocumentRect, inner: DocumentRect): boolean {
  return (
    outer[0] <= inner[0] + EPSILON &&
    outer[1] <= inner[1] + EPSILON &&
    inner[2] <= outer[2] + EPSILON &&
    inner[3] <= outer[3] + EPSILON
  );
}

function sameColumn(left: DocumentRect, right: DocumentRect): boolean {
  const overlap = Math.min(left[2], right[2]) - Math.max(left[0], right[0]);
  // Detectors disagree by several points on table borders and caption width.
  // Compare overlap, while preserving the original geometry of every member.
  return overlap + EPSILON >= 0.9 * Math.min(left[2] - left[0], right[2] - right[0]);
}

function intersects(left: DocumentRect, right: DocumentRect): boolean {
  return (
    Math.min(left[2], right[2]) - Math.max(left[0], right[0]) > EPSILON &&
    Math.min(left[3], right[3]) - Math.max(left[1], right[1]) > EPSILON
  );
}

function adjacent(left: DocumentRect, right: DocumentRect): boolean {
  const xOverlap = Math.min(left[2], right[2]) - Math.max(left[0], right[0]);
  const yOverlap = Math.min(left[3], right[3]) - Math.max(left[1], right[1]);
  const xGap = Math.max(left[0], right[0]) - Math.min(left[2], right[2]);
  const yGap = Math.max(left[1], right[1]) - Math.min(left[3], right[3]);
  return (
    (xGap <= CAPTION_GAP && yOverlap >= Math.min(left[3] - left[1], right[3] - right[1]) / 2) ||
    (yGap <= PANEL_GAP && xOverlap > EPSILON && sameColumn(left, right))
  );
}

/** Backend block identity keeps multi-rectangle regions indivisible, including cross-page ambiguity. */
function blocks(regions: readonly DocumentRegion[]): readonly RegionBlock[] {
  const grouped = new Map<string, DocumentRegion[]>();
  for (const region of regions) {
    const key = region.sourceBlock?.id ?? region.id;
    const parts = grouped.get(key) ?? [];
    parts.push(region);
    grouped.set(key, parts);
  }
  return [...grouped.values()].map((parts) => ({
    regions: parts,
    pageIndex: parts.every((part) => part.pageIndex === parts[0]!.pageIndex)
      ? parts[0]!.pageIndex
      : -1,
    rect: bounds(parts.map((part) => part.rect)),
  }));
}

function components(candidates: readonly RegionBlock[]): readonly RegionBlock[][] {
  const remaining = new Set(candidates);
  const result: RegionBlock[][] = [];
  for (const seed of candidates) {
    if (!remaining.delete(seed)) continue;
    const component = [seed];
    for (let at = 0; at < component.length; at++) {
      for (const block of remaining) {
        if (adjacent(component[at]!.rect, block.rect)) {
          remaining.delete(block);
          component.push(block);
        }
      }
    }
    result.push(component);
  }
  return result;
}

/** Reject body text, other captions and unknown native blocks between a caption and candidate panels. */
function unobstructed(
  regions: readonly DocumentRegion[],
  captions: readonly DocumentRegion[],
  panels: readonly DocumentRegion[],
): boolean {
  const members = new Set([...captions, ...panels]);
  const envelope = bounds([...members].map((region) => region.rect));
  const captionBounds = bounds(captions.map((region) => region.rect));
  for (const region of regions) {
    if (members.has(region) || region.pageIndex !== captions[0]!.pageIndex) continue;
    if (!intersects(envelope, region.rect)) continue;
    // Side-by-side captions can both claim one wide image. Keep those claims
    // until conflict resolution, rather than silently picking either column.
    if (
      region.kind === 'caption' &&
      !intersects(captionBounds, region.rect) &&
      Math.min(captionBounds[3], region.rect[3]) - Math.max(captionBounds[1], region.rect[1]) >
        EPSILON
    )
      continue;
    if (
      region.flow !== 'body' &&
      region.kind !== 'caption' &&
      panels.some((panel) => contains(panel.rect, region.rect))
    )
      continue;
    return false;
  }
  const orders = [...members].flatMap((region) =>
    region.sourceBlock ? [region.sourceBlock.order] : [],
  );
  if (orders.length) {
    const known = new Set(
      regions.flatMap((region) => (region.sourceBlock ? [region.sourceBlock.order] : [])),
    );
    for (let order = Math.min(...orders); order <= Math.max(...orders); order++)
      if (!known.has(order)) return false;
  }
  return true;
}

/**
 * Preserve explicit provider objects even without captions; other regions use
 * conservative same-page caption association. Never extend explicit objects by proximity.
 */
export function documentObjectGroups(
  regions: readonly DocumentRegion[],
): readonly DocumentObjectGroup[] {
  const explicit = new Map<string, DocumentRegion[]>();
  for (const region of regions) {
    if (!region.sourceObject) continue;
    const members = explicit.get(region.sourceObject.id) ?? [];
    members.push(region);
    explicit.set(region.sourceObject.id, members);
  }
  const groups: DocumentObjectGroup[] = [];
  for (const [id, members] of explicit) {
    const kind = members[0]!.sourceObject!.kind;
    if (members.some((r) => r.sourceObject!.kind !== kind || r.pageIndex !== members[0]!.pageIndex))
      throw new Error('Incompatible explicit document object membership');
    const captions = members.filter((r) => r.kind === 'caption');
    const identity = members
      .map((r) => documentCaptionIdentity(r.text))
      .find((v) => v?.kind === kind);
    groups.push({
      id: `object:${id}`,
      kind,
      label: identity?.label ?? '',
      title:
        captions.map((r) => r.text).join('\n') ||
        members.find((r) => documentCaptionIdentity(r.text)?.kind === kind)?.text ||
        '',
      captionRegionIds: captions.map((r) => r.id),
      memberRegionIds: members.map((r) => r.id),
      association: 'backend',
    });
  }
  return [...groups, ...geometricObjectGroups(regions.filter((r) => !r.sourceObject))];
}

function geometricObjectGroups(regions: readonly DocumentRegion[]): readonly DocumentObjectGroup[] {
  const captions = new Map<string, DocumentRegion[]>();
  const identities = new Map<string, NonNullable<ReturnType<typeof documentCaptionIdentity>>>();
  const regionBlocks = blocks(regions);
  for (const block of regionBlocks) {
    const first = block.regions[0]!;
    const identity = first.kind === 'caption' ? documentCaptionIdentity(first.text) : null;
    if (!identity) continue;
    const page = Math.min(...block.regions.map((part) => part.pageIndex));
    const prefix = `${identity.kind}:${identity.label}:${page}:`;
    const existing = [...captions].find(([key, parts]) => {
      if (
        !key.startsWith(prefix) ||
        block.pageIndex < 0 ||
        parts.some((part) => part.pageIndex !== page)
      )
        return false;
      const rect = bounds(parts.map((part) => part.rect));
      const verticalGap = Math.max(rect[1], block.rect[1]) - Math.min(rect[3], block.rect[3]);
      return sameColumn(rect, block.rect) && verticalGap <= PANEL_GAP;
    });
    const key = existing?.[0] ?? `${prefix}${first.id}`;
    const parts = captions.get(key) ?? [];
    parts.push(...block.regions);
    captions.set(key, parts);
    identities.set(key, identity);
  }
  const groups: DocumentObjectGroup[] = [];
  for (const [key, parts] of captions) {
    const identity = identities.get(key)!;
    const page = parts[0]!.pageIndex;
    const captionBounds = bounds(parts.map((part) => part.rect));
    const candidates = regionBlocks.filter(
      (block) =>
        block.pageIndex === page &&
        block.regions.every(
          (region) =>
            region.kind === 'image' || (identity.kind === 'table' && region.kind === 'table'),
        ) &&
        Math.min(block.rect[2], captionBounds[2]) - Math.max(block.rect[0], captionBounds[0]) >
          EPSILON,
    );
    const matches = parts.every((part) => part.pageIndex === page)
      ? components(candidates).filter((component) => {
          const rect = bounds(component.map((block) => block.rect));
          const gap =
            rect[1] >= captionBounds[3] - EPSILON
              ? rect[1] - captionBounds[3]
              : identity.kind === 'table' && captionBounds[1] >= rect[3] - EPSILON
                ? captionBounds[1] - rect[3]
                : Infinity;
          return (
            gap <= CAPTION_GAP &&
            sameColumn(rect, captionBounds) &&
            unobstructed(
              regions,
              parts,
              component.flatMap((block) => block.regions),
            )
          );
        })
      : [];
    const panels = matches.length === 1 ? matches[0]!.flatMap((block) => block.regions) : [];
    const labels = regions.filter(
      (region) =>
        region.pageIndex === page &&
        region.flow !== 'body' &&
        region.kind !== 'caption' &&
        panels.some((panel) => contains(panel.rect, region.rect)),
    );
    const members = new Set([...parts, ...panels, ...labels]);
    groups.push({
      id: `object:${parts[0]!.id}`,
      ...identity,
      title: parts[0]!.text.trim(),
      captionRegionIds: parts.map((part) => part.id),
      memberRegionIds: regions.filter((region) => members.has(region)).map((region) => region.id),
      association:
        matches.length === 1 ? 'geometry' : matches.length > 1 ? 'ambiguous' : 'caption-only',
    });
  }
  const claims = new Map<string, number>();
  for (const group of groups) {
    for (const id of group.memberRegionIds) {
      if (!group.captionRegionIds.includes(id)) claims.set(id, (claims.get(id) ?? 0) + 1);
    }
  }
  return groups.map((group) =>
    group.memberRegionIds.some((id) => (claims.get(id) ?? 0) > 1)
      ? { ...group, memberRegionIds: group.captionRegionIds, association: 'ambiguous' }
      : group,
  );
}

/** Native navigation is single-page; retain every genuine member rectangle on the chosen page. */
export function documentObjectLocation(
  regions: readonly DocumentRegion[],
  group: DocumentObjectGroup,
): DocumentLocation {
  const ids = new Set(group.memberRegionIds);
  const members = regions.filter((region) => ids.has(region.id));
  const pageIndex = Math.min(...members.map((region) => region.pageIndex));
  const rects = new Map(
    members
      .filter((region) => region.pageIndex === pageIndex)
      .map((region) => [region.rect.join(','), region.rect]),
  );
  return {
    pageIndex,
    rects: [...rects.values()],
  };
}
