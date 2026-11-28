import type { DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderLocalLayout } from '../../reader/local-layout';
import type { PdfWindow, Pointer } from '../../reader/types';
import { readerReadingMode, readerTextSpans, type ReaderTextSpan } from '../../toolkit/reader';
import { mapDocumentParagraphs } from './paragraph-mapping';
import type { MappedTextIndex } from './token-boundaries';

/** Use only local regions already present in the live PDF view. Never warm a page from a motion. */
export function readerStructuredParagraphs(
  layout: Pick<ReaderLocalLayout, 'visibleRegions'>,
  window: PdfWindow,
  focus: Pointer,
): readonly MappedTextIndex[] | null {
  if (readerReadingMode(window)) return null;
  const regions = layout.visibleRegions(window);
  if (!regions.length) return null;
  const focusPage =
    Number(
      focus.textNode.parentElement?.closest<HTMLElement>('.page[data-page-number]')?.dataset
        .pageNumber,
    ) - 1;
  if (!Number.isInteger(focusPage) || focusPage < 0) return null;

  const byPage = new Map<number, DocumentRegion[]>();
  for (const region of regions) {
    if (Math.abs(region.pageIndex - focusPage) > 1) continue;
    const page = byPage.get(region.pageIndex);
    if (page) page.push(region);
    else byPage.set(region.pageIndex, [region]);
  }
  if (!byPage.has(focusPage)) return null;
  const spansByPage = new Map<number, ReaderTextSpan[]>();
  for (const span of readerTextSpans(window, new Set(byPage.keys()))) {
    const page = span.sourcePageIndex;
    if (page === undefined) continue;
    const spans = spansByPage.get(page);
    if (spans) spans.push(span);
    else spansByPage.set(page, [span]);
  }
  return Array.from(spansByPage).flatMap(([page, spans]) =>
    mapDocumentParagraphs(byPage.get(page)!, spans).map(({ index }) => index),
  );
}
