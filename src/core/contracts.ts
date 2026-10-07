import type { ActionId } from '../input/actions';
import type { BindingMap, Mode } from '../input/bindings';
import type { ItemTargetSet } from './item-target';
import type { Logger } from './logging';
import type { PreferenceStore } from './preference-store';
import type { NavigationPort } from '../navigation/types';

export type MainWindow = _ZoteroTypes.MainWindow;
export type ReaderInstance = _ZoteroTypes.ReaderInstance;

export type CommandPaletteMode = 'normal' | 'main' | 'note';

export interface CommandPaletteContext {
  readonly mode: CommandPaletteMode;
  readonly bindingMode: Mode;
  readonly actions: readonly ActionId[];
  readonly bindings: BindingMap;
  readonly language: 'en' | 'zh-CN';
  readonly execute: (action: ActionId, count: number) => void;
}

/** Stable, DOM-free snapshot passed to Selection Actions and other Zotero plugins. */
export interface ReaderSelectionContext {
  readonly text: string;
  readonly itemID: number | null;
  readonly pageLabel: string | null;
  readonly position: string | null;
}
/** PDF coordinates and view identity, without content-compartment objects. */
export interface ReaderJumpPosition {
  readonly primary: boolean;
  readonly pageIndex: number;
  readonly top: number;
  readonly left: number;
}

/** A tab ID is a hint; attachment identity survives closing and reopening its tab. */
export interface ReaderJumpLocation {
  readonly kind: 'reader';
  readonly tabID: string;
  readonly libraryID: number;
  readonly itemID: number;
  readonly position?: ReaderJumpPosition;
}

export interface ReaderSelectionActionOutcome {
  readonly title?: string;
  readonly body: string;
}

export interface ReaderSelectionActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly isAvailable?: (context: ReaderSelectionContext) => boolean;
  readonly run: (
    context: ReaderSelectionContext,
  ) => void | ReaderSelectionActionOutcome | Promise<void | ReaderSelectionActionOutcome>;
}

export interface ReaderSelectionApi {
  getSelection(): ReaderSelectionContext | null;
  registerSelectionAction(action: ReaderSelectionActionDefinition): () => void;
}

/** Concrete Main-window capabilities Reader can invoke without semantic Action redispatch. */
export interface ReaderMainOperations {
  openAllItemsPicker(ownerWindow: MainWindow | null): void;
  openCollectionItemsPicker(ownerWindow: MainWindow | null): void;
  openNotesPicker(ownerWindow: MainWindow | null): void;
  openPluginManager(ownerWindow: MainWindow | null): void;
  openSettingsFromReader(ownerWindow: MainWindow | null): void;
  navigateBackFromReader(ownerWindow: MainWindow | null, count?: number): void;
  navigateForwardFromReader(ownerWindow: MainWindow | null, count?: number): void;
  navigationForReader(ownerWindow: MainWindow | null): NavigationPort | null;
  openTabPicker(ownerWindow: MainWindow | null): void;
  closeReaderTab(ownerWindow: MainWindow | null): void;
  cycleReaderTab(ownerWindow: MainWindow | null, direction: -1 | 1): void;
  showReaderItemInLibrary(ownerWindow: MainWindow | null, targets: ItemTargetSet<'reader'>): void;
  openReaderTagPicker(
    ownerWindow: MainWindow | null,
    targets: ItemTargetSet<'reader'>,
    present: boolean,
  ): void;
  openReaderCollectionPicker(
    ownerWindow: MainWindow | null,
    present: boolean,
    resolveTargets: () => ItemTargetSet<'reader'>,
  ): void;
  openCommandPalette(window: MainWindow, context: CommandPaletteContext): void;
  captureReaderSelectionToNote(
    context: ReaderSelectionContext,
    ownerWindow: MainWindow | null,
  ): Promise<boolean>;
}

export interface ReaderControllerApi extends ReaderSelectionApi {
  start(pluginId: string): void;
  shutdown(): void;
  rescan(window: MainWindow): void;
  deactivateInactive(window: MainWindow, activeTabID: string | null): void;
  forwardKey(event: KeyboardEvent, window: MainWindow): void;
  captureJumpLocation(tabID: string, itemID?: number): ReaderJumpLocation | null;
  restoreJumpLocation(
    window: MainWindow,
    location: ReaderJumpLocation,
    isCurrent: () => boolean,
  ): Promise<string | null>;
}

export interface MainWindowControllerApi extends ReaderMainOperations {
  openSettings(owner?: Window | null): boolean;
  addWindow(window: MainWindow): void;
  removeWindow(window: MainWindow): void;
  shutdown(): void;
}

export interface ReaderControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly main: ReaderMainOperations;
}

export interface MainWindowControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly reader: Pick<
    ReaderControllerApi,
    'rescan' | 'deactivateInactive' | 'forwardKey' | 'captureJumpLocation' | 'restoreJumpLocation'
  >;
  readonly mayClaimInitialLibraryFocus?: () => boolean;
}
