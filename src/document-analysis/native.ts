import {
  checkParseCurrent,
  documentRect,
  record,
  documentRegionFlow,
  type DocumentPage,
  type DocumentParser,
  type DocumentRegion,
  type DocumentRegionKind,
  type DocumentSource,
  type NativeDocumentData,
  type ParsedDocument,
} from './contracts';

const NATIVE_KINDS: Readonly<Record<string, DocumentRegionKind>> = {
  paragraph: 'text',
  heading: 'heading',
  caption: 'caption',
  image: 'image',
  table: 'table',
  math: 'formula',
  list: 'list',
  preformatted: 'code',
  note: 'footnote',
  blockquote: 'text',
};

function blockText(value: unknown): string {
  const node = record(value);
  if (typeof node?.text === 'string') return node.text;
  if (!Array.isArray(node?.content)) return '';
  return node.content
    .map(blockText)
    .join(node.content.every((part) => typeof record(part)?.text === 'string') ? '' : '\n');
}

export function nativeDocumentPages(catalog: unknown): readonly DocumentPage[] {
  const pages = record(catalog)?.pages;
  if (!Array.isArray(pages)) throw new Error('Native document page geometry unavailable');
  return pages.map((value, pageIndex) => {
    const page = record(value);
    const viewBox = documentRect(page?.viewRect);
    const rotation = page?.rotation ?? 0;
    if (!viewBox || ![0, 90, 180, 270].includes(rotation as number))
      throw new Error('Invalid native page geometry');
    return { pageIndex, viewBox, rotation: rotation as DocumentPage['rotation'] };
  });
}

/** Normalize native blocks once for both lightweight caption navigation and full analysis. */
export function nativeDocumentRegions(blocks: readonly unknown[]): readonly DocumentRegion[] {
  const regions: DocumentRegion[] = [];
  blocks.forEach((value, blockIndex) => {
    const block = record(value);
    const anchors = record(block?.anchor)?.pageRects;
    if (
      !block ||
      !Array.isArray(anchors) ||
      anchors.some(
        (anchor) =>
          !Array.isArray(anchor) ||
          anchor.length !== 5 ||
          !Number.isInteger(anchor[0]) ||
          anchor[0] < 0 ||
          !documentRect(anchor.slice(1)),
      )
    )
      return;
    for (const [part, anchor] of anchors.entries()) {
      if (!Array.isArray(anchor) || anchor.length !== 5) continue;
      const pageIndex: unknown = anchor[0];
      const rect = documentRect(anchor.slice(1));
      if (!Number.isInteger(pageIndex) || typeof pageIndex !== 'number' || pageIndex < 0 || !rect)
        continue;
      const kind =
        block.reference === true ? 'references' : (NATIVE_KINDS[String(block.type)] ?? 'other');
      regions.push({
        id: `native:${blockIndex}:${part}`,
        sourceBlock: { id: `native:${blockIndex}`, order: blockIndex },
        kind,
        pageIndex: pageIndex as number,
        rect,
        text: blockText(block),
        format: 'text',
        flow:
          block.flowClass === 'excluded' || block.flowClass === 'auxiliary'
            ? block.flowClass
            : documentRegionFlow(kind),
        anchorPrecision: 'region',
      });
    }
  });
  return regions;
}

export function nativeParsedDocument(
  source: DocumentSource,
  data: NativeDocumentData,
  durationMs = 0,
): ParsedDocument {
  const hash = record(record(data.metadata)?.source)?.hash;
  if (hash !== source.fingerprint)
    throw new Error('Native analysis belongs to a different PDF revision');
  const regions = nativeDocumentRegions(data.blocks).filter(
    (region) => source.pages[region.pageIndex],
  );
  return {
    schemaVersion: 1,
    sourceFingerprint: source.fingerprint,
    backend: 'zotero-sdt',
    modelRevision: JSON.stringify(record(data.metadata)?.processor ?? null),
    durationMs,
    pages: source.pages,
    regions,
  };
}

/**
 * Native text maps carry line ink bounds even when a top-level block has an oversized box.
 * Keep graph bodies intact; missing or malformed text maps leave the ordinary region as a fallback.
 * Block identities are preserved for exact Reading Mode admission, never used as cloud identities.
 */
export function nativeDocumentTextRegions(data: NativeDocumentData): readonly DocumentRegion[] {
  const lines = new Map<number, { pageIndex: number; rect: DocumentRegion['rect'] }[]>();
  const visit = (
    value: unknown,
    result: { pageIndex: number; rect: DocumentRegion['rect'] }[],
  ): void => {
    const node = record(value);
    if (!node) return;
    if (typeof node.text === 'string') {
      const textMap = record(node.anchor)?.textMap;
      try {
        const runs: unknown = typeof textMap === 'string' ? JSON.parse(textMap) : null;
        if (Array.isArray(runs))
          for (const run of runs) {
            if (!Array.isArray(run) || !Number.isInteger(run[1]) || run[1] < 0) continue;
            const rect = documentRect(run.slice(2, 6));
            if (rect) result.push({ pageIndex: run[1] as number, rect });
          }
      } catch {
        // Unknown native text-map versions cannot supply tighter geometry.
      }
    } else if (Array.isArray(node.content)) for (const child of node.content) visit(child, result);
  };
  data.blocks.forEach((block, index) => {
    const result: { pageIndex: number; rect: DocumentRegion['rect'] }[] = [];
    visit(block, result);
    lines.set(index, result);
  });
  return nativeDocumentRegions(data.blocks).flatMap((region) => {
    if (region.kind === 'image' || region.kind === 'table') return [region];
    const ink = lines
      .get(region.sourceBlock!.order)
      ?.filter((line) => line.pageIndex === region.pageIndex);
    return ink?.length
      ? ink.map((line, index) => ({ ...region, id: `${region.id}:ink:${index}`, rect: line.rect }))
      : [region];
  });
}

export function nativeDocumentParser(
  extract: (signal: AbortSignal) => Promise<NativeDocumentData>,
): DocumentParser {
  return {
    id: 'zotero-sdt',
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      const started = Date.now();
      const data = await extract(signal);
      checkParseCurrent(signal);
      return nativeParsedDocument(source, data, Date.now() - started);
    },
  };
}
