import {
  cloneInto,
  cloneIntoWithReflectors,
  nativeObjectIdentity,
} from '../../platform/cross-compartment';
import { documentRect, type DocumentRect } from '../../document-analysis/contracts';
import type { ReaderRuntime } from './contracts';
import type { ReaderLinkPosition } from '../../reader/types';
import type { NativePdfWindow, NativeReaderRuntime, PdfRenderTaskRuntime } from './private-types';

export interface ReaderRegionPreview {
  readonly dataURL: string;
  readonly width: number;
  readonly height: number;
}

/** Bounded raster geometry; member rectangles also define the mask, never just an enclosing crop. */
export function regionPreviewPlan(rects: readonly DocumentRect[]) {
  if (!rects.length || rects.length > 256 || rects.some((rect) => !documentRect(rect)))
    throw new Error('Invalid preview geometry');
  const left = Math.min(...rects.map((r) => r[0])),
    top = Math.min(...rects.map((r) => r[1]));
  const width = Math.max(...rects.map((r) => r[2])) - left,
    height = Math.max(...rects.map((r) => r[3])) - top;
  const scale = Math.min(2, 1798 / width, 1798 / height, Math.sqrt(1_990_000 / (width * height)));
  return {
    left,
    top,
    scale,
    width: Math.max(1, Math.ceil(width * scale)),
    height: Math.max(1, Math.ceil(height * scale)),
    members: rects.map(
      (r) =>
        [
          Math.max(0, Math.floor((r[0] - left) * scale)),
          Math.max(0, Math.floor((r[1] - top) * scale)),
          Math.ceil((r[2] - left) * scale),
          Math.ceil((r[3] - top) * scale),
        ] as DocumentRect,
    ),
  };
}

/** Render the source PDF into detached canvases without scrolling, zooming or annotating either Reader pane. */
export async function readerRegionPreview(
  reader: ReaderRuntime,
  location: ReaderLinkPosition,
  signal: AbortSignal,
): Promise<ReaderRegionPreview> {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  const window = internal?._primaryView?._iframeWindow as NativePdfWindow | undefined;
  const pdf = window?.PDFViewerApplication?.pdfDocument;
  const current = (): void => {
    if (
      signal.aborted ||
      (reader as NativeReaderRuntime)._internalReader !== internal ||
      window?.PDFViewerApplication?.pdfDocument !== pdf
    )
      throw new Error('Reader preview retired');
  };
  current();
  if (
    !window ||
    !pdf?.getPage ||
    !Number.isInteger(location.pageIndex) ||
    location.pageIndex < 0 ||
    location.pageIndex >= (pdf.numPages ?? 0) ||
    !location.rects.length ||
    location.rects.length > 256
  )
    throw new Error('PDF preview unavailable');
  const page = nativeObjectIdentity(await pdf.getPage(location.pageIndex + 1));
  current();
  const viewport = page.getViewport(cloneInto({ scale: 1 }, window));
  const rects = location.rects.map((rect): DocumentRect => {
    if (!documentRect(rect)) throw new Error('Invalid preview source rectangle');
    const r = viewport.convertToViewportRectangle?.(cloneInto(rect, window));
    if (!r || r.length !== 4) throw new Error('PDF preview transform unavailable');
    const result: DocumentRect = [
      Math.min(r[0], r[2]),
      Math.min(r[1], r[3]),
      Math.max(r[0], r[2]),
      Math.max(r[1], r[3]),
    ];
    if (
      !documentRect(result) ||
      result[0] < -0.01 ||
      result[1] < -0.01 ||
      result[2] > viewport.width + 0.01 ||
      result[3] > viewport.height + 0.01
    )
      throw new Error('Preview lies outside its PDF page');
    return result;
  });
  const plan = regionPreviewPlan(rects);
  const canvas = window.document.createElement('canvas'),
    masked = window.document.createElement('canvas');
  canvas.width = masked.width = plan.width;
  canvas.height = masked.height = plan.height;
  let task: PdfRenderTaskRuntime | undefined;
  const abort = (): void => task?.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const context = canvas.getContext('2d'),
      output = masked.getContext('2d');
    if (!context || !output || !page.render) throw new Error('PDF canvas unavailable');
    current();
    task = page.render(
      cloneIntoWithReflectors(
        {
          canvasContext: context,
          viewport: page.getViewport(cloneInto({ scale: plan.scale }, window)),
          transform: [1, 0, 0, 1, -plan.left * plan.scale, -plan.top * plan.scale],
          annotationMode: 0,
        },
        window,
      ),
    );
    await task.promise;
    current();
    output.fillStyle = 'white';
    output.fillRect(0, 0, plan.width, plan.height);
    for (const [x0, y0, x1, y1] of plan.members)
      output.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    return { dataURL: masked.toDataURL('image/png'), width: plan.width, height: plan.height };
  } finally {
    signal.removeEventListener('abort', abort);
    canvas.width = canvas.height = masked.width = masked.height = 0;
  }
}
