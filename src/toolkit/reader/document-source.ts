import type { ReaderRuntime } from './contracts';
import type { NativePdfWindow, NativeReaderRuntime } from './private-types';

/** Source geometry belongs to the PDF document, independently of either parser or displayed split. */
export async function readerDocumentPageGeometry(
  reader: ReaderRuntime,
  isCurrent: () => boolean,
): Promise<readonly { readonly viewRect: readonly number[]; readonly rotation: number }[]> {
  const view = (reader as NativeReaderRuntime)._internalReader?._primaryView;
  const pdf = (view?._iframeWindow as NativePdfWindow | undefined)?.PDFViewerApplication
    ?.pdfDocument;
  const count = pdf?.numPages;
  if (
    !isCurrent() ||
    !pdf?.getPage ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1
  )
    throw new Error('PDF source geometry unavailable');
  const pages: { readonly viewRect: readonly number[]; readonly rotation: number }[] = [];
  for (let index = 0; index < count; index++) {
    if (!isCurrent()) throw new Error('Document analysis cancelled');
    const page = await pdf.getPage(index + 1);
    // Content-realm PDFPageProxy getters can be opaque to Chrome. The native
    // data-only page info preserves the same source geometry across this seam.
    const viewRect = page.view ?? page._pageInfo?.view;
    if (!isCurrent() || !viewRect) throw new Error('PDF source geometry unavailable');
    pages.push({ viewRect, rotation: page.rotate ?? page._pageInfo?.rotate ?? 0 });
  }
  return pages;
}
