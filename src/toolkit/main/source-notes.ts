import type { DocumentLocation } from '../../document-analysis/contracts';
import { excerptBounds } from '../../document-analysis/excerpts';
import { documentRect } from '../../document-analysis/contracts';
import type { SourceNoteEntry } from '../../core/source-note';
import { documentMarkupText } from '../../platform/document-markup';
import { relatedSourceNotes } from '../../platform/note-relations';
import { escapeHTML } from '../../core/html';

/** Public annotation positions may contain a continuation on the following page. Invalid geometry remains unclassified. */
function sourceLocations(value: unknown): readonly DocumentLocation[] {
  if (!value || typeof value !== 'object') return [];
  const position = value as { pageIndex?: unknown; rects?: unknown; nextPageRects?: unknown };
  if (!Number.isInteger(position.pageIndex) || Number(position.pageIndex) < 0) return [];
  return [position.rects, position.nextPageRects].flatMap((rects, offset) =>
    Array.isArray(rects) && rects.length && rects.length <= 256 && rects.every(documentRect)
      ? [{ pageIndex: Number(position.pageIndex) + offset, rects }]
      : [],
  );
}

/** Read existing annotation and note content for this PDF only. Template parsing never attaches imported note HTML to a live document. */
export async function sourceNoteEntries(
  itemID: number,
  excludeRelationPrefix?: string,
): Promise<readonly SourceNoteEntry[]> {
  const source = await Zotero.Items.getAsync(itemID);
  if (!source || source.deleted || !source.isPDFAttachment())
    throw new Error('Source PDF unavailable');
  const uri = Zotero.URI.getItemURI(source),
    result: SourceNoteEntry[] = [];
  const parent = source.parentID ? Zotero.Items.get(source.parentID) : false;
  const title = parent ? parent.getDisplayTitle() : source.getDisplayTitle();
  const sourceLink = (locations: readonly DocumentLocation[]): string =>
    locations.length
      ? `<p><a href="${escapeHTML(sourcePDFLink(source.id, locations[0]!.pageIndex))}">${escapeHTML(title)} · ${locations.map((l) => l.pageIndex + 1).join(', ')}</a></p>`
      : '';
  for (const item of source.getAnnotations()) {
    if (item.deleted) continue;
    const data = await Zotero.Annotations.toJSON(item);
    const images = data.image?.startsWith('data:image/png;base64,') ? [data.image] : [];
    const html = Zotero.EditorInstanceUtilities.serializeAnnotations([
      {
        ...data,
        id: item.key,
        attachmentItemID: source.id,
        ...(images.length ? { image: 'neo-image:0' } : { image: undefined }),
      },
    ]).html;
    if (!html) continue;
    const locations = sourceLocations(data.position);
    result.push({
      id: `annotation:${item.key}`,
      kind: 'annotation',
      quote: documentMarkupText(data.text || ''),
      comment: documentMarkupText(data.comment || ''),
      locations,
      html: html + sourceLink(locations),
      images,
      schemaVersion: data.type === 'underline' ? 10 : 9,
    });
  }
  const related = await relatedSourceNotes(uri);
  const noteIDs = new Set([
    ...related.map((note) => note.id),
    ...(parent ? parent.getNotes() : []),
  ]);
  const document = Zotero.getMainWindow().document;
  for (const id of noteIDs) {
    const note = await Zotero.Items.getAsync(id);
    if (
      !note ||
      note.deleted ||
      !note.isNote() ||
      note.libraryID !== source.libraryID ||
      (excludeRelationPrefix &&
        note
          .getRelationsByPredicate('dc:relation')
          .some((value) => value.startsWith(excludeRelationPrefix)))
    )
      continue;
    const template = document.createElementNS(
      'http://www.w3.org/1999/xhtml',
      'template',
    ) as HTMLTemplateElement;
    template.innerHTML = note.getNote();
    let index = 0;
    for (const image of Array.from(
      template.content.querySelectorAll('img[data-annotation][data-attachment-key]'),
    ) as HTMLImageElement[]) {
      try {
        const metadata = JSON.parse(decodeURIComponent(image.getAttribute('data-annotation')!)) as {
          attachmentURI?: string;
          position?: unknown;
        };
        if (metadata.attachmentURI !== uri) continue;
        const locations = sourceLocations(metadata.position);
        if (locations.length !== 1) continue;
        const embedded = Zotero.Items.getByLibraryAndKey(
          note.libraryID,
          image.getAttribute('data-attachment-key')!,
        );
        if (
          !embedded ||
          embedded.deleted ||
          embedded.parentID !== note.id ||
          !embedded.isAttachment()
        )
          continue;
        const png = await embedded.attachmentDataURI;
        if (!png.startsWith('data:image/png;base64,')) continue;
        const paragraph = image.closest('p')?.cloneNode(true) as HTMLElement | undefined;
        paragraph?.querySelectorAll('.citation').forEach((citation) => citation.remove());
        const comment = paragraph?.textContent?.trim() ?? '';
        result.push({
          id: `excerpt:${note.key}:${index++}`,
          kind: 'excerpt',
          quote: '',
          comment,
          locations,
          html:
            sourceNoteImageMarkup(source.id, locations[0]!, 'neo-image:0', comment) +
            sourceLink(locations),
          images: [png],
          schemaVersion: 9,
        });
      } catch {
        // A malformed/missing embedded image does not hide other valid source content.
      }
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

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
