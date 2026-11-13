import { record } from '../../document-analysis/contracts';
import { CleanupFailure } from '../../core/cleanup';
import { cloneInto } from '../../platform/cross-compartment';
import type { ReaderEventRuntime } from '../../reader/types';
import type { ReaderRuntime } from './contracts';
import {
  readerIsClosed,
  readerTabIsActive,
  readerWindow,
  registerReaderEvent,
  unregisterReaderEvent,
} from './host';
import { readerPresentationView } from './presentation';
import { projectNativeReference, referenceLocation } from './references';
import type { NativePdfWindow, NativeReaderRuntime } from './private-types';
import type {
  ReaderReferenceInteractionCallbacks,
  ReaderReferenceInteractionContext,
} from './reference-interaction-contracts';
import type { ReaderReferenceEntry, ReaderReferenceLocation } from './reference-contracts';

/** Observe native UI without intercepting PDF pointer, link, selection or navigation events. */
export function observeReaderReferenceInteractions(
  reader: ReaderRuntime,
  pluginID: string,
  callbacks: ReaderReferenceInteractionCallbacks,
): () => void {
  const native = reader as NativeReaderRuntime;
  let disposed = false;
  let observer: MutationObserver | undefined;
  let uiWindow: Window | undefined;
  let uiDocument: Document | undefined;
  let toolbar: { element: Element; mount: HTMLElement; cleanup?: () => void } | undefined;
  const slots = new Map<
    boolean,
    {
      popup: unknown;
      element: Element;
      rows: Element[];
      current: () => boolean;
      cleanups: Array<() => void>;
    }
  >();
  let registered = false;
  let menuGeneration = 0;

  function activePrimary(): boolean | undefined {
    const internal = native._internalReader;
    if (!internal) return undefined;
    if (internal._lastView) {
      const last = internal._lastView;
      const primary =
        last === readerPresentationView(reader, true) || last === internal._primaryView;
      const secondary =
        last === readerPresentationView(reader, false) || last === internal._secondaryView;
      return primary !== secondary ? primary : undefined;
    }
    return internal._lastViewPrimary ?? internal._state?.primary;
  }
  function source(primary: boolean) {
    const internal = native._internalReader;
    const view = readerPresentationView(reader, primary);
    const window = view?._iframeWindow;
    const pdfView = primary ? internal?._primaryView : internal?._secondaryView;
    const pdfWindow = pdfView?._iframeWindow as NativePdfWindow | undefined;
    const pdf = pdfWindow?.PDFViewerApplication?.pdfDocument;
    const pdfDocument = pdfWindow?.document;
    const document = window?.document;
    const owner = uiWindow;
    const ownerDocument = uiDocument;
    const itemID = reader.itemID;
    const container = primary ? internal?._primaryViewContainer : internal?._secondaryViewContainer;
    const paneSelector = primary ? '#reader-ui .primary-view' : '#reader-ui .secondary-view';
    const pane = ownerDocument?.querySelector(paneSelector);
    if (
      !internal ||
      !view ||
      !window ||
      !pdfView ||
      !pdfWindow ||
      !pdf ||
      !owner ||
      !ownerDocument ||
      !container ||
      !container.isConnected ||
      !pane ||
      !pane.isConnected
    )
      return null;
    let retired = false;
    return {
      window,
      owner,
      view,
      current: () => {
        if (retired) return false;
        try {
          retired =
            disposed ||
            readerIsClosed(reader) ||
            reader.itemID !== itemID ||
            native._internalReader !== internal ||
            readerWindow(reader) !== owner ||
            owner.document !== ownerDocument ||
            ownerDocument.querySelector(paneSelector) !== pane ||
            !pane.isConnected ||
            readerPresentationView(reader, primary) !== view ||
            view._iframeWindow !== window ||
            window.document !== document ||
            (primary ? internal._primaryView : internal._secondaryView) !== pdfView ||
            pdfView._iframeWindow !== pdfWindow ||
            (primary ? internal._primaryViewContainer : internal._secondaryViewContainer) !==
              container ||
            !container.isConnected ||
            pdfWindow.document !== pdfDocument ||
            pdfWindow.PDFViewerApplication?.pdfDocument !== pdf;
        } catch {
          retired = true;
        }
        return !retired;
      },
    };
  }

  function popupState(primary: boolean): unknown {
    const state = native._internalReader?._state;
    return primary ? state?.primaryViewOverlayPopup : state?.secondaryViewOverlayPopup;
  }

  function clearSlot(primary: boolean): void {
    const slot = slots.get(primary);
    if (!slot) return;
    slots.delete(primary);
    const failure = new CleanupFailure();
    for (const cleanup of slot.cleanups.reverse()) failure.run(cleanup);
    failure.rethrow();
  }

  function clearToolbar(): void {
    const old = toolbar;
    toolbar = undefined;
    if (!old) return;
    try {
      old.cleanup?.();
    } finally {
      old.mount.remove();
    }
  }

  function refresh(): void {
    if (disposed || !uiWindow || !uiDocument) return;
    if (
      readerWindow(reader) !== uiWindow ||
      uiWindow.document !== uiDocument ||
      readerIsClosed(reader)
    ) {
      dispose();
      return;
    }
    const bar = uiDocument.querySelector('.toolbar')?.querySelector('.custom-sections');
    if (toolbar && (toolbar.element !== bar || !toolbar.mount.isConnected)) clearToolbar();
    if (bar && !toolbar) {
      const mount = uiDocument.createElement('span');
      bar.appendChild(mount);
      const lease = { element: bar, mount, cleanup: undefined as (() => void) | undefined };
      toolbar = lease;
      try {
        const cleanup = callbacks.onToolbar({
          uiWindow,
          mount,
          isCurrent: () =>
            !disposed &&
            toolbar === lease &&
            mount.isConnected &&
            readerWindow(reader) === uiWindow &&
            uiWindow?.document === uiDocument,
        });
        if (typeof cleanup === 'function') lease.cleanup = cleanup;
      } catch (error) {
        clearToolbar();
        throw error;
      }
    }
    for (const primary of [true, false]) {
      const state = popupState(primary);
      const popup = record(state);
      const parent = uiDocument.querySelector(
        primary ? '#reader-ui .primary-view' : '#reader-ui .secondary-view',
      );
      const element = parent?.querySelector('.view-popup.citation-popup');
      const rows = element
        ? Array.from<HTMLElement>(element.querySelectorAll<HTMLElement>('.reference-row'))
        : [];
      const existing = slots.get(primary);
      if (
        existing &&
        (!existing.current() ||
          existing.popup !== state ||
          existing.element !== element ||
          existing.rows.length !== rows.length ||
          existing.rows.some((row, i) => row !== rows[i]) ||
          !existing.element.isConnected)
      )
        clearSlot(primary);
      if (
        slots.has(primary) ||
        popup?.type !== 'citation' ||
        !element ||
        !Array.isArray(popup.references) ||
        rows.length !== popup.references.length ||
        !rows.length
      )
        continue;
      const captured = source(primary);
      const position = referenceLocation(popup.position);
      if (!captured || !position || !captured.current()) continue;
      // React reuses rows by index. Project into our realm and verify native text
      // before binding; content-owned array methods cannot carry privileged entries.
      const entries: ReaderReferenceEntry[] = [];
      let matches = true;
      for (let index = 0; index < popup.references.length; index++) {
        const value = popup.references[index];
        const entry = projectNativeReference(value);
        const chars = record(value)?.chars;
        if (!entry || !Array.isArray(chars)) {
          matches = false;
          break;
        }
        let text = '';
        for (let i = 0; i < chars.length; i++) {
          const char = record(chars[i]);
          if (char?.ignorable) continue;
          text +=
            (typeof char?.c === 'string' ? char.c : '') +
            (char?.spaceAfter || (char?.lineBreakAfter && i !== chars.length - 1) ? ' ' : '');
        }
        const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
        if (normalize(text) !== normalize(rows[index].textContent ?? '')) {
          matches = false;
          break;
        }
        entries.push(entry);
      }
      if (!matches) continue;
      const slot = {
        popup: state,
        element,
        rows,
        current: captured.current,
        cleanups: [] as Array<() => void>,
      };
      slots.set(primary, slot);
      try {
        rows.forEach((row, index) => {
          const mount = uiDocument!.createElement('span');
          row.appendChild(mount);
          const isCurrent = () =>
            captured.current() &&
            popupState(primary) === state &&
            slots.get(primary) === slot &&
            element.isConnected &&
            row.isConnected &&
            mount.isConnected;
          const context: ReaderReferenceInteractionContext = {
            window: captured.window,
            uiWindow: captured.owner,
            position,
            references: [entries[index] as ReaderReferenceEntry],
            anchorRect: () => {
              if (!isCurrent()) return null;
              const rect = row.getBoundingClientRect();
              return [rect.left, rect.top, rect.right, rect.bottom];
            },
            isCurrent,
            isSourceCurrent: captured.current,
            ...(typeof native._internalReader?._handleOverlayPopupClose === 'function'
              ? {
                  dismissPreview: () => {
                    if (isCurrent()) native._internalReader!._handleOverlayPopupClose!(primary);
                  },
                }
              : {}),
          };
          slot.cleanups.push(() => mount.remove());
          const cleanup = callbacks.onCitationPopup({ context, mount });
          if (typeof cleanup === 'function') slot.cleanups.push(cleanup);
        });
      } catch (error) {
        clearSlot(primary);
        throw error;
      }
    }
  }

  const onMenu = (event: ReaderEventRuntime): void => {
    if (disposed || event.reader !== reader || !uiWindow || !uiDocument) return;
    const generation = ++menuGeneration;
    const primary = activePrimary();
    if (primary === undefined) return;
    const captured = source(primary);
    if (!captured || !captured.current()) return;
    const nativeEvent = event as unknown as {
      params?: { x?: number; y?: number; position?: unknown; overlay?: unknown };
      append?: (item: { label: string; disabled?: boolean; onCommand: () => void }) => void;
    };
    if (!nativeEvent.append) return;
    const params = nativeEvent.params;
    const overlay = record(params?.overlay);
    const position: ReaderReferenceLocation | null = referenceLocation(params?.position);
    const references: ReaderReferenceEntry[] = [];
    if (overlay?.type === 'citation' && Array.isArray(overlay.references)) {
      for (const value of overlay.references) {
        const entry = projectNativeReference(value);
        if (entry) references.push(entry);
      }
    }
    const x = params?.x,
      y = params?.y;
    const current = () =>
      generation === menuGeneration &&
      captured.current() &&
      activePrimary() === primary &&
      (!reader.tabID || readerTabIsActive(reader));
    const context: ReaderReferenceInteractionContext = {
      window: captured.window,
      uiWindow: captured.owner,
      position,
      references,
      anchorRect: () =>
        current() &&
        typeof x === 'number' &&
        typeof y === 'number' &&
        Number.isFinite(x) &&
        Number.isFinite(y)
          ? [x, y, x, y]
          : null,
      isCurrent: current,
      isSourceCurrent: captured.current,
    };
    let accepting = true;
    try {
      callbacks.onContextMenu({
        context,
        append: (items) => {
          if (!accepting || !current()) return;
          for (const item of items)
            nativeEvent.append!({
              label: item.label,
              disabled: item.disabled,
              onCommand: () => {
                if (current()) item.onCommand();
              },
            });
        },
      });
    } finally {
      accepting = false;
    }
  };

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const failure = new CleanupFailure();
    failure.run(() => observer?.disconnect());
    failure.run(() => uiWindow?.removeEventListener('unload', dispose));
    if (registered) failure.run(() => unregisterReaderEvent('createViewContextMenu', onMenu));
    failure.run(() => clearSlot(true));
    failure.run(() => clearSlot(false));
    failure.run(clearToolbar);
    failure.rethrow();
  }

  try {
    uiWindow = readerWindow(reader);
    uiDocument = uiWindow?.document;
    if (!uiWindow || !uiDocument) return dispose;
    registered = true;
    registerReaderEvent('createViewContextMenu', onMenu, pluginID);
    const Observer = (uiWindow as Window & typeof globalThis).MutationObserver;
    observer = new Observer(refresh);
    observer.observe(
      uiDocument.documentElement,
      cloneInto(
        {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden'],
        },
        uiWindow,
      ),
    );
    uiWindow.addEventListener('unload', dispose, { once: true });
    refresh();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
