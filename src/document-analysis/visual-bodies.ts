import type { DocumentLocation, DocumentRegion } from './contracts';

export interface DocumentVisualBody {
  readonly id: string;
  readonly kind: 'figure' | 'table';
  readonly location: DocumentLocation;
}

/** Independent visual bodies provide a fallback when a provider associates the wrong caption. */
export function documentVisualBodies(
  regions: readonly DocumentRegion[],
): readonly DocumentVisualBody[] {
  const bodies = new Map<
    string,
    { kind: 'figure' | 'table'; pageIndex: number; rects: Map<string, DocumentRegion['rect']> }
  >();
  for (const region of regions) {
    if (region.kind !== 'image' && region.kind !== 'table') continue;
    const kind = region.kind === 'table' ? 'table' : 'figure';
    const id = `body:${region.sourceBlock?.id ?? region.id}:${region.pageIndex}:${kind}`;
    const body = bodies.get(id) ?? { kind, pageIndex: region.pageIndex, rects: new Map() };
    body.rects.set(region.rect.join(','), region.rect);
    bodies.set(id, body);
  }
  return [...bodies].map(([id, body]) => ({
    id,
    kind: body.kind,
    location: { pageIndex: body.pageIndex, rects: [...body.rects.values()] },
  }));
}
