import type { ActionId } from '../input/actions';
import type { Logger } from './logging';
import type { PreferenceStore } from './preference-store';

export type MainWindow = _ZoteroTypes.MainWindow;
export type ReaderInstance = _ZoteroTypes.ReaderInstance;

export interface MainActionDelegate {
  executeFromReader(action: ActionId, count: number): void;
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
  readonly delegateMain: (action: ActionId, count: number) => void;
}

export interface MainWindowControllerDependencies {
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly reader: ReaderControllerApi;
}
