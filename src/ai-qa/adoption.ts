import type { SourceNoteDraft } from '../core/source-note';
import { escapeHTML } from '../core/html';
import { createSourceNote } from '../operations/source-note';
import { sourceNoteIdentity } from '../platform/note-relations';
import { sourcePDFLink } from '../toolkit/main';
import type { AIQARecord } from './contracts';
import { AIQAError } from './errors';
import type { AIQASourceCapture } from './evidence';
import { parseAIQAOutput } from './output';

export interface AIQAAdoptionLabels {
  readonly title: string;
  readonly question: string;
  readonly source: string;
  readonly model: string;
  readonly generated: string;
  readonly modified: string;
}

function sameSource(record: AIQARecord, capture: AIQASourceCapture): boolean {
  const source = record.source,
    captured = capture.source,
    attachment = capture.target.attachment;
  return (
    source.itemID === captured.itemID &&
    source.libraryID === captured.libraryID &&
    source.key === captured.key &&
    source.fingerprint === captured.fingerprint &&
    source.itemID === attachment.itemID &&
    source.libraryID === attachment.libraryID &&
    source.key === attachment.key
  );
}

function textMarkup(value: string): string {
  return escapeHTML(value).replace(/\r\n?/gu, '\n').replace(/\n/gu, '<br>');
}

function staleSourceFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    'Source PDF changed',
    'Source PDF or destination changed',
    'Source note destination changed',
    'Source note destination changed before save',
    'Source note destination changed before note commit',
    'Source PDF unavailable',
  ].includes(error.message);
}

function adoptionDraft(
  record: AIQARecord,
  capture: AIQASourceCapture,
  labels: AIQAAdoptionLabels,
): SourceNoteDraft {
  const output = parseAIQAOutput(record.output, record.evidence),
    evidenceByID = new Map(record.evidence.map((entry) => [entry.id, entry] as const)),
    anchorByID = new Map(
      record.evidence.map((entry, index) => [entry.id, `reader-ai-evidence-${index + 1}`] as const),
    ),
    evidenceLink = (id: string): string => {
      const entry = evidenceByID.get(id),
        anchor = anchorByID.get(id);
      return entry && anchor ? `<a href="#${anchor}">${escapeHTML(entry.title)}</a>` : '';
    },
    generated = output.paragraphs.map((paragraph) => {
      const references = paragraph.evidenceIDs.map(evidenceLink).filter(Boolean);
      return `<p>${textMarkup(paragraph.text)}${references.length ? `<br>${references.join(' · ')}` : ''}</p>`;
    }),
    guide = output.guide.map(
      (finding) =>
        `<p><strong>${escapeHTML(finding.role)}</strong>: ${textMarkup(finding.reason)} · ${evidenceLink(finding.evidenceID)}</p>`,
    ),
    sourceEvidence = record.evidence.map((entry, index) => {
      const location = entry.location,
        pageIndex = location?.pageIndex,
        hasPage = Number.isSafeInteger(pageIndex) && (pageIndex as number) >= 0,
        page = entry.pageLabel ?? (hasPage ? String((pageIndex as number) + 1) : '');
      let reference = `${escapeHTML(entry.title)}${page ? ` · ${escapeHTML(page)}` : ''}`;
      if (hasPage) {
        try {
          const href = sourcePDFLink(capture.target.attachment.itemID, pageIndex as number);
          reference = `<a href="${escapeHTML(href)}">${reference}</a>`;
        } catch {
          // Keep the captured citation as text when Zotero cannot provide a native PDF link.
        }
      }
      return `<div id="reader-ai-evidence-${index + 1}"><p>${reference}</p><blockquote>${textMarkup(entry.text)}</blockquote></div>`;
    });
  const html = [
    `<h2>${escapeHTML(labels.question)}</h2><p>${textMarkup(record.question)}</p>`,
    `<h2>${escapeHTML(labels.generated)}</h2>`,
    ...generated,
    ...guide,
    ...(record.userText === null
      ? []
      : [`<h2>${escapeHTML(labels.modified)}</h2><p>${textMarkup(record.userText)}</p>`]),
    `<h2>${escapeHTML(labels.source)}</h2><p>${escapeHTML(record.source.fileName || capture.target.attachment.title)}</p>`,
    ...sourceEvidence,
    `<h2>${escapeHTML(labels.model)}</h2><p>${textMarkup(record.model)}</p>`,
  ].join('\n');
  return {
    sourceFingerprint: record.source.fingerprint,
    title: record.contextTitle.trim() ? `${labels.title} · ${record.contextTitle}` : labels.title,
    html,
    images: [],
    schemaVersion: 9,
    identity: sourceNoteIdentity(
      JSON.stringify([
        'reader-ai-adoption',
        record.source.libraryID,
        record.source.itemID,
        record.source.key,
        record.source.fingerprint,
        record.id,
        record.revision,
      ]),
    ),
  };
}

/** Save one immutable AI Q&A revision as a linked source note without changing its PDF or annotations. */
export async function saveAIQAToNote(
  record: AIQARecord,
  capture: AIQASourceCapture,
  labels: AIQAAdoptionLabels,
): Promise<void> {
  if (!sameSource(record, capture)) throw new AIQAError('stale-source');
  let current = false;
  try {
    current = await capture.isCurrent();
  } catch {
    current = false;
  }
  if (!current) throw new AIQAError('stale-source');
  try {
    const draft = adoptionDraft(record, capture, labels);
    await createSourceNote(capture.target, draft);
  } catch (error) {
    if (error instanceof AIQAError) throw error;
    throw new AIQAError(staleSourceFailure(error) ? 'stale-source' : 'storage');
  }
}
