import type { ReaderSelectionContext } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import type { SourceNoteTarget } from '../core/source-note';
import type { DocumentLocation, DocumentRegion } from '../document-analysis/contracts';
import { documentRect } from '../document-analysis/contracts';
import { documentExcerpts } from '../document-analysis/excerpts';
import {
  documentSections,
  sectionForBlock,
  type DocumentSection,
} from '../document-analysis/sections';
import {
  documentText,
  documentTextBlocks,
  type DocumentTextBlock,
} from '../document-analysis/text-blocks';
import { analysisPDF } from '../platform/document-analysis';
import { resolveReaderSourceNoteTarget } from '../reader/item-target';
import {
  readReaderDocument,
  readReaderDocumentCache,
  type ReaderCachedDocument,
} from '../reader/document-cache';
import type { ReaderRuntime } from '../toolkit/reader';
import type { AIQAEvidence, AIQASource } from './contracts';
import { AIQAError } from './errors';

const MAX_EVIDENCE = 40;
const MAX_CONTEXT_CHARACTERS = 32000;

export interface AIQASourceCapture {
  readonly source: AIQASource;
  readonly target: SourceNoteTarget;
  isCurrent(): Promise<boolean>;
}

export interface AIQAContext {
  readonly sections: readonly { readonly id: string; readonly title: string }[];
  readonly sectionID: string;
  readonly title: string;
  readonly evidence: readonly AIQAEvidence[];
  readonly limited: boolean;
}

/** Captures this Reader's attachment and file revision without uploading or preparing native structure. */
export async function captureAIQASource(reader: ReaderRuntime): Promise<AIQASourceCapture> {
  const target = resolveReaderSourceNoteTarget(reader);
  if (!target) throw new AIQAError('stale-source');
  const pdf = await analysisPDF(target.attachment.itemID);
  const source: AIQASource = {
    itemID: target.attachment.itemID,
    libraryID: target.attachment.libraryID,
    key: target.attachment.key,
    fingerprint: pdf.fingerprint,
    fileName: pdf.fileName,
  };
  return {
    source,
    target,
    isCurrent: async () => {
      const next = resolveReaderSourceNoteTarget(reader)?.attachment;
      return (
        !!next &&
        next.itemID === source.itemID &&
        next.key === source.key &&
        next.libraryID === source.libraryID &&
        (await pdf.isCurrent())
      );
    },
  };
}

function selectionLocation(position: string | null): DocumentLocation | null {
  if (!position) return null;
  try {
    const value: unknown = JSON.parse(position);
    if (
      !value ||
      typeof value !== 'object' ||
      !('pageIndex' in value) ||
      !Number.isInteger(value.pageIndex) ||
      (value.pageIndex as number) < 0 ||
      !('rects' in value) ||
      !Array.isArray(value.rects) ||
      !value.rects.length ||
      value.rects.length > 256
    )
      return null;
    const rects = value.rects.map(documentRect);
    if (rects.some((rect) => !rect)) return null;
    return { pageIndex: value.pageIndex as number, rects: rects.filter((rect) => rect !== null) };
  } catch {
    return null;
  }
}

/** A saved selection is authored text with a native position, not an OCR region promoted to characters. */
export function aiQASelectionEvidence(
  source: AIQASource,
  context: ReaderSelectionContext | null,
): readonly AIQAEvidence[] {
  if (!context || context.itemID !== source.itemID || !context.text.trim()) return [];
  if (context.text.length > MAX_CONTEXT_CHARACTERS) throw new AIQAError('unsupported');
  return [
    {
      id: 'selection',
      kind: 'selection',
      title: source.fileName,
      text: context.text,
      format: 'text',
      pageLabel: context.pageLabel,
      precision: 'text',
      location: selectionLocation(context.position),
      nativePosition: context.position,
    },
  ];
}

function blockLocation(regions: readonly DocumentRegion[]): DocumentLocation | null {
  const first = regions.find((region) => region.flow !== 'excluded');
  if (!first) return null;
  return {
    pageIndex: first.pageIndex,
    rects: regions
      .filter((region) => region.pageIndex === first.pageIndex)
      .map((region) => region.rect),
  };
}

function chooseSection(
  sections: readonly DocumentSection[],
  blocks: readonly DocumentTextBlock[],
  id: string | null,
  selection: ReaderSelectionContext | null,
  pageIndex: number | null,
): DocumentSection {
  const named = id && sections.find((section) => section.id === id);
  if (named) return named;
  const quote = selection && documentText(selection.text);
  if (quote) {
    const matches = blocks.flatMap((block, index) =>
      documentText(block.text).includes(quote) ? [index] : [],
    );
    if (matches.length === 1) return sectionForBlock(sections, matches[0]!) ?? sections[0]!;
  }
  if (pageIndex !== null) {
    const index = blocks.findIndex((block) =>
      block.regions.some((region) => region.pageIndex === pageIndex && region.flow === 'body'),
    );
    if (index >= 0) return sectionForBlock(sections, index) ?? sections[0]!;
  }
  return sections[0]!;
}

function projectContext(
  snapshot: ReaderCachedDocument,
  selectedID: string | null,
  selection: ReaderSelectionContext | null,
  pageIndex: number | null,
): AIQAContext {
  const regions = snapshot.parsed.regions,
    blocks = documentTextBlocks(regions),
    sections = documentSections(blocks);
  const section = chooseSection(sections, blocks, selectedID, selection, pageIndex);
  const selectedBlocks = blocks.slice(section.start, section.end);
  const regionIDs = new Set(
    selectedBlocks.flatMap((block) => block.regions.map((region) => region.id)),
  );
  const evidence: AIQAEvidence[] = [];
  let characters = 0,
    limited = false;
  const append = (value: AIQAEvidence): void => {
    if (!value.text.trim() && (value.kind === 'selection' || value.kind === 'text')) return;
    if (evidence.length >= MAX_EVIDENCE || characters >= MAX_CONTEXT_CHARACTERS) {
      limited = true;
      return;
    }
    const remaining = MAX_CONTEXT_CHARACTERS - characters;
    const text = value.text.length > remaining ? value.text.slice(0, remaining) : value.text;
    limited ||= text.length !== value.text.length;
    characters += text.length;
    evidence.push({ ...value, text });
  };
  // Objects receive their own identities and structure; they are not flattened out of the guide.
  const excerpts = documentExcerpts(regions);
  const grouped = new Set(
    excerpts.filter((item) => item.part === 'object').flatMap((item) => item.regionIds),
  );
  for (const item of excerpts) {
    if (
      (item.part === 'body' && item.regionIds.every((id) => grouped.has(id))) ||
      item.kind === 'formula' ||
      !item.regionIds.some((id) => regionIDs.has(id))
    )
      continue;
    const text = [item.caption, ...item.structures.map((structure) => structure.text)]
      .filter(Boolean)
      .join('\n\n');
    for (const location of item.locations)
      append({
        id: `${item.part}:${item.id}:page:${location.pageIndex}`,
        kind: item.kind,
        title: item.label || item.title || item.kind,
        text,
        format: item.structures[0]?.format ?? 'text',
        pageLabel: String(location.pageIndex + 1),
        precision: 'region',
        location,
        nativePosition: null,
      });
  }
  for (const block of selectedBlocks) {
    const usable = block.regions.filter(
      (region) => region.flow === 'body' && !['image', 'table', 'caption'].includes(region.kind),
    );
    if (!usable.length || !block.text.trim()) continue;
    const location = blockLocation(usable);
    append({
      id: `text:${block.id}`,
      kind: 'text',
      title: section.title,
      text: block.text,
      format: usable[0]!.format,
      pageLabel: location ? String(location.pageIndex + 1) : null,
      precision: 'region',
      location,
      nativePosition: null,
    });
  }
  return {
    sections: sections.map((value) => ({ id: value.id, title: value.title })),
    sectionID: section.id,
    title: section.title,
    evidence,
    limited,
  };
}

/** Cache-only opening remains cheap; native preparation happens only after an explicit task/context action. */
export async function readAIQAContext(
  reader: ReaderRuntime,
  preferences: PreferenceStore,
  capture: AIQASourceCapture,
  current: () => boolean,
  options: {
    readonly prepare: boolean;
    readonly sectionID: string | null;
    readonly selection: ReaderSelectionContext | null;
    readonly pageIndex: number | null;
  },
): Promise<AIQAContext | null> {
  const snapshot = options.prepare
    ? await readReaderDocument(reader, preferences, current)
    : await readReaderDocumentCache(reader, preferences, current);
  if (!snapshot) return null;
  if (
    !current() ||
    snapshot.parsed.sourceFingerprint !== capture.source.fingerprint ||
    !(await snapshot.isCurrent()) ||
    !(await capture.isCurrent())
  )
    throw new AIQAError('stale-source');
  return projectContext(snapshot, options.sectionID, options.selection, options.pageIndex);
}
