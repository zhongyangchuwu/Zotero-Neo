import type { ReaderDelegableMainAction } from '../main/action-capabilities';
import type { ActionId } from '../input/actions';
import type { BindingMap } from '../input/bindings';
import type { Logger } from './logging';
import type { PreferenceStore } from './preference-store';

export type MainWindow = _ZoteroTypes.MainWindow;
export type ReaderInstance = _ZoteroTypes.ReaderInstance;

export type CommandPaletteMode = 'normal' | 'main';

export interface CommandPaletteContext {
  readonly mode: CommandPaletteMode;
  readonly actions: readonly ActionId[];
  readonly bindings: BindingMap;
  readonly language: 'en' | 'zh-CN';
  readonly execute: (action: ActionId, count: number) => void;
}

export interface MainActionDelegate {
  executeFromReader(
    action: ReaderDelegableMainAction,
    count: number,
    ownerWindow: MainWindow | null,
  ): void;
  openCommandPalette(window: MainWindow, context: CommandPaletteContext): void;
}

export interface ReaderControllerApi {
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
}

export interface MainWindowControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly reader: ReaderControllerApi;
}
