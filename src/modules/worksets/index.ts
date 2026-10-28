import type { Cleanup } from '../../core/cleanup';
import { CleanupFailure } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { Logger } from '../../core/logging';
import type { ItemRef } from '../../core/item-ref';
import type { ModuleHost } from '../../core/module-host';
import type { MainCurrentTarget, MainSelectionSource } from '../../main/action-targets';
import type { MainItemDecorationProjection } from '../../main/item-state-decoration';
import type { InteractionAppearanceSource } from '../../main/interaction-appearance';
import type { NavigationExecution } from '../../navigation/types';
import { MainItemSelect } from './item-select';
import { SelectionPanel } from './selection-panel';
import { SelectionPanelRuntime } from './selection-panel-runtime';
import { SelectionStore } from './selection-store';

export interface WorksetsModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly appearance: InteractionAppearanceSource;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly refreshItemDecorations: () => void;
  readonly prepareSelectionPanel: () => void;
  readonly revealItem: (itemID: number, isCurrent: () => boolean) => NavigationExecution | null;
}

export interface WorksetsModule {
  readonly selection: MainSelectionSource;
  readonly marks: MainItemDecorationProjection;
  readonly isVisual: boolean;
  readonly isPanelOpen: boolean;
  readonly visualRevision: number | null;
  currentTarget(): MainCurrentTarget | null;
  refresh(): void;
  cancelIfVisualRevision(revision: number): boolean;
  leave(): void;
  closePanel(): void;
  handlePanelKey(event: KeyboardEvent): void;
  manageSelection(): boolean;
  toggleCurrentTarget(shouldDebounce: boolean): boolean;
  clearSelection(): boolean;
  enter(): boolean;
  extend(direction: 1 | -1 | 'first' | 'last', count: number, shouldDebounce?: boolean): boolean;
  swapEnds(): boolean;
  finish(): boolean;
  cancel(): boolean;
}

/** Owns one Main window's workset, Visual interaction and inspector lifetime. */
export function createWorksetsModule(host: ModuleHost, ports: WorksetsModuleHost): WorksetsModule {
  return host.activate('worksets', (scope) => {
    const { window } = ports;
    const store = new SelectionStore();
    const runtime = new SelectionPanelRuntime();
    const state = {
      window,
      selection: store,
      selectionPanel: runtime,
      theme: { add: ports.themeRoot },
    };
    const appearance: InteractionAppearanceSource = {
      get appearance() {
        return ports.appearance.appearance;
      },
      observe: (listener) => scope.add(ports.appearance.observe(listener)),
    };
    const refreshDecorations = () => {
      if (scope.isCurrent()) ports.refreshItemDecorations();
    };
    const visual = new MainItemSelect(ports.logger, refreshDecorations, () => scope.isCurrent());
    const panel = new SelectionPanel(
      ports.logger,
      ports.revealItem,
      () => visual.refresh(window, store),
      () => scope.isCurrent(),
    );
    scope.add(() => {
      const failure = new CleanupFailure();
      failure.run(() => panel.close(state, false));
      failure.run(() => visual.removeWindow(window));
      failure.run(() => {
        store.clear();
      });
      failure.run(() => ports.refreshItemDecorations());
      failure.rethrow();
    });
    visual.addWindow(window, store, appearance);
    const selection: MainSelectionSource = Object.freeze({
      get size() {
        return scope.isCurrent() ? store.size : 0;
      },
      values: () => (scope.isCurrent() ? store.values() : []),
      remove: (ref: ItemRef) => scope.isCurrent() && store.remove(ref),
    });
    const marks: MainItemDecorationProjection = Object.freeze({
      has: (ref: ItemRef) => scope.isCurrent() && store.has(ref),
      visualRange: () => (scope.isCurrent() ? visual.visualRange(window) : undefined),
    });
    const manageSelection = host.bind<void>(scope, 'main-normal', 'manageSelection', () => {
      if (visual.isVisual(window)) visual.cancel(window, store);
      ports.prepareSelectionPanel();
      if (scope.isCurrent()) panel.open(window, state);
    });
    const toggleCurrentTarget = host.bind<boolean>(
      scope,
      'main-normal',
      'mainToggleSelection',
      (debounce) => {
        visual.toggleCurrentTarget(window, store, debounce);
      },
    );
    const clearSelection = host.bind<void>(scope, 'main-normal', 'mainClearSelection', () => {
      visual.clearSelection(window, store);
    });
    const enter = host.bind<void>(scope, 'main-normal', 'mainEnterSelect', () => {
      visual.enter(window, store);
    });
    type Motion = { count: number; shouldDebounce?: boolean };
    const down = host.bind<Motion>(scope, 'main-select', 'mainSelectDown', (request) =>
      visual.extend(window, 1, request.count, store, request.shouldDebounce),
    );
    const up = host.bind<Motion>(scope, 'main-select', 'mainSelectUp', (request) =>
      visual.extend(window, -1, request.count, store, request.shouldDebounce),
    );
    const first = host.bind<Motion>(scope, 'main-select', 'mainSelectFirst', (request) =>
      visual.extend(window, 'first', request.count, store, request.shouldDebounce),
    );
    const last = host.bind<Motion>(scope, 'main-select', 'mainSelectLast', (request) =>
      visual.extend(window, 'last', request.count, store, request.shouldDebounce),
    );
    const swapEnds = host.bind<void>(scope, 'main-select', 'mainSelectSwapEnds', () =>
      visual.swapEnds(window, store),
    );
    const finish = host.bind<void>(scope, 'main-select', 'mainSelectFinish', () => {
      visual.finish(window, store);
    });
    const cancel = host.bind<void>(scope, 'main-select', 'mainSelectCancel', () =>
      visual.cancel(window, store),
    );
    const motions = { 1: down, '-1': up, first, last };
    return {
      selection,
      marks,
      get isVisual() {
        return scope.isCurrent() && visual.isVisual(window);
      },
      get isPanelOpen() {
        return scope.isCurrent() && runtime.open;
      },
      get visualRevision() {
        return scope.isCurrent() ? visual.visualRevision(window) : null;
      },
      currentTarget: () => (scope.isCurrent() ? visual.currentTarget(window) : null),
      refresh: () => {
        if (scope.isCurrent()) visual.refresh(window, store);
      },
      cancelIfVisualRevision: (revision) =>
        scope.isCurrent() && visual.cancelIfVisualRevision(window, revision, store),
      leave: () => {
        if (scope.isCurrent()) visual.leave(window, store);
      },
      closePanel: () => {
        if (scope.isCurrent()) panel.close(state);
      },
      handlePanelKey: (event) => {
        if (scope.isCurrent()) panel.handleKey(event, window, state);
      },
      manageSelection: () => manageSelection(),
      toggleCurrentTarget,
      clearSelection: () => clearSelection(),
      enter: () => enter(),
      extend: (direction, count, shouldDebounce) => motions[direction]({ count, shouldDebounce }),
      swapEnds: () => swapEnds(),
      finish: () => finish(),
      cancel: () => cancel(),
    };
  });
}
