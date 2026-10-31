import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime, NativeReaderViewRuntime } from './private-types';

export function readerPresentationView(
  reader: ReaderRuntime,
  primary: boolean,
): NativeReaderViewRuntime | undefined {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  const overlay = primary ? internal?._primarySDTView : internal?._secondarySDTView;
  const enabled = primary
    ? internal?._state?.primaryReadingModeEnabled
    : internal?._state?.secondaryReadingModeEnabled;
  return (
    overlay ?? (enabled ? undefined : primary ? internal?._primaryView : internal?._secondaryView)
  );
}

/** Resolve each split's displayed presentation, including the native Reading Mode overlay. */
export function readerPresentationViews(reader: ReaderRuntime): readonly NativeReaderViewRuntime[] {
  return [readerPresentationView(reader, true), readerPresentationView(reader, false)].filter(
    (view): view is NativeReaderViewRuntime => !!view,
  );
}

interface ViewLease {
  readonly view: NativeReaderViewRuntime;
  readonly current: () => boolean;
}
const leases = new WeakMap<Window, ViewLease>();

/** Bind private native capabilities to one exact presentation; cleanup cannot retire a successor. */
export function leaseReaderPresentation(
  window: Window,
  view: NativeReaderViewRuntime,
  current: () => boolean,
): () => void {
  const lease = { view, current };
  leases.set(window, lease);
  return () => {
    if (leases.get(window) === lease) leases.delete(window);
  };
}

export function currentReaderPresentation(window: Window): NativeReaderViewRuntime | null {
  const lease = leases.get(window);
  return lease?.current() ? lease.view : null;
}

export function readerReadingMode(window: Window): boolean {
  return window.document.getElementById?.('sdt-content')?.id === 'sdt-content';
}
