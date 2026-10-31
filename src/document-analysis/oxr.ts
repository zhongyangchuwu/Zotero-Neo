import {
  checkParseCurrent,
  documentRect,
  record,
  documentRegionFlow,
  type DocumentParser,
  type DocumentCacheKey,
  type DocumentRegion,
  type DocumentRegionKind,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';
import type { DocumentHttpRequest } from './transport';
import { rasterPDFRect } from './geometry';

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
        sourceBlock: { id: `oxr:${pageIndex}:${index}`, order: regions.length },
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

function oxrEndpoint(baseURL: string): string {
  const url = new URL(baseURL);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid OXR API address');
  return url.href.replace(/\/$/u, '');
}

export function oxrDocumentCacheKey(baseURL: string): DocumentCacheKey {
  return {
    backend: 'oxr',
    adapterVersion: 1,
    configuration: JSON.stringify({
      endpoint: oxrEndpoint(baseURL),
      outputFormats: ['json'],
      keepHeaderFooter: true,
    }),
  };
}

export function oxrDocumentParser(options: OXRParserOptions): DocumentParser {
  const endpoint = oxrEndpoint(options.baseURL);
  return {
    id: 'oxr',
    cacheKey: oxrDocumentCacheKey(options.baseURL),
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      const started = Date.now(),
        bytes = await options.readPDF();
      checkParseCurrent(signal);
      const boundary = `neo-document-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = await options.request({
        url: `${endpoint}/parse/sync`,
        body: oxrMultipart(bytes, options.apiKey, boundary),
        contentType: `multipart/form-data; boundary=${boundary}`,
        signal,
      });
      checkParseCurrent(signal);
      return oxrParsedDocument(source, payload, Date.now() - started);
    },
  };
}
