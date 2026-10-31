import {
  checkParseCurrent,
  documentRect,
  record,
  documentRegionFlow,
  type DocumentPage,
  type DocumentParser,
  type DocumentRect,
  type DocumentRegion,
  type DocumentRegionKind,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';

export interface DocumentHttpRequest {
  readonly url: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly signal: AbortSignal;
}

export interface OXRParserOptions {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly readPDF: () => Promise<Uint8Array>;
  readonly request: (request: DocumentHttpRequest) => Promise<unknown>;
}

const KINDS: Readonly<Record<string, DocumentRegionKind>> = {
  Text: 'text',
  Title: 'heading',
  Caption: 'caption',
  Picture: 'image',
  Table: 'table',
  Formula: 'formula',
  'Page-header': 'header',
  'Page-footer': 'footer',
  Footnote: 'footnote',
  'Code Block': 'code',
};

/** Invert the backend's rotated raster coordinates into the original PDF CropBox coordinates. */
export function rasterPDFRect(
  rect: DocumentRect,
  width: number,
  height: number,
  page: DocumentPage,
): DocumentRect {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height))
    throw new Error('Invalid raster dimensions');
  if (rect[0] < 0 || rect[1] < 0 || rect[2] > width || rect[3] > height)
    throw new Error('Raster region lies outside its page');
  const [left, bottom, right, top] = page.viewBox;
  const points = [
    [rect[0], rect[1]],
    [rect[2], rect[3]],
  ].map(([x, y]) => {
    const u = x! / width,
      v = y! / height;
    const [a, b] =
      page.rotation === 90
        ? [v, u]
        : page.rotation === 180
          ? [1 - u, v]
          : page.rotation === 270
            ? [1 - v, 1 - u]
            : [u, 1 - v];
    return [left + a! * (right - left), bottom + b! * (top - bottom)];
  });
  return [
    Math.min(points[0]![0]!, points[1]![0]!),
    Math.min(points[0]![1]!, points[1]![1]!),
    Math.max(points[0]![0]!, points[1]![0]!),
    Math.max(points[0]![1]!, points[1]![1]!),
  ];
}

export function oxrParsedDocument(
  source: DocumentSource,
  payload: unknown,
  durationMs = 0,
): ParsedDocument {
  const envelope = record(payload);
  if (envelope?.code !== 0) throw new Error('OXR document parsing failed');
  const result = record(record(envelope.data)?.result);
  const pages = record(record(result?.outputs)?.json)?.pages;
  if (!Array.isArray(pages) || pages.length !== source.pages.length)
    throw new Error('OXR returned an incomplete or incompatible page set');
  const regions: DocumentRegion[] = [];
  const seen = new Set<number>();
  for (const raw of pages) {
    const page = record(raw),
      pageIndex = page?.page_num;
    if (
      typeof pageIndex !== 'number' ||
      !Number.isInteger(pageIndex) ||
      seen.has(pageIndex) ||
      !source.pages[pageIndex]
    )
      throw new Error('Invalid OXR page identity');
    seen.add(pageIndex);
    const size = record(page?.page_size);
    if (
      typeof size?.w !== 'number' ||
      typeof size.h !== 'number' ||
      !(size.w > 0 && size.h > 0) ||
      !Number.isFinite(size.w + size.h) ||
      !Array.isArray(page?.blocks)
    )
      throw new Error('Invalid OXR page geometry');
    for (const [index, value] of page.blocks.entries()) {
      const block = record(value),
        rect = documentRect(block?.bbox);
      if (!block || !rect || typeof block.content !== 'string')
        throw new Error('Invalid OXR region');
      const kind = KINDS[String(block.type)] ?? 'other';
      const format =
        block.format === 'html' || block.format === 'latex' || block.format === 'markdown'
          ? block.format
          : 'text';
      regions.push({
        id: `oxr:${pageIndex}:${index}`,
        kind,
        pageIndex,
        rect: rasterPDFRect(rect, size.w, size.h, source.pages[pageIndex]!),
        text: block.content,
        format,
        flow: documentRegionFlow(kind),
        anchorPrecision: 'region',
      });
    }
  }
  return {
    schemaVersion: 1,
    sourceFingerprint: source.fingerprint,
    backend: 'oxr',
    modelRevision: null,
    durationMs,
    pages: source.pages,
    regions,
  };
}

/** Keep multipart construction independent of Gecko/DOM constructors and never put credentials in results. */
export function oxrMultipart(bytes: Uint8Array, apiKey: string, boundary: string): Uint8Array {
  if (!/^[\x20-\x7e]*$/u.test(apiKey)) throw new Error('Invalid API key format');
  const encode = (s: string): Uint8Array => Uint8Array.from(Array.from(s), (c) => c.charCodeAt(0));
  const parts = [
    encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${apiKey}\r\n--${boundary}\r\nContent-Disposition: form-data; name="output_formats"\r\n\r\njson\r\n--${boundary}\r\nContent-Disposition: form-data; name="keep_header_footer"\r\n\r\ntrue\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    bytes,
    encode(`\r\n--${boundary}--\r\n`),
  ];
  const body = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}

export function oxrDocumentParser(options: OXRParserOptions): DocumentParser {
  return {
    id: 'oxr',
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      const url = new URL(options.baseURL);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('Invalid OXR API address');
      const started = Date.now(),
        bytes = await options.readPDF();
      checkParseCurrent(signal);
      const boundary = `neo-document-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = await options.request({
        url: `${url.href.replace(/\/$/u, '')}/parse/sync`,
        body: oxrMultipart(bytes, options.apiKey, boundary),
        contentType: `multipart/form-data; boundary=${boundary}`,
        signal,
      });
      checkParseCurrent(signal);
      return oxrParsedDocument(source, payload, Date.now() - started);
    },
  };
}
