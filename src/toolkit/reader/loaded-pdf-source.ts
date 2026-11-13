import type { ReaderRuntime } from './contracts';
import type { NativePdfWindow, NativeReaderRuntime } from './private-types';
import { readerPresentationView } from './presentation';
import { readerViewWindow } from './host';
import { pdfBytesFingerprint } from '../../platform/pdf-fingerprint';
import { nativeObjectIdentity } from '../../platform/cross-compartment';

const fingerprints = new WeakMap<object, Promise<string>>();

export interface ReaderLoadedPDFSource {
  readonly identity: object;
  readonly fingerprint: Promise<string>;
}

/** Resolve the original loaded PDF behind this split, including a Reading Mode presentation. */
export function readerLoadedPDFSource(
  reader: ReaderRuntime,
  window: Window,
): ReaderLoadedPDFSource | null {
  const primaryView = readerPresentationView(reader, true);
  const secondaryView = readerPresentationView(reader, false);
  const primary = !!primaryView && readerViewWindow(primaryView) === window;
  const secondary = !!secondaryView && readerViewWindow(secondaryView) === window;
  if (primary === secondary) return null;
  const internal = (reader as NativeReaderRuntime)._internalReader;
  const pdfView = primary ? internal?._primaryView : internal?._secondaryView;
  const pdfWindow = pdfView && (readerViewWindow(pdfView) as NativePdfWindow | null);
  const document = pdfWindow?.PDFViewerApplication?.pdfDocument;
  if (!document?.getData) return null;
  let fingerprint = fingerprints.get(document);
  if (!fingerprint) {
    fingerprint = (async () => {
      const data = nativeObjectIdentity(document.getData!());
      const bytes = nativeObjectIdentity(await data);
      return pdfBytesFingerprint(bytes);
    })();
    fingerprints.set(document, fingerprint);
    void fingerprint.catch(() => {
      fingerprints.delete(document);
    });
  }
  return { identity: document, fingerprint };
}
