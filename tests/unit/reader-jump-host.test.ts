import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { MainWindow, ReaderJumpLocation, ReaderJumpPosition } from '../../src/core/contracts';
import { ReaderJumpHostAdapter } from '../../src/reader/jump-host';
import type {
  ItemRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';

interface TestTab {
  id: string;
  type: string;
  data?: { itemID?: number };
}

interface TestItem extends ItemRuntime {
  isAttachment(): boolean;
  isInTrash(): boolean;
  getFilePathAsync(): Promise<string | false>;
}

interface TestPosition {
  readonly pageIndex: number;
  readonly top: number;
  readonly left: number;
}

interface TestPdfView {
  readonly view: ReaderViewRuntime;
  readonly pdfWindow: PdfWindow;
  readonly location: { pageNumber: number; top: number; left: number };
  readonly navigate: Mock<(payload: unknown, options: unknown) => unknown>;
}

interface TestFixture {
  readonly adapter: ReaderJumpHostAdapter;
  readonly ownerWindow: MainWindow;
  readonly ownerFocus: Mock<() => void>;
  readonly tabs: TestTab[];
  readonly selectedID: () => string;
  readonly select: Mock<(tabID: string) => void>;
  readonly setSelectedID: (tabID: string) => void;
  readonly setOnSelect: (handler: (tabID: string) => void) => void;
  readonly setMainWindow: (window: MainWindow) => void;
  readonly mainWindow: () => MainWindow;
  readonly readers: Map<string, ReaderRuntime>;
  readonly items: Map<number, TestItem>;
  readonly open: Mock<
    (itemID: number, location?: unknown, options?: unknown) => Promise<ReaderRuntime | void>
  >;
  readonly setOpenHandler: (handler: (itemID: number) => Promise<ReaderRuntime | void>) => void;
  readonly file: { readonly exists: Mock<() => boolean>; readonly isReadable: Mock<() => boolean> };
  readonly getTabIDByItemID: Mock<(itemID: number) => string | undefined>;
  readonly cloneCalls: Array<{
    readonly value: object;
    readonly target: Window | undefined;
  }>;
}

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
  vi.useRealTimers();
});

function createFixture(): TestFixture {
  const tabs: TestTab[] = [{ id: 'library-tab', type: 'library' }];
  let selectedID = 'library-tab';
  let activeMainWindow: MainWindow;
  let onSelect: (tabID: string) => void = () => {};
  const select = vi.fn((tabID: string) => {
    selectedID = tabID;
    onSelect(tabID);
  });
  const getTabIDByItemID = vi.fn(
    (itemID: number) =>
      tabs.find(
        (tab) =>
          tab.data?.itemID === itemID && (tab.type === 'reader' || tab.type === 'reader-unloaded'),
      )?.id,
  );
  const tabHost = {
    _tabs: tabs,
    get selectedID() {
      return selectedID;
    },
    getTabIDByItemID,
    select,
  };
  const ownerFocus = vi.fn();
  const ownerWindow = {
    Zotero_Tabs: tabHost,
    focus: ownerFocus,
  } as unknown as MainWindow;
  activeMainWindow = ownerWindow;
  const readers = new Map<string, ReaderRuntime>();
  const items = new Map<number, TestItem>();
  const file = {
    exists: vi.fn(() => true),
    isReadable: vi.fn(() => true),
  };
  let openHandler = async (_itemID: number): Promise<ReaderRuntime | void> => undefined;
  const open = vi.fn((itemID: number, _location?: unknown, _options?: unknown) =>
    openHandler(itemID),
  );
  const readerService = {
    get _readers(): ReaderRuntime[] {
      return [...readers.values()];
    },
    getByTabID: vi.fn((tabID: string) => readers.get(tabID) ?? null),
    open,
  };
  const cloneCalls: Array<{ readonly value: object; readonly target: Window | undefined }> = [];
  const cloneInto = <T extends object>(value: T, target?: Window): T => {
    cloneCalls.push({ value, target });
    return value;
  };
  Reflect.set(globalThis, 'Components', { utils: { cloneInto } });
  Reflect.set(globalThis, 'Zotero', {
    Reader: readerService,
    Items: { get: (id: number) => items.get(id) ?? false },
    File: { pathToFile: vi.fn(() => file) },
    getMainWindow: () => activeMainWindow,
  });

  return {
    adapter: new ReaderJumpHostAdapter(),
    ownerWindow,
    ownerFocus,
    tabs,
    getTabIDByItemID,
    select,
    selectedID: () => selectedID,
    setSelectedID: (tabID) => {
      selectedID = tabID;
    },
    setOnSelect: (handler) => {
      onSelect = handler;
    },
    setMainWindow: (window) => {
      activeMainWindow = window;
    },
    mainWindow: () => activeMainWindow,
    readers,
    items,
    open,
    setOpenHandler: (handler) => {
      openHandler = handler;
    },
    file,
    cloneCalls,
  };
}

function addItem(
  fixture: TestFixture,
  id: number,
  options: {
    readonly libraryID?: number;
    readonly deleted?: boolean;
    readonly inTrash?: boolean;
    readonly attachment?: boolean;
    readonly filePath?: string | false;
  } = {},
): TestItem {
  const item = {
    id,
    libraryID: options.libraryID ?? 1,
    deleted: options.deleted ?? false,
    isAttachment: () => options.attachment ?? true,
    isInTrash: () => options.inTrash ?? false,
    getFilePathAsync: vi.fn(async () => options.filePath ?? '/library/item.pdf'),
  } as unknown as TestItem;
  fixture.items.set(id, item);
  return item;
}

function addReader(
  fixture: TestFixture,
  itemID: number,
  tabID: string,
  views: { readonly primary?: TestPdfView; readonly secondary?: TestPdfView } = {},
  tabType = 'reader',
): { readonly reader: ReaderRuntime; readonly focusView: Mock<() => void> } {
  const focusView = vi.fn();
  const reader = {
    itemID,
    tabID,
    _window: fixture.ownerWindow,
    _isTabClosed: false,
    _isReaderInitialized: true,
    _initPromise: Promise.resolve(),
    _internalReader: {
      _primaryView: views.primary?.view,
      _secondaryView: views.secondary?.view,
      _lastView: views.primary?.view ?? views.secondary?.view,
      _lastViewPrimary: views.primary !== undefined,
      focusView,
    },
    focus: vi.fn(),
  } as unknown as ReaderRuntime;
  fixture.readers.set(tabID, reader);
  const existing = fixture.tabs.find((tab) => tab.id === tabID);
  if (existing) {
    existing.type = tabType;
    existing.data = { itemID };
  } else fixture.tabs.push({ id: tabID, type: tabType, data: { itemID } });
  return { reader, focusView };
}

function createPdfView(position: TestPosition, onNavigate?: () => boolean): TestPdfView {
  const location = {
    pageNumber: position.pageIndex + 1,
    top: position.top,
    left: position.left,
  };
  const pdfWindow = {
    PDFViewerApplication: {
      pdfViewer: {
        _location: location,
        update: vi.fn(),
      },
    },
    focus: vi.fn(),
  } as unknown as PdfWindow;
  const nativeLocation = {
    dest: [position.pageIndex, { name: 'XYZ' }, position.left, position.top, null],
  };
  const navigate = vi.fn((payload: unknown, options: unknown) => {
    if (onNavigate && !onNavigate()) return;
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('dest' in payload) ||
      !Array.isArray(payload.dest)
    )
      return;
    const destination = payload.dest;
    setTimeout(() => {
      location.pageNumber = Number(destination[0]) + 1;
      location.left = Number(destination[2]);
      location.top = Number(destination[3]);
    }, 25);
    return options;
  });
  const view = {
    _iframeWindow: pdfWindow,
    _history: { _currentLocation: nativeLocation },
    navigate,
    focus: vi.fn(),
  } as unknown as ReaderViewRuntime;
  return { view, pdfWindow, location, navigate };
}

function jumpLocation(
  tabID: string,
  itemID: number,
  position?: ReaderJumpPosition,
  libraryID = 1,
): ReaderJumpLocation {
  return { kind: 'reader', tabID, itemID, libraryID, ...(position ? { position } : {}) };
}

function createOtherWindow(): MainWindow {
  return { focus: vi.fn() } as unknown as MainWindow;
}

describe('ReaderJumpHostAdapter capture', () => {
  it('captures active split geometry and uses an itemID for an unloaded Reader', () => {
    const fixture = createFixture();
    addItem(fixture, 42);
    const primary = createPdfView({ pageIndex: 1, top: 10, left: 20 });
    const secondary = createPdfView({ pageIndex: 6, top: 70, left: 80 });
    const { reader } = addReader(fixture, 42, 'live-reader', { primary, secondary });
    const internal = reader._internalReader;
    if (!internal) throw new Error('Expected internal Reader');
    Reflect.set(internal, '_lastView', secondary.view);
    Reflect.set(internal, '_lastViewPrimary', false);

    expect(fixture.adapter.captureJumpLocation('live-reader')).toEqual({
      kind: 'reader',
      tabID: 'live-reader',
      libraryID: 1,
      itemID: 42,
      position: { primary: false, pageIndex: 6, top: 70, left: 80 },
    });
    expect(fixture.adapter.captureJumpLocation('unloaded-reader', 42)).toEqual({
      kind: 'reader',
      tabID: 'unloaded-reader',
      libraryID: 1,
      itemID: 42,
    });
  });

  it('rejects a stale itemID hint for a loaded tab', () => {
    const fixture = createFixture();
    addItem(fixture, 42);
    addReader(fixture, 42, 'live-reader');

    expect(fixture.adapter.captureJumpLocation('live-reader', 99)).toBeNull();
  });
});

describe('ReaderJumpHostAdapter restore', () => {
  it.each([
    ['primary', true],
    ['secondary', false],
  ] as const)(
    'restores and focuses exact %s view after geometry settles',
    async (_name, primary) => {
      vi.useFakeTimers();
      const fixture = createFixture();
      addItem(fixture, 42);
      const initial = { pageIndex: 0, top: 5, left: 9 };
      const target = { pageIndex: 7, top: 175, left: 31 };
      const isTargetSelected = () => fixture.selectedID() === 'current-reader';
      const primaryView = createPdfView(initial, isTargetSelected);
      const secondaryView = createPdfView(initial, isTargetSelected);
      const { reader, focusView } = addReader(fixture, 42, 'current-reader', {
        primary: primaryView,
        secondary: secondaryView,
      });
      const beforeNavigate = vi.fn();
      const restoring = fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        jumpLocation('closed-tab-hint', 42, { ...target, primary }),
        () => true,
        beforeNavigate,
      );
      await vi.advanceTimersByTimeAsync(100);
      const actualTabID = await restoring;

      expect(actualTabID).toBe('current-reader');
      expect(fixture.selectedID()).toBe('current-reader');
      expect(fixture.open).not.toHaveBeenCalled();
      expect(beforeNavigate).toHaveBeenCalledOnce();
      expect(beforeNavigate).toHaveBeenCalledWith(reader);
      expect(primaryView.navigate).toHaveBeenCalledTimes(primary ? 1 : 0);
      expect(secondaryView.navigate).toHaveBeenCalledTimes(primary ? 0 : 1);
      const restoredView = primary ? primaryView : secondaryView;
      expect(restoredView.navigate).toHaveBeenCalledWith(
        { dest: [target.pageIndex, { name: 'XYZ' }, target.left, target.top, null] },
        { skipHistory: true },
      );
      expect(fixture.cloneCalls).toEqual([
        {
          value: { dest: [target.pageIndex, { name: 'XYZ' }, target.left, target.top, null] },
          target: restoredView.pdfWindow,
        },
        { value: { skipHistory: true }, target: restoredView.pdfWindow },
      ]);
      expect(focusView).toHaveBeenCalledWith(primary);
      expect(restoredView.view.focus).toHaveBeenCalledOnce();
      expect(restoredView.location).toEqual({
        pageNumber: target.pageIndex + 1,
        top: target.top,
        left: target.left,
      });
    },
  );

  it('reuses a matching reader-unloaded tab rather than opening a duplicate', async () => {
    const fixture = createFixture();
    addItem(fixture, 42);
    fixture.tabs.push({ id: 'reader-unloaded-tab', type: 'reader-unloaded' });
    fixture.getTabIDByItemID.mockReturnValue('reader-unloaded-tab');
    fixture.setOnSelect((tabID) => {
      if (tabID !== 'reader-unloaded-tab' || fixture.readers.has(tabID)) return;
      addReader(fixture, 42, tabID);
    });

    const actualTabID = await fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('closed-old-hint', 42),
      () => true,
      () => {},
    );

    expect(actualTabID).toBe('reader-unloaded-tab');
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.selectedID()).toBe('reader-unloaded-tab');
    expect(fixture.readers.get('reader-unloaded-tab')?.focus).toHaveBeenCalledOnce();
  });

  it('opens the saved attachment in the requested owner window, not a recycled tab ID', async () => {
    const fixture = createFixture();
    addItem(fixture, 42);
    addItem(fixture, 99);
    fixture.setMainWindow(createOtherWindow());
    const wrongReader = addReader(fixture, 99, 'recycled-old-tab').reader;
    fixture.ownerFocus.mockImplementation(() => fixture.setMainWindow(fixture.ownerWindow));
    const retainedView = createPdfView({ pageIndex: 2, top: 10, left: 4 });
    fixture.setOpenHandler(async (itemID) => {
      expect(itemID).toBe(42);
      expect(fixture.mainWindow()).toBe(fixture.ownerWindow);
      return addReader(fixture, itemID, 'restored-new-tab', { primary: retainedView }).reader;
    });

    const actualTabID = await fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('recycled-old-tab', 42),
      () => true,
      () => {},
    );

    expect(actualTabID).toBe('restored-new-tab');
    expect(fixture.open).toHaveBeenCalledWith(42, undefined, {
      allowDuplicate: true,
      openInBackground: true,
    });
    expect(fixture.ownerFocus).toHaveBeenCalledOnce();
    expect(fixture.selectedID()).toBe('restored-new-tab');
    expect(fixture.readers.get('restored-new-tab')?.focus).toHaveBeenCalledOnce();
    expect(retainedView.navigate).not.toHaveBeenCalled();
    expect(retainedView.location).toEqual({ pageNumber: 3, top: 10, left: 4 });
    expect(wrongReader.itemID).toBe(99);
  });

  it('does not fall back to primary when the captured secondary is unavailable', async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    addItem(fixture, 42);
    const primary = createPdfView({ pageIndex: 1, top: 10, left: 20 });
    const { reader } = addReader(fixture, 42, 'current-reader', { primary });
    const restoring = fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('old-reader', 42, { primary: false, pageIndex: 5, top: 70, left: 10 }),
      () => true,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(restoring).resolves.toBeNull();
    expect(fixture.selectedID()).toBe('current-reader');
    expect(primary.navigate).not.toHaveBeenCalled();
    expect(primary.view.focus).not.toHaveBeenCalled();
    expect(reader.focus).not.toHaveBeenCalled();
  });

  it('does not focus or reselect a Reader after a newer tab intent supersedes restore', async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    addItem(fixture, 42);
    let isCurrent = true;
    const primary = createPdfView({ pageIndex: 1, top: 10, left: 20 }, () => {
      isCurrent = false;
      fixture.setSelectedID('newer-user-tab');
      return false;
    });
    const { reader, focusView } = addReader(fixture, 42, 'current-reader', { primary });

    const result = await fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('old-reader', 42, { primary: true, pageIndex: 5, top: 70, left: 10 }),
      () => isCurrent,
      () => {},
    );

    expect(result).toBeNull();
    expect(fixture.selectedID()).toBe('newer-user-tab');
    expect(focusView).not.toHaveBeenCalled();
    expect(reader.focus).not.toHaveBeenCalled();
  });

  it('bounds a pending exact-view navigation by the shared restore deadline', async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    addItem(fixture, 42);
    const primary = createPdfView({ pageIndex: 0, top: 0, left: 0 });
    const { reader } = addReader(fixture, 42, 'pending-navigation-reader', { primary });
    const neverSettles = Promise.withResolvers<void>().promise;
    const navigate = vi.fn(() => neverSettles);
    Reflect.set(primary.view, 'navigate', navigate);
    const restoring = fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('old-reader', 42, { primary: true, pageIndex: 8, top: 40, left: 20 }),
      () => true,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(restoring).resolves.toBeNull();
    expect(navigate).toHaveBeenCalledOnce();
    expect(primary.view.focus).not.toHaveBeenCalled();
    expect(reader.focus).not.toHaveBeenCalled();
  });

  it('bounds pending identity-only Reader focus by the same restore deadline', async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    addItem(fixture, 42);
    const { reader } = addReader(fixture, 42, 'pending-focus-reader');
    const neverSettles = Promise.withResolvers<void>().promise;
    const focus = vi.fn(() => neverSettles);
    Reflect.set(reader, 'focus', focus);
    const restoring = fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('old-reader', 42),
      () => true,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(restoring).resolves.toBeNull();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('fails closed for missing, wrong-library, unsupported, deleted, trashed, and unreadable attachments', async () => {
    const fixture = createFixture();
    const location = jumpLocation('closed-reader', 42);
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    addItem(fixture, 42, { libraryID: 2 });
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        { ...location, libraryID: 1 },
        () => true,
        () => {},
      ),
    ).toBeNull();

    addItem(fixture, 42, { attachment: false });
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    const attachment = addItem(fixture, 42);
    addItem(fixture, 77, { deleted: true });
    Reflect.set(attachment, 'parentItemID', 77);
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    addItem(fixture, 42, { deleted: true });
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    addItem(fixture, 42, { inTrash: true });
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    addItem(fixture, 42);
    fixture.file.exists.mockReturnValue(false);
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    fixture.file.exists.mockReturnValue(true);
    fixture.file.isReadable.mockReturnValue(false);
    expect(
      await fixture.adapter.restoreJumpLocation(
        fixture.ownerWindow,
        location,
        () => true,
        () => {},
      ),
    ).toBeNull();

    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.select).not.toHaveBeenCalled();
  });

  it('stops before touching the host when the request is already stale', async () => {
    const fixture = createFixture();
    const item = addItem(fixture, 42);

    const restored = await fixture.adapter.restoreJumpLocation(
      fixture.ownerWindow,
      jumpLocation('closed-reader', 42),
      () => false,
      () => {},
    );

    expect(restored).toBeNull();
    expect(item.getFilePathAsync).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.select).not.toHaveBeenCalled();
  });
});
