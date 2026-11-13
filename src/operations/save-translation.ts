import { analysisPDF } from '../platform/document-analysis';

export const TRANSLATION_ROLE_TAG = 'zotero-neo:translation';

export interface TranslationSource {
  readonly itemID: number;
  readonly key: string;
  readonly libraryID: number;
  readonly fingerprint: string;
  readonly isCurrent: () => Promise<boolean>;
}

export interface TranslationMarker {
  readonly source: TranslationSource;
  readonly quote: string;
  readonly translation: string;
  readonly position: string;
  readonly sortIndex: string;
  readonly pageLabel: string;
  readonly originalLabel: string;
  readonly translationLabel: string;
}

/** Match the attachment to the initiating loaded PDF, never establish provenance from disk alone. */
export async function captureTranslationSource(
  itemID: number,
  loadedFingerprint: string,
): Promise<TranslationSource> {
  const attachment = await Zotero.Items.getAsync(itemID);
  if (!attachment || attachment.deleted || !attachment.isPDFAttachment())
    throw new Error('Translation source PDF is unavailable');
  const key = attachment.key;
  const libraryID = attachment.libraryID;
  const pdf = await analysisPDF(itemID);
  if (pdf.fingerprint !== loadedFingerprint)
    throw new Error('Displayed PDF no longer matches the attachment; reopen the reader');
  const isCurrent = async (): Promise<boolean> => {
    try {
      const current = await Zotero.Items.getAsync(itemID);
      const library = Zotero.Libraries.get(libraryID);
      return (
        !!current &&
        !current.deleted &&
        current.isPDFAttachment() &&
        current.key === key &&
        current.libraryID === libraryID &&
        !!library &&
        library.editable &&
        (await pdf.isCurrent())
      );
    } catch {
      return false;
    }
  };
  if (!(await isCurrent())) throw new Error('Translation source or destination changed');
  return Object.freeze({ itemID, key, libraryID, fingerprint: pdf.fingerprint, isCurrent });
}

/** Persist admitted plain text independently of the popup; roll back only our own stale write. */
export async function saveTranslationMarker(marker: TranslationMarker): Promise<void> {
  if (!marker.quote.trim() || !marker.translation.trim())
    throw new Error('Source quote and translation must not be empty');
  if (!(await marker.source.isCurrent()))
    throw new Error('Source PDF or destination changed; reopen the reader');
  const item = new Zotero.Item('annotation');
  item.libraryID = marker.source.libraryID;
  item.parentID = marker.source.itemID;
  item.annotationType = 'note';
  item.annotationColor = '#2ea8e5';
  // Native annotation comments are plain text, not SourceNoteDraft HTML.
  item.annotationComment = `${marker.originalLabel}:\n${marker.quote}\n\n${marker.translationLabel}:\n${marker.translation}`;
  item.annotationIsExternal = false;
  item.annotationSortIndex = marker.sortIndex;
  item.annotationPageLabel = marker.pageLabel;
  item.annotationPosition = marker.position;
  item.addTag(TRANSLATION_ROLE_TAG);
  await item.saveTx();
  if (!(await marker.source.isCurrent())) {
    await item.eraseTx();
    throw new Error('Source PDF or destination changed during save');
  }
}
