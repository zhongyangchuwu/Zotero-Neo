import type { MainWindow, MainWindowControllerApi, ReaderControllerApi } from './core/contracts';
import { ZoteroLogger } from './core/logging';
import { ZoteroPreferenceStore } from './core/preference-store';
import { createMainWindowController } from './main/controller';
import { createReaderController } from './reader/controller';

export interface AddonContext {
  readonly id: string;
  readonly version: string;
  readonly rootURI: string;
}

export interface ZoteroNeoController {
  init(context: AddonContext): void;
  shutdown(): void;
  addToWindow(window: MainWindow): void;
  removeFromWindow(window: MainWindow): void;
}

export class ZoteroNeoAddon implements ZoteroNeoController {
  readonly #logger = new ZoteroLogger();
  readonly #preferences = new ZoteroPreferenceStore();
  readonly #reader: ReaderControllerApi;
  readonly #main: MainWindowControllerApi;
  #context: AddonContext | null = null;
  #preferencesRegistered = false;

  constructor() {
    let main: MainWindowControllerApi | null = null;
    this.#reader = createReaderController({
      preferences: this.#preferences,
      logger: this.#logger,
      delegateMain(action, count) {
        main?.executeFromReader(action, count);
      },
    });
    this.#main = createMainWindowController({
      preferences: this.#preferences,
      logger: this.#logger,
      reader: this.#reader,
    });
    main = this.#main;
  }

  init(context: AddonContext): void {
    this.#context = context;
    this.#registerPreferences();
    this.#reader.start(context.id);
    this.#logger.debug(`Initialized v${context.version} on Zotero ${Zotero.version || '?'}`);
  }

  shutdown(): void {
    this.#reader.shutdown();
    this.#main.shutdown();
    this.#logger.debug('Shut down');
    this.#context = null;
  }

  addToWindow(window: MainWindow): void {
    this.#main.addWindow(window);
  }

  removeFromWindow(window: MainWindow): void {
    this.#main.removeWindow(window);
  }

  #registerPreferences(): void {
    if (this.#preferencesRegistered || !this.#context || !Zotero.PreferencePanes) return;
    Zotero.PreferencePanes.register({
      pluginID: this.#context.id,
      id: 'zotero-neo-prefs',
      src: `${this.#context.rootURI}content/preferences/pane.xhtml`,
      label: 'Zotero Neo',
      image: `${this.#context.rootURI}icons/zotero-neo.svg`,
      scripts: [`${this.#context.rootURI}content/preferences/pane.js`],
    });
    this.#preferencesRegistered = true;
  }
}

export function createAddon(): ZoteroNeoController {
  return new ZoteroNeoAddon();
}
