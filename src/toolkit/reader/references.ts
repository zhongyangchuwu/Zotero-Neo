import {
  documentRect,
  record,
  type DocumentLocation,
  type DocumentRegion,
} from '../../document-analysis/contracts';
import { nativeDocumentRegions } from '../../document-analysis/native';
import { recognizeIdentifiers } from '../../identifiers';
import { analysisPDF } from '../../platform/document-analysis';
import { nativeObjectIdentity } from '../../platform/cross-compartment';
import type { PdfWindow, ReaderRuntime } from './contracts';
import type { NativePdfWindow, NativeReaderRuntime } from './private-types';
import { readerPresentationView } from './presentation';
import { structuredDocumentData } from './structured-document';
import type {
  ReaderCitationOccurrence,
  ReaderReferenceSnapshot,
  ReaderReferenceEntry,
  ReaderReferenceLocation,
} from './reference-contracts';

function location(value: unknown): ReaderReferenceLocation | null {
  const position = record(value);
  const pageIndex = position?.pageIndex;
  if (
    typeof pageIndex !== 'number' ||
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    !Array.isArray(position?.rects)
  )
    return null;
  const rects: [number, number, number, number][] = [];
  for (const value of position.rects) {
    const rect = documentRect(value);
    if (!rect) return null;
    rects.push([rect[0], rect[1], rect[2], rect[3]]);
  }
  if (!rects.length) return null;
  if (position.nextPageRects === undefined) return { pageIndex, rects };
  if (!Array.isArray(position.nextPageRects)) return null;
  const nextPageRects: [number, number, number, number][] = [];
  for (const value of position.nextPageRects) {
    const rect = documentRect(value);
    if (!rect) return null;
    nextPageRects.push([rect[0], rect[1], rect[2], rect[3]]);
  }
  return { pageIndex, rects, nextPageRects };
}

function charsText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((value) => {
      const char = record(value);
      return (
        (typeof char?.u === 'string' ? char.u : typeof char?.c === 'string' ? char.c : '') +
        (char?.spaceAfter ? ' ' : '')
      );
    })
    .join('')
    .trim();
}

function referenceText(reference: Readonly<Record<string, unknown>>): string {
  if (Array.isArray(reference.textParts)) {
    const parts = reference.textParts
      .map((part) => record(part)?.text)
      .filter((part): part is string => typeof part === 'string');
    if (parts.length) return parts.join('').trim();
  }
  return typeof reference.text === 'string' ? reference.text.trim() : charsText(reference.chars);
}

function context(chars: unknown, word: unknown): string {
  if (!Array.isArray(chars) || !Array.isArray(word) || !word.length) return charsText(word);
  const first = record(word[0])?.offset;
  const last = record(word[word.length - 1])?.offset;
  if (
    typeof first !== 'number' ||
    typeof last !== 'number' ||
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 0 ||
    last < first ||
    last >= chars.length
  )
    return charsText(word);
  return charsText(chars.slice(Math.max(0, first - 100), Math.min(chars.length, last + 101)));
}
function blockText(value: unknown): string {
  const node = record(value);
  if (typeof node?.text === 'string') return node.text;
  return Array.isArray(node?.content) ? node.content.map(blockText).join('') : '';
}

/** Only number-delimited entries in an explicitly named bibliography can be completed safely. */
function supplementBibliography(
  blocks: readonly unknown[],
  nativeRegions: readonly DocumentRegion[],
  entries: Map<string, ReaderReferenceEntry>,
): boolean {
  const headings = blocks
    .map((value, index) => ({ node: record(value), index }))
    .filter(
      ({ node }) =>
        node?.type === 'heading' &&
        /^(references|bibliography|参考文献)\s*:?$/i.test(blockText(node).trim()),
    );
  if (headings.length !== 1) return false;
  const regions = new Map<number, DocumentRegion[]>();
  for (const region of nativeRegions) {
    const index = region.sourceBlock?.order;
    if (index === undefined) continue;
    const list = regions.get(index) ?? [];
    list.push(region);
    regions.set(index, list);
  }
  const unmatched = new Set(entries.keys());
  const groups: { label: string; text: string[]; locations: DocumentLocation[] }[] = [];
  let valid = true;
  for (let index = headings[0].index + 1; index < blocks.length; index++) {
    const block = record(blocks[index]);
    if (block?.type === 'heading') break;
    if (block?.flowClass === 'excluded') continue;
    if (block?.type !== 'paragraph') {
      valid = false;
      break;
    }
    const text = blockText(block).trim();
    if (!text) continue;
    const label = /^(?:\[(\d+)\]|(\d+)\.)\s*/.exec(text);
    if (label) groups.push({ label: label[1] ?? label[2], text: [], locations: [] });
    const group = groups[groups.length - 1];
    if (!group) {
      valid = false;
      break;
    }
    group.text.push(text);
    const anchors = regions.get(index) ?? [];
    if (!anchors.length) {
      valid = false;
      break;
    }
    for (const anchor of anchors)
      group.locations.push({ pageIndex: anchor.pageIndex, rects: [[...anchor.rect]] });
  }
  if (!groups.length) return false;
  for (const [index, group] of groups.entries()) {
    if (Number(group.label) !== index + 1) valid = false;
    if (!group.locations.length) {
      valid = false;
      continue;
    }
    const first = group.locations[0];
    const candidates = [...entries.values()].filter(
      (entry) =>
        entry.label === group.label &&
        entry.location.pageIndex === first.pageIndex &&
        entry.location.rects.some((a) =>
          first.rects.some((b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]),
        ),
    );
    if (candidates.length > 1) {
      valid = false;
      continue;
    }
    if (candidates.length === 1) {
      unmatched.delete(candidates[0].id);
      continue;
    }
    const rects = group.locations
      .filter((part) => part.pageIndex === first.pageIndex)
      .flatMap((part) => part.rects);
    const nextPageRects = group.locations
      .filter((part) => part.pageIndex === first.pageIndex + 1)
      .flatMap((part) => part.rects);
    if (
      group.locations.some(
        (part) => part.pageIndex !== first.pageIndex && part.pageIndex !== first.pageIndex + 1,
      )
    )
      valid = false;
    const position: ReaderReferenceLocation = nextPageRects.length
      ? { pageIndex: first.pageIndex, rects, nextPageRects }
      : { pageIndex: first.pageIndex, rects };
    const id = JSON.stringify([position.pageIndex, position.rects, position.nextPageRects]);
    const text = group.text.join(' ');
    const identifiers = recognizeIdentifiers(text);
    entries.set(id, {
      id,
      label: group.label,
      text,
      location: position,
      doi: identifiers.find((value) => value.kind === 'doi')?.value ?? null,
      arxivID: identifiers.find((value) => value.kind === 'arxiv')?.value ?? null,
    });
  }
  return valid && unmatched.size === 0;
}

/** Read native whole-document overlays; no content-realm objects leave this boundary. */
export async function readReaderReferenceDocument(
  reader: ReaderRuntime,
  isCurrent: () => boolean,
  window: PdfWindow,
): Promise<ReaderReferenceSnapshot> {
  const itemID = reader.itemID;
  const internal = (reader as NativeReaderRuntime)._internalReader;
  const primary = readerPresentationView(reader, true)?._iframeWindow === window;
  const presentation = readerPresentationView(reader, primary);
  const document = window.document;
  const view = primary ? internal?._primaryView : internal?._secondaryView;
  const pdfWindow = view?._iframeWindow as NativePdfWindow | undefined;
  const pdfDocument = pdfWindow?.document;
  const pdf = pdfWindow?.PDFViewerApplication?.pdfDocument;
  let retired = false;
  const current = (): boolean => {
    if (retired) return false;
    retired = !(
      isCurrent() &&
      reader.itemID === itemID &&
      (reader as NativeReaderRuntime)._internalReader === internal &&
      readerPresentationView(reader, primary) === presentation &&
      presentation?._iframeWindow === window &&
      window.document === document &&
      (primary ? internal?._primaryView : internal?._secondaryView) === view &&
      view?._iframeWindow === pdfWindow &&
      pdfWindow?.document === pdfDocument &&
      pdfWindow?.PDFViewerApplication?.pdfDocument === pdf
    );
    return !retired;
  };
  if (!itemID || !pdf?.getProcessedData || !pdf.getData || !current())
    throw new Error('PDF reference source unavailable');
  const source = await analysisPDF(itemID);
  if (!current()) throw new Error('Reference analysis cancelled');
  const bytes = nativeObjectIdentity(await pdf.getData());
  if (!current()) throw new Error('Reference analysis cancelled');
  const classes = Components.classes as unknown as Record<
    string,
    {
      createInstance(iid: unknown): {
        init(algorithm: number): void;
        update(bytes: Uint8Array, length: number): void;
        finish(base64: boolean): string;
        readonly MD5: number;
      };
    }
  >;
  const interfaces = Components.interfaces as unknown as { nsICryptoHash: unknown };
  const hash = classes['@mozilla.org/security/hash;1'].createInstance(interfaces.nsICryptoHash);
  hash.init(hash.MD5);
  hash.update(bytes, bytes.length);
  const binary = hash.finish(false);
  let loadedFingerprint = '';
  for (let index = 0; index < binary.length; index++)
    loadedFingerprint += binary.charCodeAt(index).toString(16).padStart(2, '0');
  if (loadedFingerprint !== source.fingerprint) throw new Error('PDF reference source changed');
  const data = record(await pdf.getProcessedData());
  if (!current()) throw new Error('Reference analysis cancelled');
  const pages = record(data?.pages);
  if (!pages) throw new Error('PDF reference data unavailable');
  const entries = new Map<string, ReaderReferenceEntry>();
  const occurrences = new Map<string, ReaderCitationOccurrence>();
  const addReference = (value: unknown): string | null => {
    const reference = record(value);
    const position = location(reference?.position);
    if (!reference || !position) return null;
    const text = referenceText(reference);
    if (!text) return null;
    const key = JSON.stringify([position.pageIndex, position.rects, position.nextPageRects]);
    if (!entries.has(key)) {
      const identifiers = recognizeIdentifiers(text);
      const label =
        typeof reference.index === 'number' || typeof reference.index === 'string'
          ? String(reference.index)
          : '';
      entries.set(key, {
        id: key,
        label,
        text,
        location: position,
        doi: identifiers.find((id) => id.kind === 'doi')?.value ?? null,
        arxivID: identifiers.find((id) => id.kind === 'arxiv')?.value ?? null,
      });
    }
    return key;
  };
  for (const page of Object.values(pages)) {
    const pageData = record(page);
    if (!Array.isArray(pageData?.overlays)) continue;
    for (const value of pageData.overlays) {
      const overlay = record(value);
      if (
        !overlay ||
        (overlay.type !== 'reference' && overlay.type !== 'citation') ||
        !Array.isArray(overlay.references)
      )
        continue;
      const referenceIDs = [
        ...new Set(overlay.references.map(addReference).filter((id): id is string => id !== null)),
      ];
      if (overlay.type !== 'citation' || !referenceIDs.length) continue;
      const position = location(overlay.position);
      if (!position) continue;
      const id = JSON.stringify([position.pageIndex, position.rects, position.nextPageRects]);
      const previous = occurrences.get(id);
      occurrences.set(id, {
        id,
        referenceIDs: [...new Set([...(previous?.referenceIDs ?? []), ...referenceIDs])],
        text: charsText(overlay.word),
        context: context(pageData.chars, overlay.word),
        location: position,
      });
    }
  }
  let blocks: readonly unknown[] | null = null;
  try {
    const structured = await structuredDocumentData(itemID, current);
    if (record(record(structured?.metadata)?.source)?.hash === source.fingerprint)
      blocks = structured?.blocks ?? null;
  } catch {
    // Native references remain usable when structured analysis is unavailable.
  }
  if (!current()) throw new Error('Reference analysis cancelled');
  const nativeRegions = blocks ? nativeDocumentRegions(blocks) : [];
  const bibliographyCoverage =
    blocks && supplementBibliography(blocks, nativeRegions, entries) ? 'complete' : 'partial';
  if (blocks) {
    const pages = new Map<number, DocumentRegion[]>();
    for (const region of nativeRegions) {
      const list = pages.get(region.pageIndex) ?? [];
      list.push(region);
      pages.set(region.pageIndex, list);
    }
    for (const [id, occurrence] of occurrences) {
      const rect = occurrence.location.rects[0];
      const x = (rect[0] + rect[2]) / 2;
      const y = (rect[1] + rect[3]) / 2;
      const matches = new Set(
        (pages.get(occurrence.location.pageIndex) ?? [])
          .filter(
            (region) =>
              region.kind === 'text' &&
              region.rect[0] <= x &&
              x <= region.rect[2] &&
              region.rect[1] <= y &&
              y <= region.rect[3],
          )
          .map((region) => region.sourceBlock?.order)
          .filter((order): order is number => order !== undefined),
      );
      if (matches.size === 1) {
        const index = matches.values().next().value;
        const text = index === undefined ? '' : blockText(blocks[index]).trim();
        if (text) occurrences.set(id, { ...occurrence, context: text });
      }
    }
  }
  const validate = async (): Promise<boolean> => {
    if (!current()) return false;
    try {
      if (!(await source.isCurrent())) retired = true;
    } catch {
      retired = true;
    }
    return current();
  };
  if (!(await validate())) throw new Error('Reference analysis cancelled');
  return {
    document: {
      attachmentID: itemID,
      sourceID: source.fingerprint,
      bibliographyCoverage,
      entries: [...entries.values()],
      occurrences: [...occurrences.values()],
    },
    isCurrent: current,
    validate,
  };
}
