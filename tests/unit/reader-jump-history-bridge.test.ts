import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ReaderJumpLocation } from '../../src/core/contracts';
import type {
  HistoryDecision,
  NavigationAttempt,
  NavigationOutcome,
  NavigationPort,
  NativeNavigationReceipt,
} from '../../src/navigation/types';
import { ReaderJumpHostAdapter } from '../../src/reader/jump-host';
import {
  ReaderJumpHistoryBridge,
  type ReaderOwnedCompletion,
} from '../../src/reader/jump-history-bridge';
import type {
  InternalReaderRuntime,
  PdfWindow,
  ReaderFindControllerRuntime,
  ReaderPdfHistoryLocationRuntime,
  ReaderPdfHistoryRuntime,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';

type ViewPayload = Parameters<NonNullable<ReaderViewRuntime['navigate']>>[0];
type InternalPayload = Parameters<NonNullable<InternalReaderRuntime['navigate']>>[0];

interface TestHistory extends ReaderPdfHistoryRuntime {
  _currentLocation?: ReaderPdfHistoryLocationRuntime;
}

interface TestPosition {
  readonly pageIndex: number;
  readonly top: number;
  readonly left: number;
}

interface TestLinkService {
  setHash(hash: string): void;
  goToDestination(destination: unknown): Promise<unknown>;
  navigateTo(destination: unknown): Promise<unknown>;
}

interface Harness {
  readonly bridge: ReaderJumpHistoryBridge;
  readonly host: ReaderJumpHostAdapter;
  readonly reader: ReaderRuntime;
  readonly view: ReaderViewRuntime;
  readonly history: TestHistory;
  readonly pdfWindow: PdfWindow;
  readonly linkService: TestLinkService;
  readonly frames: FrameRequestCallback[];
  readonly receipts: NativeNavigationReceipt[];
  readonly observeNative: Mock<(receipt: NativeNavigationReceipt) => void>;
  readonly nativeSetHash: Mock<(this: TestLinkService, hash: string) => void>;
  readonly nativeGoToDestination: Mock<
    (this: TestLinkService, destination: unknown) => Promise<unknown>
  >;
  readonly nativeSave: Mock<NonNullable<TestHistory['save']>>;
  readonly nativePush: Mock<NonNullable<ReaderViewRuntime['_pushHistoryPoint']>>;
  readonly nativeViewNavigate: Mock<NonNullable<ReaderViewRuntime['navigate']>>;
  readonly nativeInternalNavigate: Mock<NonNullable<InternalReaderRuntime['navigate']>>;
  readonly pendingProducerSaves: Array<() => void>;
  setPosition(position: TestPosition): void;
  setDeferredProducerSaves(deferred: boolean): void;
  resolveProducerSave(index: number): void;
  setHashHandler(handler: (this: TestLinkService, hash: string) => void): void;
  setDestinationHandler(handler: (destination: unknown) => Promise<unknown>): void;
  advanceFrames(count?: number): Promise<void>;
}

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function historyLocation(
  pageIndex: number,
  top: number,
  left: number,
): ReaderPdfHistoryLocationRuntime {
  return { dest: [pageIndex, { name: 'XYZ' }, left, top, null] };
}

function expectedLocation(position: TestPosition): ReaderJumpLocation {
  return {
    kind: 'reader',
    tabID: 'reader-tab',
    libraryID: 4,
    itemID: 12,
    position: { ...position, primary: true },
  };
}

function request(position: TestPosition): ViewPayload {
  return { dest: historyLocation(position.pageIndex, position.top, position.left).dest };
}

function destinationPosition(payload: ViewPayload, current: TestPosition): TestPosition | null {
  if ('dest' in payload && Array.isArray(payload.dest)) {
    const [pageIndex, , left, top] = payload.dest;
    if (typeof pageIndex === 'number' && typeof top === 'number' && typeof left === 'number')
      return { pageIndex, top, left };
  }
  if ('pageIndex' in payload && typeof payload.pageIndex === 'number')
    return { ...current, pageIndex: payload.pageIndex };
  return null;
}

function makeAttempt(
  policy: HistoryDecision,
  isCurrent: () => boolean = () => true,
  id = 1,
): NavigationAttempt {
  return {
    token: {
      id,
      epoch: 0,
      cause: { kind: 'event', event: 'reader-outline.confirm' },
      surface: 'reader',
    },
    policy,
    isCurrent,
    cancel: () => undefined,
  };
}

function hardOutcome(completion: ReaderOwnedCompletion): NavigationOutcome {
  return completion.hardDestination
    ? {
        kind: 'completed',
        evidence: 'native-hard',
        destination: completion.hardDestination,
      }
    : { kind: 'unavailable' };
}

function harness(options: { readonly findController?: ReaderFindControllerRuntime } = {}): Harness {
  Reflect.set(globalThis, 'Zotero', {
    Items: {
      get: (id: number) => (id === 12 ? { id, libraryID: 4, isAttachment: () => true } : null),
    },
  });

  const initial = { pageIndex: 0, top: 10, left: 20 };
  const frames: FrameRequestCallback[] = [];
  const pendingProducerSaves: Array<() => void> = [];
  let deferredProducerSaves = false;
  let current: TestPosition = initial;
  let view!: ReaderViewRuntime;
  let setHashImplementation: (this: TestLinkService, hash: string) => void = () => undefined;
  let destinationImplementation: (destination: unknown) => Promise<unknown> = () =>
    Promise.resolve();

  const nativeSave = vi.fn(function (
    this: TestHistory,
    destination: ReaderPdfHistoryLocationRuntime,
    transient?: boolean,
  ) {
    if (!transient) this._currentLocation = destination;
    return 'native-save';
  });
  const history: TestHistory = {
    _currentLocation: historyLocation(initial.pageIndex, initial.top, initial.left),
    save: nativeSave,
  };
  const viewer = {
    _location: { pageNumber: initial.pageIndex + 1, top: initial.top, left: initial.left },
    update: vi.fn(),
  };
  const setPosition = (position: TestPosition): void => {
    current = position;
    Reflect.set(viewer, '_location', {
      pageNumber: position.pageIndex + 1,
      top: position.top,
      left: position.left,
    });
  };
  const nativeSetHash: Mock<(this: TestLinkService, hash: string) => void> = vi.fn(function (
    this: TestLinkService,
    hash: string,
  ) {
    setHashImplementation.call(this, hash);
  });
  const nativeGoToDestination: Mock<
    (this: TestLinkService, destination: unknown) => Promise<unknown>
  > = vi.fn(function (this: TestLinkService, destination: unknown) {
    return destinationImplementation(destination);
  });
  const nativeNavigateTo: Mock<(this: TestLinkService, destination: unknown) => Promise<unknown>> =
    vi.fn(function (this: TestLinkService, destination: unknown) {
      return destinationImplementation(destination);
    });
  const linkService: TestLinkService = {
    setHash: nativeSetHash,
    goToDestination: nativeGoToDestination,
    navigateTo: nativeNavigateTo,
  };
  const pdfWindow = {
    location: { hash: '' },
    queueMicrotask,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.push(callback);
      return frames.length;
    },
  } as unknown as PdfWindow;
  Reflect.set(pdfWindow, 'PDFViewerApplication', {
    pdfViewer: viewer,
    pdfLinkService: linkService,
  });

  const nativePush = vi.fn(function (this: ReaderViewRuntime): Promise<void> {
    const destination = historyLocation(current.pageIndex, current.top, current.left);
    if (deferredProducerSaves) {
      const { promise, resolve } = Promise.withResolvers<void>();
      pendingProducerSaves.push(() => {
        history.save?.(destination);
        resolve();
      });
      return promise;
    }
    history.save?.(destination);
    return Promise.resolve();
  });
  const nativeViewNavigate = vi.fn(function (
    this: ReaderViewRuntime,
    payload: ViewPayload,
  ): Promise<void> {
    const destination = destinationPosition(payload, current);
    if (destination) setPosition(destination);
    return this._pushHistoryPoint?.() as Promise<void>;
  });
  view = {
    _history: history,
    _iframeWindow: pdfWindow,
    _pushHistoryPoint: nativePush,
    navigate: nativeViewNavigate,
    ...(options.findController ? { _findController: options.findController } : {}),
  };
  const nativeInternalNavigate = vi.fn(function (
    this: InternalReaderRuntime,
    payload: InternalPayload,
    navigateOptions?: { readonly skipHistory?: boolean },
  ): Promise<void> {
    return Promise.resolve().then(() =>
      Promise.resolve(view.navigate?.(payload as ViewPayload, navigateOptions)).then(
        () => undefined,
      ),
    );
  });
  const internal: InternalReaderRuntime = {
    _primaryView: view,
    _lastView: view,
    _lastViewPrimary: true,
    navigate: nativeInternalNavigate,
  };
  const ownerWindow = {
    Zotero_Tabs: {
      selectedID: 'reader-tab',
      _tabs: [{ id: 'reader-tab', type: 'reader' }],
    },
  };
  const reader = {
    tabID: 'reader-tab',
    itemID: 12,
    _isTabClosed: false,
    _window: ownerWindow,
    _internalReader: internal,
  } as unknown as ReaderRuntime;
  const host = new ReaderJumpHostAdapter();
  const receipts: NativeNavigationReceipt[] = [];
  const observeNative = vi.fn((receipt: NativeNavigationReceipt) => {
    receipts.push(receipt);
  });
  const port = {
    execute: vi.fn(),
    observeNative,
  } as unknown as NavigationPort;
  const bridge = new ReaderJumpHistoryBridge({
    reader,
    host,
    navigation: () => port,
    debug: vi.fn(),
  });
  bridge.sync();

  return {
    bridge,
    host,
    reader,
    view,
    history,
    pdfWindow,
    linkService,
    frames,
    receipts,
    observeNative,
    nativeSetHash,
    nativeGoToDestination,
    nativeSave,
    nativePush,
    nativeViewNavigate,
    nativeInternalNavigate,
    pendingProducerSaves,
    setPosition,
    setDeferredProducerSaves(deferred) {
      deferredProducerSaves = deferred;
    },
    resolveProducerSave(index) {
      const save = pendingProducerSaves[index];
      if (!save) throw new Error(`No pending producer save at index ${index}`);
      save();
    },
    setHashHandler(handler) {
      setHashImplementation = handler;
    },
    setDestinationHandler(handler) {
      destinationImplementation = handler;
    },
    async advanceFrames(count = 4) {
      for (let index = 0; index < count; index += 1) {
        await Promise.resolve();
        const callbacks = frames.splice(0);
        for (const callback of callbacks) callback(0);
        await Promise.resolve();
      }
    },
  };
}

function nativeLabelNavigation(
  h: Harness,
  labels: Promise<void>,
): Mock<NonNullable<ReaderViewRuntime['navigate']>> {
  Reflect.set(globalThis, 'Components', {
    utils: { cloneInto: (value: object) => value, waiveXrays: (value: object) => value },
  });
  Reflect.set(h.reader, '_iframeWindow', h.pdfWindow);
  h.view._pageLabelsPromise = labels;
  const native = vi.fn(async function (
    this: ReaderViewRuntime,
    payload: ViewPayload,
  ): Promise<void> {
    await this._pageLabelsPromise;
    const label =
      'pageNumber' in payload
        ? payload.pageNumber
        : 'pageLabel' in payload
          ? payload.pageLabel
          : null;
    if (label === null) throw new Error('Expected a label navigation');
    h.setPosition({ pageIndex: Number(label) - 1, top: 70, left: 80 });
    this._pushHistoryPoint?.();
  });
  h.view.navigate = native;
  h.bridge.sync();
  return native;
}

describe('ReaderJumpHistoryBridge', () => {
  it.each(['native', 'owned'] as const)(
    'keeps the exact %s invocation across the page-label await',
    async (owner) => {
      const h = harness();
      const { promise: labels, resolve } = Promise.withResolvers<void>();
      const native = nativeLabelNavigation(h, labels);
      let returned: unknown;
      const owned =
        owner === 'owned'
          ? h.bridge.runOwned(
              h.view,
              makeAttempt({ kind: 'record', evidence: 'native-hard' }),
              (navigation) =>
                navigation.runNative(() => (returned = h.view.navigate?.({ pageLabel: '5' }))),
              (_value, completion) => hardOutcome(completion),
            )
          : null;
      if (!owned) returned = h.view.navigate?.({ pageNumber: '5' });
      expect(returned).toBe(native.mock.results[0]?.value);
      expect(h.view._pageLabelsPromise).toBe(labels);
      resolve();
      await returned;
      const target = expectedLocation({ pageIndex: 4, top: 70, left: 80 });
      if (owned) {
        expect(await owned).toEqual({
          kind: 'completed',
          evidence: 'native-hard',
          destination: target,
        });
        expect(h.observeNative).not.toHaveBeenCalled();
      } else {
        await Promise.resolve();
        expect(h.receipts).toMatchObject([
          { source: expectedLocation({ pageIndex: 0, top: 10, left: 20 }), destination: target },
        ]);
        expect(h.receipts[0]?.isCurrent()).toBe(true);
      }
      h.bridge.dispose();
    },
  );

  it('keeps a native label confirmation separate from an owned label wait through reversed saves', async () => {
    const h = harness();
    h.setDeferredProducerSaves(true);
    const { promise: labels, resolve } = Promise.withResolvers<void>();
    nativeLabelNavigation(h, labels);
    let current = true;
    const owned = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }, () => current),
      (navigation) => navigation.runNative(() => h.view.navigate?.({ pageLabel: '5' })),
      (_value, completion) => hardOutcome(completion),
    );
    const native = h.view.navigate?.({ pageNumber: '9' });
    resolve();
    await native;
    h.resolveProducerSave(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.receipts).toMatchObject([
      {
        source: expectedLocation({ pageIndex: 0, top: 10, left: 20 }),
        destination: expectedLocation({ pageIndex: 8, top: 70, left: 80 }),
      },
    ]);
    current = false;
    h.resolveProducerSave(0);
    expect(await owned).toEqual({ kind: 'stale' });
    expect(h.receipts).toHaveLength(1);
    expect(h.view._pageLabelsPromise).toBe(labels);
    h.bridge.dispose();
  });

  it('attributes an unowned hard save to the exact view-entry source and preserves the native promise', async () => {
    const h = harness();
    const destination = { pageIndex: 4, top: 50, left: 60 };
    const nativeResult = h.view.navigate?.(request(destination));

    expect(nativeResult).toBe(h.nativePush.mock.results[0]?.value);
    expect(h.nativeViewNavigate).toHaveBeenCalledTimes(1);
    expect(h.nativeViewNavigate.mock.contexts[0]).toBe(h.view);
    expect(h.nativeSave).toHaveBeenCalledTimes(1);
    expect(h.nativeSave.mock.contexts[0]).toBe(h.history);

    await nativeResult;
    await Promise.resolve();
    await Promise.resolve();

    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0]).toMatchObject({
      source: expectedLocation({ pageIndex: 0, top: 10, left: 20 }),
      destination: expectedLocation(destination),
    });
    expect(h.receipts[0]?.isCurrent()).toBe(true);
  });

  it('keeps raw saves baseline-only and uses the observed baseline for a later native producer', async () => {
    const h = harness();
    const baseline = historyLocation(2, 30, 40);
    expect(h.history.save?.(baseline)).toBe('native-save');

    expect(h.observeNative).not.toHaveBeenCalled();

    const destination = { pageIndex: 5, top: 70, left: 80 };
    h.setPosition(destination);
    const nativeResult = h.view._pushHistoryPoint?.();
    expect(nativeResult).toBe(h.nativePush.mock.results[0]?.value);
    await nativeResult;
    await Promise.resolve();
    await Promise.resolve();

    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0]).toMatchObject({
      source: expectedLocation({ pageIndex: 2, top: 30, left: 40 }),
      destination: expectedLocation(destination),
    });
  });

  it('associates a cloned native request with its owning hard-point ticket', async () => {
    const h = harness();
    const target = { pageIndex: 3, top: 45, left: 55 };
    const payload = request(target);
    let requestPromise: unknown;
    let completion: ReaderOwnedCompletion | undefined;
    const outcome = await h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }),
      (navigation) => {
        expect(navigation.attempt.policy.kind).toBe('record');
        requestPromise = navigation.navigate(payload);
        return requestPromise;
      },
      (_value, owned) => {
        completion = owned;
        return hardOutcome(owned);
      },
    );

    expect(requestPromise).toBe(h.nativeInternalNavigate.mock.results[0]?.value);
    expect(h.nativeInternalNavigate).toHaveBeenCalledTimes(1);
    expect(h.nativeInternalNavigate.mock.contexts[0]).toBe(h.reader._internalReader);
    expect(h.nativeViewNavigate.mock.calls[0]?.[0]).toBe(payload);
    expect(outcome).toEqual({
      kind: 'completed',
      evidence: 'native-hard',
      destination: expectedLocation(target),
    });
    expect(completion).toMatchObject({
      source: expectedLocation({ pageIndex: 0, top: 10, left: 20 }),
      hardDestination: expectedLocation(target),
      producerCount: 1,
      hardPointCount: 1,
      current: true,
      ambiguous: false,
    });
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('finishes the surviving producer when overlapping hard saves resolve in reverse order', async () => {
    const h = harness();
    h.setDeferredProducerSaves(true);
    const targetA = { pageIndex: 2, top: 22, left: 32 };
    const targetB = { pageIndex: 7, top: 77, left: 87 };
    let currentA = true;
    const runA = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }, () => currentA, 10),
      (navigation) => navigation.runNative(() => h.view.navigate?.(request(targetA))),
      (_value, completion) => hardOutcome(completion),
    );
    currentA = false;
    const runB = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }, () => true, 11),
      (navigation) => navigation.runNative(() => h.view.navigate?.(request(targetB))),
      (_value, completion) => hardOutcome(completion),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(h.pendingProducerSaves).toHaveLength(2);

    h.resolveProducerSave(1);
    const outcomeB = await runB;
    h.resolveProducerSave(0);
    const outcomeA = await runA;

    expect(outcomeA).toEqual({ kind: 'stale' });
    expect(outcomeB).toEqual({
      kind: 'completed',
      evidence: 'native-hard',
      destination: expectedLocation(targetB),
    });
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('does not let an independent raw save satisfy a pending owned producer', async () => {
    const h = harness();
    h.setDeferredProducerSaves(true);
    const target = { pageIndex: 6, top: 66, left: 76 };
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }),
      (navigation) => navigation.runNative(() => h.view.navigate?.(request(target))),
      (_value, completion) => hardOutcome(completion),
    );
    h.history.save?.(historyLocation(20, 200, 300));
    await Promise.resolve();
    await Promise.resolve();
    expect(h.observeNative).not.toHaveBeenCalled();
    h.resolveProducerSave(0);
    expect(await running).toEqual({
      kind: 'completed',
      evidence: 'native-hard',
      destination: expectedLocation(target),
    });
    expect(h.observeNative).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('recognizes an owned terminal save through a different native history wrapper', async () => {
    const h = harness();
    const rawHistory = Object.create(h.history) as TestHistory;
    Reflect.set(globalThis, 'Components', {
      utils: { waiveXrays: (value: object) => (value === rawHistory ? h.history : value) },
    });
    const target = { pageIndex: 8, top: 88, left: 98 };
    const { promise, resolve } = Promise.withResolvers<void>();
    h.view._pushHistoryPoint = () => {
      queueMicrotask(() => {
        h.history.save?.call(
          rawHistory,
          historyLocation(target.pageIndex, target.top, target.left),
        );
        resolve();
      });
      return promise;
    };
    h.bridge.sync();
    const outcome = await h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }),
      (navigation) => {
        h.setPosition(target);
        return navigation.runNative(() => h.view._pushHistoryPoint?.());
      },
      (_value, completion) => hardOutcome(completion),
    );
    expect(outcome).toEqual({
      kind: 'completed',
      evidence: 'native-hard',
      destination: expectedLocation(target),
    });
    expect(h.observeNative).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('never reclassifies a stale owned hard save as native work', async () => {
    const h = harness();
    h.setDeferredProducerSaves(true);
    let current = true;
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }, () => current),
      (navigation) => navigation.navigate(request({ pageIndex: 5, top: 55, left: 65 })),
      (_value, completion) => hardOutcome(completion),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(h.pendingProducerSaves).toHaveLength(1);

    current = false;
    h.resolveProducerSave(0);

    expect(await running).toEqual({ kind: 'stale' });
    expect(h.nativeSave).toHaveBeenCalledOnce();
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('does not assign an independent native producer to one pending owned navigate', async () => {
    const h = harness();
    const { promise: ownedNavigatePending, resolve: resolveOwnedNavigate } =
      Promise.withResolvers<void>();
    const delayedNavigate = vi.fn(function (this: ReaderViewRuntime): Promise<void> {
      return ownedNavigatePending;
    });
    h.view.navigate = delayedNavigate as NonNullable<ReaderViewRuntime['navigate']>;
    h.bridge.sync();
    const owned = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'native-hard' }),
      (navigation) =>
        navigation.runNative(() => h.view.navigate?.(request({ pageIndex: 4, top: 44, left: 54 }))),
      (_value, completion) => hardOutcome(completion),
    );

    expect(delayedNavigate).toHaveBeenCalledTimes(1);
    await h.view._pushHistoryPoint?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.observeNative).not.toHaveBeenCalled();

    resolveOwnedNavigate();
    expect(await owned).toEqual({ kind: 'unavailable' });
    expect(h.nativeSave).toHaveBeenCalledOnce();
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('allows managed-final completion when multiple child producers overlap', async () => {
    const h = harness();
    h.setDeferredProducerSaves(true);
    const first = { pageIndex: 1, top: 15, left: 25 };
    const last = { pageIndex: 6, top: 66, left: 76 };
    let completion: ReaderOwnedCompletion | undefined;
    const finish = vi.fn((_value: unknown, owned: ReaderOwnedCompletion): NavigationOutcome => {
      completion = owned;
      const finalLocation = h.host.captureReader(h.reader, 'reader-tab', h.view);
      return finalLocation?.position
        ? { kind: 'completed', evidence: 'managed-final', destination: finalLocation }
        : { kind: 'unavailable' };
    });
    let firstChild: unknown;
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'managed-final' }),
      (navigation) => {
        firstChild = navigation.navigate(request(first));
        return Promise.all([firstChild, navigation.navigate(request(last))]);
      },
      finish,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(h.pendingProducerSaves).toHaveLength(2);

    h.resolveProducerSave(0);
    await firstChild;
    await Promise.resolve();
    await Promise.resolve();
    h.resolveProducerSave(1);
    const outcome = await running;

    expect(finish).toHaveBeenCalledTimes(1);
    expect(completion).toMatchObject({
      producerCount: 2,
      current: true,
      ambiguous: false,
    });
    expect(outcome).toEqual({
      kind: 'completed',
      evidence: 'managed-final',
      destination: expectedLocation(last),
    });
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('keeps policy-ignored no-port motion scoped without capturing or observing it as native', async () => {
    const h = harness();
    const capture = vi.spyOn(h.host, 'captureReader');
    const target = { pageIndex: 8, top: 80, left: 90 };
    let nativePromise: unknown;
    const outcome = h.bridge.runIgnoredMotion(
      h.view,
      () => true,
      (navigation) => {
        expect(navigation.policy).toEqual({ kind: 'ignore' });
        nativePromise = navigation.navigate(request(target));
      },
    );

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(nativePromise).toBe(h.nativeInternalNavigate.mock.results[0]?.value);
    await nativePromise;
    await Promise.resolve();
    await Promise.resolve();

    expect(h.nativeInternalNavigate).toHaveBeenCalledTimes(1);
    expect(h.nativeViewNavigate).toHaveBeenCalledTimes(1);
    expect(h.nativeSave).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('proves ignored no-op and detached movement from exact view geometry', async () => {
    const h = harness();
    const captureReader = vi.spyOn(h.host, 'captureReader');
    const otherWindow = {} as PdfWindow;
    Reflect.set(otherWindow, 'PDFViewerApplication', {
      pdfViewer: {
        _location: { pageNumber: 4, top: 40, left: 50 },
        update: vi.fn(),
      },
    });
    const secondary: ReaderViewRuntime = {
      _iframeWindow: otherWindow,
      _history: { _currentLocation: historyLocation(3, 40, 50) },
    };
    const internal = h.reader._internalReader;
    if (!internal) throw new Error('Expected internal Reader');
    Reflect.set(internal, '_secondaryView', secondary);
    Reflect.set(internal, '_lastView', secondary);
    let sameHasMoved = (): boolean | null => null;
    const unchanged = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'ignore' }),
      (navigation) => {
        sameHasMoved = () => navigation.hasMoved();
        return navigation.waitForView();
      },
      (settled) => {
        if (!settled) return { kind: 'unavailable' };
        return sameHasMoved() === false ? { kind: 'unchanged' } : { kind: 'unavailable' };
      },
    );
    await h.advanceFrames(2);
    expect(await unchanged).toEqual({ kind: 'unchanged' });

    const target = { pageIndex: 9, top: 90, left: 100 };
    const moved = h.bridge.runDetached(
      h.view,
      () => true,
      (navigation) => {
        h.setPosition(target);
        return navigation
          .waitForView()
          .then((settled) => ({ settled, hasMoved: navigation.hasMoved() }));
      },
      (value) => {
        if (!value.settled) return { kind: 'unavailable' };
        return value.hasMoved === true
          ? { kind: 'completed', evidence: 'settled-change' }
          : value.hasMoved === false
            ? { kind: 'unchanged' }
            : { kind: 'unavailable' };
      },
    );
    await h.advanceFrames(2);

    expect(await moved).toEqual({ kind: 'completed', evidence: 'settled-change' });
    expect(captureReader).not.toHaveBeenCalled();
    expect(h.nativeSave).not.toHaveBeenCalled();
    expect(h.observeNative).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('waits for the actual nested destination promise and view frame', async () => {
    const h = harness();
    const { promise: destinationPending, resolve: resolveDestination } =
      Promise.withResolvers<void>();
    let nestedPromise: Promise<unknown> | undefined;
    const destination = { pageIndex: 4, top: 792, left: -13 };
    h.setDestinationHandler(() => {
      h.view._scrolling = true;
      return destinationPending.then(() => {
        h.setPosition(destination);
        h.view._scrolling = false;
        return 'destination-settled';
      });
    });
    h.setHashHandler(function (hash) {
      nestedPromise = this.goToDestination(hash);
    });
    const capture = vi.spyOn(h.host, 'captureReader');
    let hashResult: unknown = 'not-called';
    const running = h.bridge.runDetached(
      h.view,
      () => true,
      (navigation) => {
        hashResult = navigation.runNative(() => h.linkService.setHash('destination-hash'));
        return hashResult;
      },
      (value, completion) => {
        expect(value).toBeUndefined();
        expect(completion.source).toBeNull();
        expect(completion.hardDestination).toBeNull();
        return { kind: 'completed', evidence: 'settled-change' };
      },
    );

    expect(hashResult).toBeUndefined();
    expect(nestedPromise).toBe(h.nativeGoToDestination.mock.results[0]?.value);
    expect(h.nativeSetHash).toHaveBeenCalledTimes(1);
    expect(h.nativeSetHash.mock.contexts[0]).toBe(h.linkService);
    expect(h.nativeGoToDestination).toHaveBeenCalledTimes(1);
    expect(h.observeNative).not.toHaveBeenCalled();

    resolveDestination();
    await h.advanceFrames();
    expect(await running).toEqual({ kind: 'completed', evidence: 'settled-change' });
    expect(capture).not.toHaveBeenCalled();
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('keeps the _updateMatch request frame through a reentrant native find', async () => {
    const stateA = {};
    const stateB = {};
    let currentA = true;
    let h!: Harness;
    const { promise: oldNavigate, resolve: resolveOldNavigate } = Promise.withResolvers<void>();
    let nestedRun: Promise<NavigationOutcome> | null = null;
    const controller: ReaderFindControllerRuntime = {
      find(state) {
        this._state = state;
        this._updateMatch?.();
      },
      _updateMatch() {
        return this._onNavigate?.(0, 0);
      },
      _onNavigate() {
        if (this._state === stateA) {
          currentA = false;
          nestedRun = h.bridge.runOwned(
            h.view,
            makeAttempt({ kind: 'record', evidence: 'settled-change' }, () => true, 22),
            (navigation) => {
              controller.find?.(stateB);
              return navigation.waitForSearch();
            },
            (outcome) => outcome,
          );
          return oldNavigate;
        }
        h.setPosition({ pageIndex: 9, top: 99, left: 109 });
        return Promise.resolve();
      },
    };
    h = harness({ findController: controller });
    const runA = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'settled-change' }, () => currentA, 21),
      (navigation) => {
        controller.find?.(stateA);
        return navigation.waitForSearch();
      },
      (outcome) => outcome,
    );
    expect(nestedRun).not.toBeNull();

    resolveOldNavigate();
    await h.advanceFrames();
    const [outcomeA, outcomeB] = await Promise.all([runA, nestedRun!]);

    expect(outcomeA).toEqual({ kind: 'stale' });
    expect(outcomeB).toEqual({
      kind: 'completed',
      evidence: 'settled-change',
      destination: expectedLocation({ pageIndex: 9, top: 99, left: 109 }),
    });
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('settles a native search with no active match as unchanged', async () => {
    const state = {};
    const onNavigate = vi.fn();
    const controller: ReaderFindControllerRuntime = {
      find(requestState) {
        this._state = requestState;
        this._updateMatch?.();
      },
      _updateMatch() {
        return undefined;
      },
      _onNavigate: onNavigate,
    };
    const h = harness({ findController: controller });
    const outcome = await h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'settled-change' }),
      (navigation) => {
        controller.find?.(state);
        return navigation.waitForSearch();
      },
      (searchOutcome) => searchOutcome,
    );

    expect(outcome).toEqual({ kind: 'unchanged' });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('settles a pending search waiter when its view attempt becomes stale', async () => {
    const state = {};
    let current = true;
    const controller: ReaderFindControllerRuntime = {
      find(requestState) {
        this._state = requestState;
      },
      _updateMatch() {
        return undefined;
      },
      _onNavigate: vi.fn(),
    };
    const h = harness({ findController: controller });
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'settled-change' }, () => current),
      (navigation) => {
        controller.find?.(state);
        return navigation.waitForSearch();
      },
      (outcome) => outcome,
    );
    await Promise.resolve();
    current = false;
    await h.advanceFrames(2);

    expect(await running).toEqual({ kind: 'stale' });
    expect(h.observeNative).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('allows finish to wait for the exact view after owned children drain', async () => {
    const h = harness();
    h.view._scrolling = true;
    let waitForView!: () => Promise<boolean>;
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'record', evidence: 'settled-change' }),
      (navigation) => {
        waitForView = () => navigation.waitForView();
        return 'motion-started';
      },
      async (value) => {
        expect(value).toBe('motion-started');
        return (await waitForView())
          ? { kind: 'completed', evidence: 'settled-change' }
          : { kind: 'unavailable' };
      },
    );
    await Promise.resolve();
    h.view._scrolling = false;
    await h.advanceFrames(2);

    expect(await running).toEqual({ kind: 'completed', evidence: 'settled-change' });
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('settles a frame waiter as stale when its exact view attempt is cancelled', async () => {
    const h = harness();
    let current = true;
    const finish = vi.fn(
      () => ({ kind: 'completed', evidence: 'settled-change' }) as NavigationOutcome,
    );
    const running = h.bridge.runOwned(
      h.view,
      makeAttempt({ kind: 'ignore' }, () => current),
      (navigation) => navigation.waitForView(),
      finish,
    );
    await Promise.resolve();
    current = false;
    await h.advanceFrames(2);

    expect(await running).toEqual({ kind: 'stale' });
    expect(finish).not.toHaveBeenCalled();
    expect(h.observeNative).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('settles waiters and restores only bridge-owned patches on disposal', async () => {
    const h = harness();
    h.view._scrolling = true;
    const finish = vi.fn(
      () => ({ kind: 'completed', evidence: 'settled-change' }) as NavigationOutcome,
    );
    const running = h.bridge.runDetached(
      h.view,
      () => true,
      (navigation) => navigation.waitForView(),
      finish,
    );
    await Promise.resolve();

    h.bridge.dispose();

    expect(await running).toEqual({ kind: 'stale' });
    expect(finish).not.toHaveBeenCalled();
    expect(h.history.save).toBe(h.nativeSave);
    expect(h.view._pushHistoryPoint).toBe(h.nativePush);
    expect(h.view.navigate).toBe(h.nativeViewNavigate);
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('settles exact-view waiters after the native view wrapper has been destroyed', async () => {
    const h = harness();
    h.view._scrolling = true;
    const running = h.bridge.runDetached(
      h.view,
      () => true,
      (navigation) => navigation.waitForView(),
      () => ({ kind: 'completed', evidence: 'settled-change' }),
    );
    await Promise.resolve();
    Object.defineProperty(h.view, '_iframeWindow', {
      configurable: true,
      get: () => {
        throw new TypeError("can't access dead object");
      },
    });
    h.bridge.releaseWindow({} as Window);
    expect(h.history.save).not.toBe(h.nativeSave);

    h.bridge.releaseWindow(h.pdfWindow);

    expect(await running).toEqual({ kind: 'stale' });
    expect(h.history.save).toBe(h.nativeSave);
    expect(h.view._pushHistoryPoint).toBe(h.nativePush);
    expect(h.view.navigate).toBe(h.nativeViewNavigate);
    expect(h.observeNative).not.toHaveBeenCalled();
  });

  it('removes its own history patch when the native save is inherited', () => {
    const h = harness();
    const nativeSave = h.nativeSave;
    if (typeof nativeSave !== 'function') throw new Error('Expected native history save');
    Object.setPrototypeOf(h.history, { save: nativeSave });
    expect(Reflect.deleteProperty(h.history, 'save')).toBe(true);
    expect(h.history.save).toBe(nativeSave);

    h.bridge.sync();
    expect(Object.prototype.hasOwnProperty.call(h.history, 'save')).toBe(true);
    h.bridge.dispose();

    expect(Object.prototype.hasOwnProperty.call(h.history, 'save')).toBe(false);
    expect(h.history.save).toBe(nativeSave);
  });

  it('preserves native synchronous errors and rejected promise identity', async () => {
    const h = harness();
    const failure = new Error('native Reader navigation failed');
    const nativeNavigate = vi.fn(function (this: ReaderViewRuntime): never {
      throw failure;
    });
    h.view.navigate = nativeNavigate as NonNullable<ReaderViewRuntime['navigate']>;
    h.bridge.sync();

    let caught: unknown;
    try {
      h.view.navigate?.(request({ pageIndex: 4, top: 50, left: 60 }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(nativeNavigate).toHaveBeenCalledTimes(1);
    expect(nativeNavigate.mock.contexts[0]).toBe(h.view);
    expect(h.observeNative).not.toHaveBeenCalled();
    const rejection = new Error('native Reader promise failed');
    const rejectedPromise = Promise.reject<void>(rejection);
    const nativeRejectedNavigate = vi.fn(function (this: ReaderViewRuntime): Promise<void> {
      return rejectedPromise;
    });
    h.view.navigate = nativeRejectedNavigate as NonNullable<ReaderViewRuntime['navigate']>;
    h.bridge.sync();
    const returned = h.view.navigate?.(request({ pageIndex: 7, top: 70, left: 80 }));

    expect(returned).toBe(rejectedPromise);
    await expect(returned).rejects.toBe(rejection);
    expect(nativeRejectedNavigate).toHaveBeenCalledTimes(1);
    expect(nativeRejectedNavigate.mock.contexts[0]).toBe(h.view);
    expect(h.observeNative).not.toHaveBeenCalled();
    await Promise.resolve();
    const destination = { pageIndex: 9, top: 90, left: 100 };
    h.setPosition(destination);
    await h.view._pushHistoryPoint?.();
    await Promise.resolve();
    expect(h.receipts).toMatchObject([
      {
        source: expectedLocation({ pageIndex: 0, top: 10, left: 20 }),
        destination: expectedLocation(destination),
      },
    ]);
    expect(h.receipts[0]?.isCurrent()).toBe(true);
    h.bridge.dispose();
  });
});
