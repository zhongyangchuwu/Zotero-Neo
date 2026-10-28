import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import type { ActionId } from '../../input/actions';
import type { BindingContext } from '../../input/bindings';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { MainCurrentTarget, MainSelectionSource } from '../../main/action-targets';
import type { PickerOpenOptions } from '../../main/picker/types';
import type {
  NavigationCause,
  NavigationExecution,
  NavigationIntent,
  NavigationOperation,
  NavigationResult,
  NavigationSurface,
} from '../../navigation/types';
import { copyCitekeys } from '../../operations/citekeys';
import {
  focusMainQuickSearch,
  mainTreeFocused,
  openMainAdvancedSearch,
  openMainIdentifierLookup,
  type MainTreePanel as MainPanel,
} from '../../toolkit/main';
import { t } from '../../i18n';
import { createItemsProvider } from './items-provider';
import { MainLocalFind } from './local-find';
import { LibraryNavigation } from './navigation';

export interface LibraryModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly status: (message: string, milliseconds?: number) => void;
  readonly language: () => KeyGuideLanguage;
  readonly panel: () => MainPanel;
  readonly focusPanel: (panel: MainPanel) => boolean;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly leaveVisual: () => void;
  readonly prepareQuickSearch: () => void;
  readonly prepareIdentifierLookup: () => void;
  readonly choose: (kind: 'all' | 'collection', options: PickerOpenOptions) => Cleanup | null;
  readonly selectItem: (
    itemID: number,
    cause: NavigationCause,
    surface: NavigationSurface,
    isCurrent: () => boolean,
  ) => Promise<NavigationResult>;
  readonly executeNavigation: (
    intent: NavigationIntent,
    operation: NavigationOperation,
  ) => NavigationExecution;
  readonly scopeActivation: () => NavigationOperation;
}

export interface LibraryTrashRequest {
  readonly selection: MainSelectionSource | null;
  readonly currentTarget?: MainCurrentTarget | null;
  readonly afterTrash?: () => void;
}

type MotionDirection = 1 | -1 | 'first' | 'last';
type TreeAction =
  | 'mainTreeToggle'
  | 'mainTreeOpenOnly'
  | 'mainTreeCloseOnly'
  | 'mainTreeExpand'
  | 'mainTreeCollapse'
  | 'mainTreeParent'
  | 'mainTreeExpandAll'
  | 'mainTreeCollapseAll';

export interface LibraryModule {
  readonly isLocalFindOpen: boolean;
  handleLocalFindKey(event: KeyboardEvent): void;
  closeLocalFind(): void;
  openSearch(): boolean;
  repeatFind(direction: 1 | -1): boolean;
  quickSearch(): boolean;
  advancedSearch(): boolean;
  findItems(kind: 'all' | 'collection', surface: NavigationSurface): boolean;
  addByIdentifier(surface: 'main' | 'reader'): boolean;
  yankCitekeys(targets: ItemTargetSet<'main'> | ItemTargetSet<'note'>): boolean;
  openItem(item: Zotero.Item | null, surface: 'main' | 'note'): boolean;
  activate(item: Zotero.Item | null): boolean;
  trash(request: LibraryTrashRequest): boolean;
  restoreLastTrashed(): boolean;
  navigate(direction: MotionDirection, count: number, shouldDebounce?: boolean): boolean;
  tree(action: TreeAction): boolean;
}

/** Owns one Main window's Library workflows; shared navigation and input stay with the Surface. */
export function createLibraryModule(host: ModuleHost, ports: LibraryModuleHost): LibraryModule {
  return host.activate('library', (scope) => {
    const status = (message: string, milliseconds?: number) => {
      if (scope.isCurrent()) ports.status(message, milliseconds);
    };
    const navigation = new LibraryNavigation({
      window: ports.window,
      logger: ports.logger,
      status,
      panel: ports.panel,
      focusPanel: ports.focusPanel,
      isCurrent: () => scope.isCurrent(),
    });
    const execute = (
      cause: NavigationCause,
      surface: NavigationSurface,
      operation: NavigationOperation,
      panel?: MainPanel,
    ) =>
      ports.executeNavigation(
        {
          cause,
          surface,
          context: { mainPanel: panel, isCurrent: () => scope.isCurrent() },
        },
        operation,
      );
    const localFind = new MainLocalFind({
      window: ports.window,
      status,
      themeRoot: ports.themeRoot,
      isCurrent: () => scope.isCurrent(),
      navigate: (cause, move) => {
        execute(
          cause,
          'main',
          {
            dispatch: 'inline',
            start: () => ({
              kind: 'immediate',
              outcome: move()
                ? { kind: 'completed', evidence: 'settled-change' }
                : { kind: 'unchanged' },
            }),
          },
          'items',
        );
      },
    });
    let releaseChooser: Cleanup | null = null;
    scope.add(() => {
      const release = releaseChooser;
      releaseChooser = null;
      const failure = new CleanupFailure();
      failure.run(() => localFind.close(false));
      failure.run(() => release?.());
      failure.rethrow();
    });
    const bind = <Request>(action: ActionId, run: (request: Request) => void) =>
      host.bind<Request>(scope, 'main-normal', action, run);
    const search = (direction?: 1 | -1) => {
      if (!mainTreeFocused(ports.window, 'items')) {
        status('✗ Focus the items list first');
        return;
      }
      ports.leaveVisual();
      if (!scope.isCurrent()) return;
      if (direction) localFind.repeat(direction);
      else localFind.open();
    };
    const openSearch = bind<void>('openSearch', () => search());
    const next = bind<void>('findNext', () => search(1));
    const previous = bind<void>('findPrevious', () => search(-1));
    const quickSearch = bind<void>('mainQuickSearch', () => {
      ports.leaveVisual();
      if (!scope.isCurrent()) return;
      ports.prepareQuickSearch();
      if (scope.isCurrent() && !focusMainQuickSearch(ports.window))
        status('✗ Quick Search is unavailable in this view');
    });
    const advancedSearch = bind<void>('mainAdvancedSearch', () => {
      ports.leaveVisual();
      if (!scope.isCurrent()) return;
      void openMainAdvancedSearch(ports.window)
        .then((opened) => {
          if (!opened) status('✗ Advanced Search is unavailable');
        })
        .catch((error) => {
          ports.logger.debug(`open Advanced Search failed: ${String(error)}`);
          status('✗ Unable to open Advanced Search');
        });
    });
    const bindFind = (
      context: BindingContext,
      surface: NavigationSurface,
      kind: 'all' | 'collection',
    ) =>
      host.bind<void>(
        scope,
        context,
        kind === 'all' ? 'findAllItems' : 'findCollectionItems',
        () => {
          const cause = {
            kind: 'action',
            action: kind === 'all' ? 'findAllItems' : 'findCollectionItems',
          } as const;
          const release = ports.choose(kind, {
            source: createItemsProvider(ports.window, kind),
            confirm: async (candidate) => {
              if (!scope.isCurrent()) return;
              const result = await ports.selectItem(Number(candidate.id), cause, surface, () =>
                scope.isCurrent(),
              );
              if (result.kind === 'failed') throw result.error;
              if (result.kind === 'unavailable')
                throw new Error('Library selection is unavailable');
            },
          });
          if (!release) return;
          if (scope.isCurrent()) releaseChooser = release;
          else release();
        },
      );
    const find = {
      main: {
        all: bindFind('main-normal', 'main', 'all'),
        collection: bindFind('main-normal', 'main', 'collection'),
      },
      reader: {
        all: bindFind('reader-normal', 'reader', 'all'),
        collection: bindFind('reader-normal', 'reader', 'collection'),
      },
      note: {
        all: bindFind('note-normal', 'note', 'all'),
        collection: bindFind('note-normal', 'note', 'collection'),
      },
    };
    const identifier = (context: BindingContext) =>
      host.bind<void>(scope, context, 'mainAddByIdentifier', () => {
        ports.prepareIdentifierLookup();
        if (!scope.isCurrent()) return;
        try {
          if (!openMainIdentifierLookup(ports.window))
            status(t('status.identifierLookupUnavailable', ports.language()));
        } catch (error) {
          ports.logger.debug(`add by identifier failed: ${String(error)}`);
          status(t('status.identifierLookupFailed', ports.language()));
        }
      });
    const identifiers = { main: identifier('main-normal'), reader: identifier('reader-normal') };
    const yank = {
      main: host.bind<ItemTargetSet>(scope, 'main-normal', 'mainYankCitekey', (targets) =>
        status(copyCitekeys(targets)),
      ),
      note: host.bind<ItemTargetSet>(scope, 'note-normal', 'mainYankCitekey', (targets) =>
        status(copyCitekeys(targets)),
      ),
    };
    const open = (
      item: Zotero.Item | null,
      surface: 'main' | 'note',
      action: 'mainOpenPDF' | 'mainActivate',
    ) => {
      execute(
        { kind: 'action', action },
        surface,
        {
          dispatch: 'serial-navigation',
          start: (attempt) => ({
            kind: 'deferred',
            settled: navigation
              .openPDF(item, () => scope.isCurrent() && attempt.isCurrent())
              .then((opened) =>
                opened ? { kind: 'completed', evidence: 'settled-change' } : { kind: 'unchanged' },
              ),
          }),
        },
        surface === 'main' ? ports.panel() : undefined,
      );
    };
    const openItems = {
      main: bind<Zotero.Item | null>('mainOpenPDF', (item) => open(item, 'main', 'mainOpenPDF')),
      note: host.bind<Zotero.Item | null>(scope, 'note-normal', 'mainOpenPDF', (item) =>
        open(item, 'note', 'mainOpenPDF'),
      ),
    };
    const activate = bind<Zotero.Item | null>('mainActivate', (item) => {
      if (ports.panel() === 'collections')
        execute(
          { kind: 'action', action: 'mainActivate' },
          'main',
          ports.scopeActivation(),
          'collections',
        );
      else open(item, 'main', 'mainActivate');
    });
    const trash = bind<LibraryTrashRequest>('mainTrashItems', (request) => {
      void navigation
        .trashSelectedItems(request.selection, request.currentTarget, ports.language())
        .then((trashed) => {
          if (trashed && scope.isCurrent()) request.afterTrash?.();
        });
    });
    const restore = bind<void>('mainRestoreTrashedItems', () => {
      void navigation.restoreLastTrashedItems();
    });
    type Motion = { count: number; shouldDebounce?: boolean };
    const bindMotion = (action: ActionId, direction: MotionDirection) =>
      bind<Motion>(action, (request) => {
        execute(
          { kind: 'action', action },
          'main',
          {
            dispatch: 'inline',
            admission: direction === 1 || direction === -1 ? 'motion' : undefined,
            start: () => ({
              kind: 'immediate',
              outcome: navigation.navigate(direction, request.count, request.shouldDebounce)
                ? { kind: 'completed', evidence: 'settled-change' }
                : { kind: 'unchanged' },
            }),
          },
          ports.panel(),
        );
      });
    const motions = {
      1: bindMotion('mainNavDown', 1),
      '-1': bindMotion('mainNavUp', -1),
      first: bindMotion('mainNavFirst', 'first'),
      last: bindMotion('mainNavLast', 'last'),
    };
    const trees = {
      mainTreeToggle: bind<void>('mainTreeToggle', () => {
        void navigation.toggleTree();
      }),
      mainTreeOpenOnly: bind<void>('mainTreeOpenOnly', () => {
        void navigation.openTree();
      }),
      mainTreeCloseOnly: bind<void>('mainTreeCloseOnly', () => {
        void navigation.closeTree();
      }),
      mainTreeExpand: bind<void>('mainTreeExpand', () => navigation.expandTree()),
      mainTreeCollapse: bind<void>('mainTreeCollapse', () => navigation.collapseTree()),
      mainTreeParent: bind<void>('mainTreeParent', () => navigation.parentTree()),
      mainTreeExpandAll: bind<void>('mainTreeExpandAll', () => navigation.expandAll()),
      mainTreeCollapseAll: bind<void>('mainTreeCollapseAll', () => navigation.collapseAll()),
    };
    return {
      get isLocalFindOpen() {
        return scope.isCurrent() && localFind.isOpen;
      },
      handleLocalFindKey: (event) => {
        if (scope.isCurrent()) localFind.handleKey(event);
      },
      closeLocalFind: () => {
        if (scope.isCurrent()) localFind.close();
      },
      openSearch: () => openSearch(),
      repeatFind: (direction) => (direction > 0 ? next() : previous()),
      quickSearch: () => quickSearch(),
      advancedSearch: () => advancedSearch(),
      findItems: (kind, surface) => find[surface][kind](),
      addByIdentifier: (surface) => identifiers[surface](),
      yankCitekeys: (targets) => yank[targets.source](targets),
      openItem: (item, surface) => openItems[surface](item),
      activate,
      trash,
      restoreLastTrashed: () => restore(),
      navigate: (direction, count, shouldDebounce) => motions[direction]({ count, shouldDebounce }),
      tree: (action) => trees[action](),
    };
  });
}
