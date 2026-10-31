import type { DocumentLocation } from '../../document-analysis/contracts';
import { excerptBounds } from '../../document-analysis/excerpts';

/** Zotero's native note serializer supplies citation data and region-based image links without creating an annotation. */
export function sourceNoteImageMarkup(
  itemID: number,
  location: DocumentLocation,
  image: string,
  caption: string,
): string {
  const result = Zotero.EditorInstanceUtilities.serializeAnnotations([
    {
      type: 'image',
      attachmentItemID: itemID,
      image,
      comment: caption,
      pageLabel: String(location.pageIndex + 1),
      color: '#ffd400',
      position: { pageIndex: location.pageIndex, rects: [excerptBounds(location)] },
    },
  ]);
  if (!result.html) throw new Error('Native source note markup unavailable');
  return result.html;
}

/** Standard URL is a page fallback outside Zotero; native note metadata retains the exact source region. */
export function sourcePDFLink(itemID: number, pageIndex: number): string {
  const item = Zotero.Items.get(itemID);
  if (!item || !item.isPDFAttachment()) throw new Error('Source PDF unavailable');
  const library = Zotero.Libraries.get(item.libraryID);
  if (!library) throw new Error('Source library unavailable');
  const scope =
    library.libraryType === 'user'
      ? 'library'
      : `groups/${Zotero.Groups.getGroupIDFromLibraryID(item.libraryID)}`;
  return `zotero://open-pdf/${scope}/items/${item.key}?page=${pageIndex + 1}`;
}
