import { cloneInto } from './cross-compartment';

/** Accept only bounded PNGs produced by our source renderer; never fetch an image URL. */
export function pngBytes(dataURL: string): Uint8Array<ArrayBuffer> {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u.test(dataURL) ||
    dataURL.length > 12 * 1024 * 1024
  )
    throw new Error('Invalid or oversized source image');
  const binary = Zotero.getMainWindow().atob(dataURL.slice('data:image/png;base64,'.length));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
export function pngBlob(dataURL: string): Blob {
  const window = Zotero.getMainWindow() as unknown as Window & { readonly Blob: typeof Blob };
  const bytes = pngBytes(dataURL);
  return new window.Blob(
    cloneInto([bytes.buffer], window),
    cloneInto({ type: 'image/png' }, window),
  );
}
