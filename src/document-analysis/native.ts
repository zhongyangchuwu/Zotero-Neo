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

export function nativeParsedDocument(
  source: DocumentSource,
  data: NativeDocumentData,
  durationMs = 0,
): ParsedDocument {
  const hash = record(record(data.metadata)?.source)?.hash;
  if (hash !== source.fingerprint)
    throw new Error('Native analysis belongs to a different PDF revision');
  const regions: DocumentRegion[] = [];
  data.blocks.forEach((value, blockIndex) => {
    const block = record(value);
    const anchors = record(block?.anchor)?.pageRects;
    if (!block || !Array.isArray(anchors)) return;
    for (const [part, anchor] of anchors.entries()) {
      if (!Array.isArray(anchor) || anchor.length !== 5) continue;
      const pageIndex: unknown = anchor[0];
      const rect = documentRect(anchor.slice(1));
      if (!Number.isInteger(pageIndex) || !source.pages[pageIndex as number] || !rect) continue;
      const kind =
        block.reference === true ? 'references' : (NATIVE_KINDS[String(block.type)] ?? 'other');
      regions.push({
        id: `native:${blockIndex}:${part}`,
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
