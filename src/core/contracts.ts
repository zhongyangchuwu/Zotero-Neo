import type { ReaderDelegableMainAction } from '../main/action-capabilities';
import type { ActionId } from '../input/actions';
import type { BindingMap, Mode } from '../input/bindings';
import type { Logger } from './logging';
import type { PreferenceStore } from './preference-store';

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

export interface MainActionDelegate {
  executeFromReader(
    action: ReaderDelegableMainAction,
    count: number,
    ownerWindow: MainWindow | null,
  ): void;
  openCommandPalette(window: MainWindow, context: CommandPaletteContext): void;
  appendReaderSelectionToNote(
    context: ReaderSelectionContext,
    ownerWindow: MainWindow | null,
  ): void;
}

export interface ReaderControllerApi extends ReaderSelectionApi {
  start(pluginId: string): void;
  shutdown(): void;
  rescan(window: MainWindow): void;
  forwardKey(event: KeyboardEvent, window: MainWindow): void;
}

export interface MainWindowControllerApi extends MainActionDelegate {
  addWindow(window: MainWindow): void;
  removeWindow(window: MainWindow): void;
  shutdown(): void;
}

export interface ReaderControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly delegateMain: (
    action: ReaderDelegableMainAction,
    count: number,
    ownerWindow: MainWindow | null,
  ) => void;
  readonly openCommandPalette: (window: MainWindow, context: CommandPaletteContext) => void;
  readonly appendSelectionToNote: (
    context: ReaderSelectionContext,
    ownerWindow: MainWindow | null,
  ) => void;
}

export interface MainWindowControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly reader: Pick<ReaderControllerApi, 'rescan' | 'forwardKey'>;
}
