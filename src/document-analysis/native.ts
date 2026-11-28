import {
  documentRect,
  record,
  documentRegionFlow,
  type DocumentRegion,
  type DocumentRegionKind,
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

/** Project native blocks without exposing their content-realm identities or inventing anchors. */
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
