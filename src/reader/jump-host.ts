import type { MainWindow, ReaderJumpLocation, ReaderJumpPosition } from '../core/contracts';
import { cloneInto } from '../platform/cross-compartment';
import type {
  ItemRuntime,
  PdfViewerRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
  ReaderViewRuntime,
} from './types';

interface ReaderTabsRuntime {
  readonly selectedID?: string;
  readonly _tabs?: readonly ReaderTabRuntime[];
  getTabIDByItemID?(itemID: number): string | undefined;
  select?(tabID: string, reopening?: boolean, options?: unknown): void;
}

interface ReaderTabRuntime {
  readonly id?: string;
  readonly type?: string;
  readonly data?: { readonly itemID?: number };
}

type ReaderWindowRuntime = MainWindow & {
  readonly Zotero_Tabs?: ReaderTabsRuntime;
  focus?(): void;
};

interface ReaderAttachmentRuntime extends ItemRuntime {
  readonly deleted?: boolean;
  readonly isInTrash?: () => boolean;
  isAttachment?(): boolean;
  getFilePathAsync?(): Promise<string | false>;
}

interface ReaderFileRuntime {
  exists?(): boolean;
  isReadable?(): boolean;
}

interface ReaderServiceRuntime {
  readonly _readers?: readonly ReaderRuntime[];
  getByTabID?(tabID: string): ReaderRuntime | null | undefined;
  open?(
    itemID: number,
    location?: unknown,
    options?: {
      readonly allowDuplicate?: boolean;
      readonly openInBackground?: boolean;
    },
  ): Promise<ReaderRuntime | void>;
}

interface ReaderHostRuntime {
  readonly Reader: ReaderServiceRuntime;
  readonly Items: { get(id: number): ReaderAttachmentRuntime | null | false };
  readonly File?: { pathToFile(path: string): ReaderFileRuntime };
  getMainWindow?(): MainWindow | null;
}

interface NativePdfPosition {
  readonly pageIndex: number;
  readonly top: number;
  readonly left: number;
}

const RESTORE_TIMEOUT_MS = 10_000;
const RESTORE_POLL_MS = 50;

function hostRuntime(): ReaderHostRuntime {
  return Zotero as unknown as ReaderHostRuntime;
}

function isCurrentSafely(isCurrent: () => boolean): boolean {
  try {
    return isCurrent();
  } catch {
    return false;
  }
}

function isReaderTabType(type: string | undefined): boolean {
  return type === 'reader' || type === 'reader-unloaded';
}

function parseNativePosition(value: unknown): NativePdfPosition | null {
  if (!value || typeof value !== 'object' || !('dest' in value)) return null;
  const destination = value.dest;
  if (!Array.isArray(destination) || destination.length < 4) return null;
  const pageIndex = destination[0];
  const mode = destination[1];
  const left = destination[2];
  const top = destination[3];
  if (
    typeof pageIndex !== 'number' ||
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    !mode ||
    typeof mode !== 'object' ||
    !('name' in mode) ||
    mode.name !== 'XYZ' ||
    typeof left !== 'number' ||
    !Number.isFinite(left) ||
    typeof top !== 'number' ||
    !Number.isFinite(top)
  )
    return null;
  return { pageIndex, top, left };
}

function parseViewerPosition(location: PdfViewerRuntime['_location']): NativePdfPosition | null {
  if (
    !location ||
    !Number.isInteger(location.pageNumber) ||
    location.pageNumber < 1 ||
    !Number.isFinite(location.top) ||
    !Number.isFinite(location.left)
  )
    return null;
  return { pageIndex: location.pageNumber - 1, top: location.top, left: location.left };
}

function sameNativePosition(left: NativePdfPosition, right: ReaderJumpPosition): boolean {
  return (
    left.pageIndex === right.pageIndex &&
    Math.abs(left.top - right.top) < 1 &&
    Math.abs(left.left - right.left) < 1
  );
}

function validLocation(location: ReaderJumpLocation): boolean {
  const position = location.position;
  return (
    location.kind === 'reader' &&
    typeof location.tabID === 'string' &&
    location.tabID.length > 0 &&
    typeof location.libraryID === 'number' &&
    Number.isInteger(location.libraryID) &&
    location.libraryID > 0 &&
    typeof location.itemID === 'number' &&
    Number.isInteger(location.itemID) &&
    location.itemID > 0 &&
    (!position ||
      (typeof position.primary === 'boolean' &&
        Number.isInteger(position.pageIndex) &&
        position.pageIndex >= 0 &&
        Number.isFinite(position.top) &&
        Number.isFinite(position.left)))
  );
}

export class ReaderJumpHostAdapter {
  captureJumpLocation(tabID: string, itemID?: number): ReaderJumpLocation | null {
    const reader = hostRuntime().Reader.getByTabID?.(tabID) ?? null;
    if (reader?.itemID !== undefined) {
      if (itemID !== undefined && itemID !== reader.itemID) return null;
      return this.captureReader(reader, tabID);
    }
    return itemID === undefined ? null : this.#identityLocation(tabID, itemID);
  }

  captureReader(
    reader: ReaderRuntime,
    tabID = reader.tabID ?? '',
    requestedView?: ReaderViewRuntime,
    capturedPosition?: ReaderJumpPosition | null,
  ): ReaderJumpLocation | null {
    if (!tabID || reader.itemID === undefined) return null;
    const identity = this.#identityLocation(tabID, reader.itemID);
    if (!identity) return null;
    const view = requestedView ?? this.#activeView(reader);
    if (!view) return identity;
    const position =
      capturedPosition === undefined ? this.captureViewPosition(reader, view) : capturedPosition;
    return position ? { ...identity, position } : identity;
  }

  captureViewPosition(reader: ReaderRuntime, view: ReaderViewRuntime): ReaderJumpPosition | null {
    try {
      const primary = this.#viewPrimary(reader, view);
      if (primary === null) return null;
      const pdfWindow = view._iframeWindow as PdfWindow | undefined;
      const viewer = pdfWindow?.PDFViewerApplication?.pdfViewer;
      viewer?.update?.();
      const position =
        parseViewerPosition(viewer?._location) ??
        parseNativePosition(view._history?._currentLocation);
      return position ? { ...position, primary } : null;
    } catch {
      return null;
    }
  }

  hasViewMoved(
    reader: ReaderRuntime,
    view: ReaderViewRuntime,
    origin: ReaderJumpPosition,
  ): boolean | null {
    const current = this.captureViewPosition(reader, view);
    if (!current) return null;
    return current.primary === origin.primary && sameNativePosition(current, origin) ? false : true;
  }

  captureHardLocation(
    reader: ReaderRuntime,
    view: ReaderViewRuntime,
    location: unknown,
  ): ReaderJumpLocation | null {
    const tabID = reader.tabID;
    if (!tabID || reader.itemID === undefined) return null;
    const identity = this.#identityLocation(tabID, reader.itemID);
    const primary = this.#viewPrimary(reader, view);
    const position = parseNativePosition(location);
    return identity && primary !== null && position
      ? { ...identity, position: { ...position, primary } }
      : null;
  }

  async restoreJumpLocation(
    window: MainWindow,
    location: ReaderJumpLocation,
    isCurrent: () => boolean,
    beforeNavigate: (reader: ReaderRuntime) => void,
  ): Promise<string | null> {
    if (!validLocation(location) || !isCurrentSafely(isCurrent)) return null;
    const deadline = Date.now() + RESTORE_TIMEOUT_MS;
    const owner = window as ReaderWindowRuntime;
    const tabs = owner.Zotero_Tabs;
    if (!tabs?.select) return null;
    let expectedSelectedID = tabs.selectedID;
    const current = (): boolean =>
      Date.now() < deadline && isCurrentSafely(isCurrent) && tabs.selectedID === expectedSelectedID;

    const attachment = this.#availableAttachment(location.itemID, location.libraryID);
    const readable =
      attachment && (await this.#bounded(this.#attachmentReadable(attachment), deadline));
    if (!readable?.value || !current()) return null;

    let reader: ReaderRuntime | null = null;
    let tabID: string | null = null;
    const existing = this.#existingTab(owner, location.itemID);
    if (existing?.reader) {
      reader = existing.reader;
      tabID = existing.tabID;
    } else if (existing?.tabID) {
      tabID = existing.tabID;
      expectedSelectedID = tabID;
      try {
        tabs.select(tabID, false);
      } catch {
        return null;
      }
      if (!current()) return null;
      reader = await this.#waitForReader(owner, location.itemID, tabID, current, deadline);
    } else {
      if (!(await this.#focusOwnerWindow(owner, current, deadline)) || !current()) return null;
      let opening: Promise<ReaderRuntime | void> | undefined;
      try {
        opening = hostRuntime().Reader.open?.(location.itemID, undefined, {
          allowDuplicate: true,
          openInBackground: true,
        });
      } catch {
        return null;
      }
      if (!opening) return null;
      let opened: { readonly value: ReaderRuntime | void } | null;
      try {
        opened = await this.#bounded(opening, deadline);
      } catch {
        return null;
      }
      if (!current()) return null;
      if (opened?.value) {
        reader = await this.#waitForReader(
          owner,
          location.itemID,
          opened.value.tabID,
          current,
          deadline,
          opened.value,
        );
      } else {
        const reopened = this.#existingTab(owner, location.itemID);
        if (reopened?.reader) {
          reader = reopened.reader;
          tabID = reopened.tabID;
        } else if (reopened?.tabID) {
          tabID = reopened.tabID;
          expectedSelectedID = tabID;
          try {
            tabs.select(tabID, false);
          } catch {
            return null;
          }
          reader = await this.#waitForReader(owner, location.itemID, tabID, current, deadline);
        }
      }
      tabID = reader?.tabID ?? tabID;
    }

    if (!reader || !tabID || !this.#readerIsInOwnerTab(reader, owner, tabID, location.itemID))
      return null;
    if (reader._isReaderInitialized !== true) {
      if (!reader._initPromise) return null;
      try {
        const initialized = await this.#bounded(reader._initPromise, deadline);
        if (!initialized || !current() || (reader as ReaderRuntime)._isReaderInitialized !== true)
          return null;
      } catch {
        return null;
      }
    }
    if (!current() || !this.#availableAttachment(location.itemID, location.libraryID)) return null;

    try {
      if (tabs.selectedID !== tabID) {
        expectedSelectedID = tabID;
        tabs.select(tabID, true);
      }
    } catch {
      return null;
    }
    if (!current() || !this.#readerIsInOwnerTab(reader, owner, tabID, location.itemID)) return null;

    let restoredView: ReaderViewRuntime | null = null;
    let restoredPdfWindow: PdfWindow | undefined;
    let restoredTargetIsCurrent = current;
    const position = location.position;
    if (position) {
      const view = await this.#waitForExactView(reader, position.primary, current, deadline);
      if (!view || !current() || !this.#viewIsCurrent(reader, view, position.primary)) return null;
      const pdfWindow = view._iframeWindow as PdfWindow | undefined;
      if (!pdfWindow?.PDFViewerApplication?.pdfViewer || typeof view.navigate !== 'function')
        return null;
      restoredView = view;
      restoredPdfWindow = pdfWindow;
      restoredTargetIsCurrent = () =>
        current() &&
        this.#viewIsCurrent(reader, view, position.primary) &&
        view._iframeWindow === pdfWindow;
      try {
        beforeNavigate(reader);
      } catch {
        return null;
      }
      if (!restoredTargetIsCurrent()) return null;
      try {
        const destination = cloneInto(
          {
            dest: [position.pageIndex, { name: 'XYZ' }, position.left, position.top, null],
          } as const,
          pdfWindow,
        );
        const options = cloneInto({ skipHistory: true }, pdfWindow);
        const navigated = await this.#bounded(
          Promise.resolve(view.navigate(destination, options)),
          deadline,
        );
        if (!navigated || !restoredTargetIsCurrent()) return null;
      } catch {
        return null;
      }
      if (
        !(await this.#waitForPosition(view, position, restoredTargetIsCurrent, deadline)) ||
        !restoredTargetIsCurrent()
      )
        return null;
    }

    if (!current() || !this.#readerIsInOwnerTab(reader, owner, tabID, location.itemID)) return null;
    try {
      if (position) {
        const view = restoredView;
        const pdfWindow = restoredPdfWindow;
        if (!view || !pdfWindow || !restoredTargetIsCurrent()) return null;
        reader._internalReader?.focusView?.(position.primary);
        if (!restoredTargetIsCurrent()) return null;
        view.focus?.();
        if (!restoredTargetIsCurrent()) return null;
        pdfWindow.focus();
        if (!restoredTargetIsCurrent()) return null;
      } else {
        const focused = await this.#bounded(Promise.resolve(reader.focus?.()), deadline);
        if (!focused || !current()) return null;
      }
    } catch {
      return null;
    }
    return current() &&
      restoredTargetIsCurrent() &&
      this.#readerIsInOwnerTab(reader, owner, tabID, location.itemID)
      ? tabID
      : null;
  }

  #viewIsCurrent(reader: ReaderRuntime, view: ReaderViewRuntime, primary: boolean): boolean {
    const currentView = primary
      ? reader._internalReader?._primaryView
      : reader._internalReader?._secondaryView;
    return currentView === view;
  }

  #identityLocation(tabID: string, itemID: number): ReaderJumpLocation | null {
    const item = this.#availableAttachment(itemID);
    if (!item || typeof item.libraryID !== 'number' || !Number.isInteger(item.libraryID))
      return null;
    return { kind: 'reader', tabID, libraryID: item.libraryID, itemID };
  }

  #availableAttachment(itemID: number, libraryID?: number): ReaderAttachmentRuntime | null {
    try {
      const item = hostRuntime().Items.get(itemID);
      if (
        !item ||
        item.id !== itemID ||
        !Number.isInteger(item.libraryID) ||
        (libraryID !== undefined && item.libraryID !== libraryID) ||
        !item.isAttachment?.() ||
        item.deleted === true ||
        item.isInTrash?.() === true
      )
        return null;
      const parentID = item.parentItemID ?? item.parentID;
      if (typeof parentID === 'number' && parentID > 0) {
        const parent = hostRuntime().Items.get(parentID);
        if (!parent || parent.deleted === true || parent.isInTrash?.() === true) return null;
      }
      return item;
    } catch {
      return null;
    }
  }

  async #attachmentReadable(item: ReaderAttachmentRuntime): Promise<boolean> {
    try {
      const path = await item.getFilePathAsync?.();
      if (!path) return false;
      const file = hostRuntime().File?.pathToFile(path);
      return file?.exists?.() === true && file.isReadable?.() === true;
    } catch {
      return false;
    }
  }

  #activeView(reader: ReaderRuntime): ReaderViewRuntime | null {
    const internal = reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    if (internal?._lastView === primary && primary) return primary;
    if (internal?._lastView === secondary && secondary) return secondary;
    const isPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
    if (isPrimary === false && secondary) return secondary;
    if (isPrimary === true && primary) return primary;
    return primary ?? secondary ?? null;
  }

  #viewPrimary(reader: ReaderRuntime, view: ReaderViewRuntime): boolean | null {
    if (reader._internalReader?._primaryView === view) return true;
    if (reader._internalReader?._secondaryView === view) return false;
    return null;
  }

  #existingTab(
    owner: ReaderWindowRuntime,
    itemID: number,
  ): { readonly tabID: string; readonly reader: ReaderRuntime | null } | null {
    const tabs = owner.Zotero_Tabs;
    for (const tab of tabs?._tabs ?? []) {
      if (!tab.id || !isReaderTabType(tab.type)) continue;
      const reader =
        hostRuntime().Reader.getByTabID?.(tab.id) ??
        hostRuntime().Reader._readers?.find((candidate) => candidate.tabID === tab.id) ??
        null;
      if (
        reader &&
        reader._window === owner &&
        reader.itemID === itemID &&
        reader._isTabClosed !== true
      )
        return { tabID: tab.id, reader };
      if (tab.data?.itemID === itemID) return { tabID: tab.id, reader: null };
    }
    const tabID = tabs?.getTabIDByItemID?.(itemID);
    const tab = tabs?._tabs?.find((candidate) => candidate.id === tabID);
    if (!tabID || !tab || !isReaderTabType(tab.type)) return null;
    const reader =
      hostRuntime().Reader.getByTabID?.(tabID) ??
      hostRuntime().Reader._readers?.find((candidate) => candidate.tabID === tabID) ??
      null;
    if (reader)
      return reader._window === owner && reader.itemID === itemID && reader._isTabClosed !== true
        ? { tabID, reader }
        : null;
    return tab.data?.itemID === undefined || tab.data.itemID === itemID
      ? { tabID, reader: null }
      : null;
  }

  #readerIsInOwnerTab(
    reader: ReaderRuntime,
    owner: ReaderWindowRuntime,
    tabID: string,
    itemID: number,
  ): boolean {
    if (reader.tabID !== tabID || reader.itemID !== itemID || reader._window !== owner)
      return false;
    const tabs = owner.Zotero_Tabs?._tabs;
    if (!tabs) return true;
    const tab = tabs.find((candidate) => candidate.id === tabID);
    return (
      !!tab &&
      tab.type === 'reader' &&
      (tab.data?.itemID === undefined || tab.data.itemID === itemID)
    );
  }

  async #focusOwnerWindow(
    owner: ReaderWindowRuntime,
    current: () => boolean,
    deadline: number,
  ): Promise<boolean> {
    const host = hostRuntime();
    try {
      if (host.getMainWindow?.() === owner) return true;
      owner.focus?.();
    } catch {
      return false;
    }
    return (
      (await this.#waitUntil(
        current,
        () => (host.getMainWindow?.() === owner ? true : null),
        deadline,
      )) === true
    );
  }

  async #waitForReader(
    owner: ReaderWindowRuntime,
    itemID: number,
    tabID: string | undefined,
    current: () => boolean,
    deadline: number,
    opened?: ReaderRuntime,
  ): Promise<ReaderRuntime | null> {
    return this.#waitUntil(
      current,
      () => {
        const reader =
          opened && opened._window === owner && opened.itemID === itemID
            ? opened
            : tabID
              ? (hostRuntime().Reader.getByTabID?.(tabID) ??
                hostRuntime().Reader._readers?.find((candidate) => candidate.tabID === tabID) ??
                null)
              : (hostRuntime().Reader._readers?.find(
                  (candidate) =>
                    candidate._window === owner &&
                    candidate.itemID === itemID &&
                    candidate._isTabClosed !== true,
                ) ?? null);
        return reader &&
          reader._window === owner &&
          reader.itemID === itemID &&
          reader._isTabClosed !== true &&
          reader.tabID &&
          this.#readerIsInOwnerTab(reader, owner, reader.tabID, itemID)
          ? reader
          : null;
      },
      deadline,
    );
  }

  async #waitForExactView(
    reader: ReaderRuntime,
    primary: boolean,
    current: () => boolean,
    deadline: number,
  ): Promise<ReaderViewRuntime | null> {
    return this.#waitUntil(
      current,
      () => {
        const view = primary
          ? reader._internalReader?._primaryView
          : reader._internalReader?._secondaryView;
        const pdfWindow = view?._iframeWindow as PdfWindow | undefined;
        return view &&
          pdfWindow?.PDFViewerApplication?.pdfViewer &&
          typeof view.navigate === 'function'
          ? view
          : null;
      },
      deadline,
    );
  }

  async #waitForPosition(
    view: ReaderViewRuntime,
    expected: ReaderJumpPosition,
    current: () => boolean,
    deadline: number,
  ): Promise<boolean> {
    return (
      (await this.#waitUntil(
        current,
        () => {
          const pdfWindow = view._iframeWindow as PdfWindow | undefined;
          const viewer = pdfWindow?.PDFViewerApplication?.pdfViewer;
          viewer?.update?.();
          const position = parseViewerPosition(viewer?._location);
          return position && sameNativePosition(position, expected) ? true : null;
        },
        deadline,
      )) === true
    );
  }

  async #waitUntil<T>(
    current: () => boolean,
    read: () => T | null,
    deadline: number,
  ): Promise<T | null> {
    while (current()) {
      try {
        const value = read();
        if (value !== null) return value;
      } catch {
        return null;
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(RESTORE_POLL_MS, Math.max(0, deadline - Date.now()))),
      );
    }
    return null;
  }

  async #bounded<T>(promise: Promise<T>, deadline: number): Promise<{ readonly value: T } | null> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    let timer: ReaderTimer | undefined;
    const result = promise.then((value) => ({ value }));
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), remaining);
    });
    try {
      return await Promise.race([result, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
