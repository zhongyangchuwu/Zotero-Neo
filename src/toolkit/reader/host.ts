import type { MainWindow } from '../../core/contracts';
import type { ReaderEventRuntime } from '../../reader/types';
import type { ReaderRuntime, ReaderViewRuntime } from './contracts';
import type { NativeReaderRuntime, NativeReaderViewRuntime } from './private-types';
import { isDeadObject } from '../../platform/cross-compartment';
import { readerPresentationViews } from './presentation';

export type ReaderEventName = 'renderToolbar' | 'renderTextSelectionPopup';
export type ReaderEventListener = (event: ReaderEventRuntime) => void;

interface ReaderService {
  readonly _readers?: readonly ReaderRuntime[] | ReadonlyMap<unknown, ReaderRuntime>;
  getByTabID?(tabID: string): ReaderRuntime | null | undefined;
  registerEventListener(
    name: ReaderEventName,
    listener: ReaderEventListener,
    pluginID: string,
  ): void;
  unregisterEventListener(name: ReaderEventName, listener: ReaderEventListener): void;
}

interface Tab {
  readonly id?: string;
  readonly type?: string;
}

type OwnerWindow = MainWindow & {
  readonly Zotero_Tabs?: {
    readonly selectedID?: string;
    readonly _tabs?: readonly Tab[];
    readonly tabs?: readonly Tab[];
  };
};

function readerService(): ReaderService {
  // Native host service shape is confined to Toolkit.
  const host = Zotero as unknown as { readonly Reader: ReaderService };
  return host.Reader;
}

export function registerReaderEvent(
  name: ReaderEventName,
  listener: ReaderEventListener,
  pluginID: string,
): void {
  readerService().registerEventListener(name, listener, pluginID);
}

export function unregisterReaderEvent(name: ReaderEventName, listener: ReaderEventListener): void {
  readerService().unregisterEventListener(name, listener);
}

export interface ReaderInventory {
  readonly readers: readonly ReaderRuntime[];
  /** Only the native array/map inventory authorizes retirement of absent readers. */
  readonly authoritative: boolean;
}

export function readerInventory(
  window: MainWindow,
  onStage?: (stage: 'inventory' | 'tabs') => void,
): ReaderInventory {
  onStage?.('inventory');
  const service = readerService();
  const all = service._readers;
  const authoritative = Array.isArray(all) || all instanceof Map;
  const readers: ReaderRuntime[] = [];
  if (Array.isArray(all)) readers.push(...all);
  else if (all instanceof Map) readers.push(...all.values());
  // Keep the existing tab fallback, including when an authoritative inventory is empty.
  if (!readers.length) {
    onStage?.('tabs');
    // Tab discovery is native; the window itself is not wrapped.
    const owner = window as OwnerWindow;
    const tabs = owner.Zotero_Tabs;
    for (const tab of tabs?._tabs ?? tabs?.tabs ?? []) {
      if (!tab.id) continue;
      const reader = service.getByTabID?.(tab.id);
      if (reader) readers.push(reader);
    }
  }
  return { readers, authoritative };
}

export function readerByTabID(tabID: string): ReaderRuntime | null {
  return readerService().getByTabID?.(tabID) ?? null;
}

export function readerSelectedTabID(window: MainWindow): string | undefined {
  const owner = window as OwnerWindow;
  return owner.Zotero_Tabs?.selectedID;
}

export function readerInstanceID(reader: ReaderRuntime): string | undefined {
  // Opaque handles are the actual host objects.
  const native = reader as NativeReaderRuntime;
  return native._instanceID;
}

export function readerOwnerWindow(reader: ReaderRuntime): MainWindow | undefined {
  const native = reader as NativeReaderRuntime;
  return native._window;
}

/** Uses a standalone Reader's actual opener, never an unrelated global Main window. */
export function readerMainWindow(reader: ReaderRuntime): MainWindow | undefined {
  const owner = readerOwnerWindow(reader);
  if (!owner || isDeadObject(owner) || owner.closed) return undefined;
  if (owner.location?.href !== 'chrome://zotero/content/reader.xhtml') return owner;
  const opener = owner.opener as MainWindow | null;
  return opener && !isDeadObject(opener) && !opener.closed ? opener : undefined;
}

export function readerWindow(reader: ReaderRuntime): Window | undefined {
  const native = reader as NativeReaderRuntime;
  return native._iframeWindow;
}

export function readerPrimaryWindow(reader: ReaderRuntime): Window | undefined {
  const native = reader as NativeReaderRuntime;
  return native._internalReader?._primaryView?._iframeWindow;
}

export function readerIsClosed(reader: ReaderRuntime): boolean {
  const native = reader as NativeReaderRuntime;
  return native._isTabClosed === true;
}

export function readerViewForWindow(
  reader: ReaderRuntime,
  window: Window,
): ReaderViewRuntime | null {
  return readerPresentationViews(reader).find((view) => view._iframeWindow === window) ?? null;
}

export function readerViewIsLive(
  reader: ReaderRuntime,
  view: ReaderViewRuntime,
  window?: Window,
): boolean {
  const nativeView = view as NativeReaderViewRuntime;
  return (
    readerPresentationViews(reader).includes(nativeView) &&
    (window === undefined || nativeView._iframeWindow === window)
  );
}

export function readerViewWindow(view: ReaderViewRuntime): Window | undefined {
  const native = view as NativeReaderViewRuntime;
  return native._iframeWindow;
}

/** Exact owner/tab eligibility used by native producer receipts. */
export function readerTabIsActive(reader: ReaderRuntime): boolean {
  const native = reader as NativeReaderRuntime;
  const tabID = reader.tabID;
  const owner = native._window as OwnerWindow | undefined;
  const tabs = owner?.Zotero_Tabs;
  if (!tabID || !tabs || tabs.selectedID !== tabID || native._isTabClosed === true) return false;
  const tab = tabs._tabs?.find((candidate) => candidate.id === tabID);
  return !tabs._tabs || (!!tab && (tab.type === 'reader' || tab.type === 'reader-unloaded'));
}
