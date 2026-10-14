import { cloneInto } from '../../platform/cross-compartment';
import type { ReaderLinkOverlay, ReaderLinkPosition } from '../../reader/types';
import type { ReaderRuntime, ReaderViewRuntime } from './contracts';
import type { NativeReaderViewRuntime } from './private-types';
import { readerWindow } from './host';

function isPosition(value: unknown): value is ReaderLinkPosition {
  if (!value || typeof value !== 'object') return false;
  const position = value as { readonly pageIndex?: unknown; readonly rects?: unknown };
  return (
    Number.isInteger(position.pageIndex) &&
    Array.isArray(position.rects) &&
    position.rects.length > 0 &&
    position.rects.every(
      (rect) => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite),
    )
  );
}
function isLink(value: unknown): value is ReaderLinkOverlay {
  if (!value || typeof value !== 'object') return false;
  const overlay = value as {
    readonly type?: unknown;
    readonly position?: unknown;
    readonly destinationPosition?: unknown;
    readonly references?: unknown;
    readonly url?: unknown;
  };
  if (!isPosition(overlay.position)) return false;
  if (overlay.type === 'internal-link') return isPosition(overlay.destinationPosition);
  if (overlay.type === 'citation') {
    const references = overlay.references;
    if (!Array.isArray(references) || !references.length) return false;
    const first = references[0];
    return !!first && typeof first === 'object' && isPosition(first.position);
  }
  return overlay.type === 'external-link' && typeof overlay.url === 'string' && !!overlay.url;
}

export function readerPositionClientRect(
  view: ReaderViewRuntime,
  position: ReaderLinkPosition,
): readonly number[] | null {
  const native = view as NativeReaderViewRuntime;
  if (typeof native.getClientRectForPopup !== 'function')
    throw new Error('PDF client-rectangle conversion unavailable');
  const rect = native.getClientRectForPopup(position);
  return rect?.length === 4 && rect.every(Number.isFinite) ? rect : null;
}
export function readerLinkClientRect(
  view: ReaderViewRuntime,
  overlay: ReaderLinkOverlay,
): readonly number[] | null {
  const rect = readerPositionClientRect(view, overlay.position);
  return rect && rect[2]! > rect[0]! && rect[3]! > rect[1]! ? rect : null;
}

/** Native overlays retain exact source/destination identity; discovery performs no navigation. */
export function readerVisibleLinks(
  view: ReaderViewRuntime,
  window: Window,
): readonly {
  readonly overlay: ReaderLinkOverlay;
  readonly rect: readonly number[];
}[] {
  const native = view as NativeReaderViewRuntime;
  const pages = native._pdfPages;
  if (!pages || typeof pages !== 'object')
    throw new Error(`PDF page map unavailable (${typeof pages})`);
  if (typeof native.getClientRectForPopup !== 'function')
    throw new Error('PDF client-rectangle conversion unavailable');
  const width = window.innerWidth || window.document.documentElement.clientWidth;
  const height = window.innerHeight || window.document.documentElement.clientHeight;
  const seen = new Set<string>();
  const result: { overlay: ReaderLinkOverlay; rect: readonly number[] }[] = [];
  for (const page of Object.values(pages)) {
    if (!Array.isArray(page?.overlays)) continue;
    for (const overlay of page.overlays) {
      if (!isLink(overlay)) continue;
      const rect = readerLinkClientRect(view, overlay);
      if (!rect || rect[2]! <= 0 || rect[3]! <= 0 || rect[0]! >= width || rect[1]! >= height)
        continue;
      const key = `${overlay.position.pageIndex}:${overlay.position.rects
        .map((source) => source.map((value) => Math.round(value * 10)).join(','))
        .join(';')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ overlay, rect });
    }
  }
  return result;
}

export function openReaderExternalLink(view: ReaderViewRuntime, url: string): void | Promise<void> {
  const native = view as NativeReaderViewRuntime;
  if (typeof native._onOpenLink !== 'function') throw new Error('missing external open-link');
  return native._onOpenLink(url);
}
export function prepareReaderLinkLocation(
  reader: ReaderRuntime,
  position: ReaderLinkPosition,
): { readonly position: ReaderLinkPosition } {
  const window = readerWindow(reader);
  if (!window) throw new Error('reader window unavailable');
  return cloneInto({ position }, window);
}
export function navigateReaderLink(
  view: ReaderViewRuntime,
  location: { readonly position: ReaderLinkPosition },
): void | Promise<void> {
  const native = view as NativeReaderViewRuntime;
  if (typeof native.navigate !== 'function') throw new Error('missing internal navigation');
  return native.navigate(location);
}
