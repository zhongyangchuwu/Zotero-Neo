import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime } from './private-types';
import { readerPresentationView } from './presentation';
import { readerViewIsLive, readerViewWindow } from './host';

/** Bind the event annotation by identity to exactly one native split popup and presentation. */
export function readerSelectionPopupSource(
  reader: ReaderRuntime,
  annotation: object,
): { readonly window: Window; readonly isCurrent: () => boolean } | null {
  const internal = (reader as NativeReaderRuntime)._internalReader;
  const state = internal?._state;
  if (!state) return null;
  const primary = state.primaryViewSelectionPopup?.annotation === annotation;
  const secondary = state.secondaryViewSelectionPopup?.annotation === annotation;
  if (primary === secondary) return null;
  const selectionPopup = primary
    ? state.primaryViewSelectionPopup
    : state.secondaryViewSelectionPopup;
  const view = readerPresentationView(reader, primary);
  const window = view && readerViewWindow(view);
  if (!view || !window || !readerViewIsLive(reader, view, window)) return null;
  const document = window.document;
  return {
    window,
    isCurrent: () => {
      const current = internal._state;
      const popup = primary
        ? current?.primaryViewSelectionPopup
        : current?.secondaryViewSelectionPopup;
      const other = primary
        ? current?.secondaryViewSelectionPopup
        : current?.primaryViewSelectionPopup;
      return (
        popup === selectionPopup &&
        popup?.annotation === annotation &&
        other?.annotation !== annotation &&
        window.document === document &&
        readerPresentationView(reader, primary) === view &&
        readerViewIsLive(reader, view, window)
      );
    },
  };
}
