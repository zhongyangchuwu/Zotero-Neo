import type {
  CommandPaletteContext,
  MainWindow,
  MainWindowControllerApi,
  ReaderControllerApi,
  ReaderSelectionActionDefinition,
  ReaderSelectionApi,
} from './core/contracts';
import { ZoteroLogger } from './core/logging';
import { ZoteroPreferenceStore } from './core/preference-store';
import { migrateBindingPreferences, migrateReaderPreferences } from './core/preferences';
import { createMainWindowController } from './main/controller';
import { createReaderController } from './reader/controller';

export interface AddonContext {
  readonly id: string;
  readonly version: string;
  readonly rootURI: string;
  readonly mayClaimInitialLibraryFocus: boolean;
}

export interface ZoteroNeoPublicApi {
  readonly reader: ReaderSelectionApi;
  openSettings(owner?: Window | null): boolean;
}

export interface ZoteroNeoController {
  readonly api: ZoteroNeoPublicApi;
  init(context: AddonContext): void;
  shutdown(): void;
  addToWindow(window: MainWindow): void;
  removeFromWindow(window: MainWindow): void;
}

type ZoteroWithNeo = typeof Zotero & {
  Neo?: ZoteroNeoPublicApi;
};

export class ZoteroNeoAddon implements ZoteroNeoController {
  readonly #logger = new ZoteroLogger();
  readonly #preferences = new ZoteroPreferenceStore();
  readonly #reader: ReaderControllerApi;
  readonly #main: MainWindowControllerApi;
  readonly api: ZoteroNeoPublicApi;
  #context: AddonContext | null = null;
  #preferencesRegistered = false;

  constructor() {
    let main: MainWindowControllerApi | null = null;
    this.#reader = createReaderController({
      preferences: this.#preferences,
      logger: this.#logger,
      delegateMain(action, count, ownerWindow) {
        main?.executeFromReader(action, count, ownerWindow);
      },
      openCommandPalette(window: MainWindow, context: CommandPaletteContext) {
        main?.openCommandPalette(window, context);
      },
      captureReaderSelectionToNote(context, ownerWindow) {
        return main?.captureReaderSelectionToNote(context, ownerWindow) ?? Promise.resolve(false);
      },
    });
    this.#main = createMainWindowController({
      preferences: this.#preferences,
      logger: this.#logger,
      reader: this.#reader,
      mayClaimInitialLibraryFocus: () => this.#context?.mayClaimInitialLibraryFocus === true,
    });
    main = this.#main;
    this.api = {
      openSettings: (owner) => this.#main.openSettings(owner),
      reader: {
        getSelection: () => this.#reader.getSelection(),
        registerSelectionAction: (action: ReaderSelectionActionDefinition) =>
          this.#reader.registerSelectionAction(action),
      },
    };
  }

  init(context: AddonContext): void {
    this.#context = context;
    migrateBindingPreferences(this.#preferences);
    migrateReaderPreferences(this.#preferences);
    this.#registerPreferences();
    this.#reader.start(context.id);
    (Zotero as ZoteroWithNeo).Neo = this.api;
    this.#logger.debug(`Initialized v${context.version} on Zotero ${Zotero.version || '?'}`);
    this.#logger.diagnostic(
      `addon initialized version=${context.version} zotero=${Zotero.version || '?'}`,
    );
  }

  shutdown(): void {
    const host = Zotero as ZoteroWithNeo;
    if (host.Neo === this.api) delete host.Neo;
    this.#reader.shutdown();
    this.#main.shutdown();
    this.#logger.debug('Shut down');
    this.#logger.diagnostic('addon shut down');
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
      image: `${this.#context.rootURI}icons/icon-32x32.png`,
      scripts: [`${this.#context.rootURI}content/preferences/pane.js`],
    });
    this.#preferencesRegistered = true;
  }
}

export function createAddon(): ZoteroNeoController {
  return new ZoteroNeoAddon();
}
