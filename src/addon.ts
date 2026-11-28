import type {
  CommandPaletteContext,
  MainWindow,
  MainWindowControllerApi,
  ReaderControllerApi,
  ReaderSelectionApi,
} from './core/contracts';
import { NEO_READER_API_CHANGED } from './core/contracts';
import { CleanupFailure } from './core/cleanup';
import { ZoteroLogger } from './core/logging';
import { ZoteroPreferenceStore } from './core/preference-store';
import { migrateAppearancePreferences } from './core/appearance-preferences';
import { BuiltinModuleRuntime } from './core/module-runtime';
import {
  migrateBindingPreferences,
  neoCommandLanguage,
  migrateInteractionPreferences,
  migrateReaderPreferences,
} from './core/preferences';
import { createMainWindowController } from './main/controller';
import { createReaderController } from './reader/controller';
import { moduleStartupFlags } from './platform/module-startup';
import { registerMetadataReviewMenu } from './toolkit/main';
import { registerNativeUIResources } from './platform/native-ui';
import { createScholarlyMetadataService } from './scholarly';
import { createArtifactRepository } from './artifacts';
import { MetadataReviewController } from './metadata-review/controller';
import { workspaceExtensionEngine } from './modules/extensions/workspace';
import { SettingsSnapshotController } from './settings-snapshots/controller';
import { SettingsSnapshotService } from './settings-snapshots/service';
import { createSettingsTemplateCatalog } from './settings-snapshots/catalog';
import { createManagedSettingsSnapshots } from './settings-snapshots/managed';
import { createSettingsFileCodec } from './settings-snapshots/codec';
import { createSettingsSnapshotFiles } from './platform/settings-snapshots-files';
import type {
  ManagedSettingsSnapshotsPort,
  SettingsTemplateCatalogPort,
} from './settings-snapshots/ports';
import { nativeObjectIdentity } from './platform/cross-compartment';

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
  init(context: AddonContext): Promise<void>;
  shutdown(): void;
  addToWindow(window: MainWindow): void;
  removeFromWindow(window: MainWindow): void;
}

type ZoteroWithNeo = typeof Zotero & {
  Neo?: ZoteroNeoPublicApi;
};

export class ZoteroNeoAddon implements ZoteroNeoController {
  readonly #logger = new ZoteroLogger();
  readonly #preferences: ZoteroPreferenceStore;
  readonly #modules: BuiltinModuleRuntime;
  readonly #scholarly = createScholarlyMetadataService();
  readonly #artifacts = createArtifactRepository();
  readonly #metadataReview: MetadataReviewController;
  readonly #settingsSnapshots: SettingsSnapshotController;
  readonly #snapshotCatalog: SettingsTemplateCatalogPort;
  readonly #managedSnapshots: ManagedSettingsSnapshotsPort;
  readonly #mainWindows = new Map<Window, { owner: MainWindow; releaseSnapshots: () => void }>();
  readonly #reader: ReaderControllerApi;
  readonly #main: MainWindowControllerApi;
  readonly api: ZoteroNeoPublicApi;
  #context: AddonContext | null = null;
  #preferencesRegistered = false;
  #releaseNativeUI: (() => void) | null = null;
  #releaseMetadataReviewMenu: (() => void) | null = null;

  constructor(preferences: ZoteroPreferenceStore) {
    this.#preferences = preferences;
    this.#metadataReview = new MetadataReviewController(
      this.#scholarly,
      this.#artifacts,
      (message) => this.#logger.debug(message),
    );
    const version = (): string => {
      if (!this.#context) throw new Error('Settings snapshots require an initialized addon');
      return this.#context.version;
    };
    this.#snapshotCatalog = createSettingsTemplateCatalog(version);
    const snapshots = new SettingsSnapshotService(
      () => this.#snapshotCatalog.adapters,
      () => ({
        neo: version(),
        zotero: Zotero.version,
      }),
      workspaceExtensionEngine.capture,
    );
    const codec = createSettingsFileCodec();
    this.#managedSnapshots = createManagedSettingsSnapshots(
      snapshots,
      codec,
      this.#snapshotCatalog,
    );
    this.#settingsSnapshots = new SettingsSnapshotController(
      snapshots,
      codec,
      createSettingsSnapshotFiles(),
      (message) => this.#logger.debug(message),
      {
        catalog: this.#snapshotCatalog,
        managed: this.#managedSnapshots,
        extensions: workspaceExtensionEngine,
      },
    );
    this.#modules = new BuiltinModuleRuntime(
      this.#preferences,
      this.#logger,
      moduleStartupFlags(this.#preferences),
    );
    let main: MainWindowControllerApi | null = null;
    this.#reader = createReaderController({
      modules: this.#modules,
      scholarly: this.#scholarly,
      preferences: this.#preferences,
      logger: this.#logger,
      main: {
        openAddByIdentifier: (ownerWindow) => main?.openAddByIdentifier(ownerWindow),
        openAllItemsPicker: (ownerWindow) => main?.openAllItemsPicker(ownerWindow),
        openCollectionItemsPicker: (ownerWindow) => main?.openCollectionItemsPicker(ownerWindow),
        openNotesPicker: (ownerWindow) => main?.openNotesPicker(ownerWindow),
        openPluginManager: (ownerWindow) => main?.openPluginManager(ownerWindow),
        openZoteroBasesFromReader: (ownerWindow, showStatus) =>
          main?.openZoteroBasesFromReader(ownerWindow, showStatus),
        openSettingsFromReader: (ownerWindow) => main?.openSettingsFromReader(ownerWindow),
        navigateBackFromReader: (ownerWindow, count) =>
          main?.navigateBackFromReader(ownerWindow, count),
        navigateForwardFromReader: (ownerWindow, count) =>
          main?.navigateForwardFromReader(ownerWindow, count),
        navigationForReader: (ownerWindow) => main?.navigationForReader(ownerWindow) ?? null,
        openTabPicker: (ownerWindow) => main?.openTabPicker(ownerWindow),
        closeReaderTab: (ownerWindow) => main?.closeReaderTab(ownerWindow),
        cycleReaderTab: (ownerWindow, direction) => main?.cycleReaderTab(ownerWindow, direction),
        showReaderItemInLibrary: (ownerWindow, targets) =>
          main?.showReaderItemInLibrary(ownerWindow, targets),
        openReaderTagPicker: (ownerWindow, targets, present) =>
          main?.openReaderTagPicker(ownerWindow, targets, present),
        openReaderCollectionPicker: (ownerWindow, present, resolveTargets) =>
          main?.openReaderCollectionPicker(ownerWindow, present, resolveTargets),
        openCommandPalette: (window, context) => main?.openCommandPalette(window, context),
      },
    });
    this.#main = createMainWindowController({
      modules: this.#modules,
      metadataReview: this.#metadataReview,
      settingsSnapshots: this.#settingsSnapshots,
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
        registerSelectionAction: (action) => this.#reader.registerSelectionAction(action),
      },
    };
  }

  async init(context: AddonContext): Promise<void> {
    this.#context = context;
    // Bootstrap initializes both early and after Zotero initialization completes.
    this.#releaseNativeUI ??= registerNativeUIResources(context.rootURI);
    migrateInteractionPreferences(this.#preferences);
    migrateAppearancePreferences(this.#preferences);
    migrateBindingPreferences(this.#preferences);
    migrateReaderPreferences(this.#preferences);
    this.#registerPreferences();
    this.#registerMetadataReviewMenu(context.id);
    this.#reader.start(context.id);
    const host = Zotero as ZoteroWithNeo;
    if (host.Neo !== this.api) {
      host.Neo = this.api;
      Services.obs.notifyObservers(Services.obs, NEO_READER_API_CHANGED);
    }
    this.#logger.debug(`Initialized v${context.version} on Zotero ${Zotero.version || '?'}`);
    this.#logger.diagnostic(
      `addon initialized version=${context.version} zotero=${Zotero.version || '?'}`,
    );
  }

  shutdown(): void {
    const host = Zotero as ZoteroWithNeo;
    if (host.Neo === this.api) {
      delete host.Neo;
      Services.obs.notifyObservers(Services.obs, NEO_READER_API_CHANGED);
    }
    this.#context = null;
    const failure = new CleanupFailure();
    failure.run(() => this.#releaseMetadataReviewMenu?.());
    this.#releaseMetadataReviewMenu = null;
    failure.run(() => this.#metadataReview.dispose());
    for (const { releaseSnapshots } of this.#mainWindows.values()) failure.run(releaseSnapshots);
    this.#mainWindows.clear();
    failure.run(() => this.#managedSnapshots.dispose());
    failure.run(() => this.#snapshotCatalog.dispose());
    failure.run(() => this.#settingsSnapshots.dispose());
    failure.run(() => this.#scholarly.dispose());
    failure.run(() => this.#reader.shutdown());
    failure.run(() => this.#main.shutdown());
    const releaseNativeUI = this.#releaseNativeUI;
    this.#releaseNativeUI = null;
    failure.run(() => releaseNativeUI?.());
    failure.rethrow();
    this.#logger.debug('Shut down');
    this.#logger.diagnostic('addon shut down');
  }

  addToWindow(window: MainWindow): void {
    const identity = nativeObjectIdentity(window);
    const previous = this.#mainWindows.get(identity);
    const owner = previous?.owner ?? window;
    previous?.releaseSnapshots();
    this.#mainWindows.set(identity, {
      owner,
      releaseSnapshots: this.#managedSnapshots.start(owner),
    });
    this.#main.addWindow(owner);
  }

  removeFromWindow(window: MainWindow): void {
    const identity = nativeObjectIdentity(window);
    const entry = this.#mainWindows.get(identity);
    const owner = entry?.owner ?? window;
    this.#mainWindows.delete(identity);
    const failure = new CleanupFailure();
    if (entry) failure.run(entry.releaseSnapshots);
    failure.run(() => this.#settingsSnapshots.closeOwner(owner));
    failure.run(() => this.#main.removeWindow(owner));
    failure.rethrow();
  }

  #registerMetadataReviewMenu(pluginID: string): void {
    if (this.#releaseMetadataReviewMenu || !Zotero.MenuManager) return;
    try {
      this.#releaseMetadataReviewMenu = registerMetadataReviewMenu(pluginID, {
        resolveOwner: (window) => this.#mainWindows.get(nativeObjectIdentity(window))?.owner,
        language: () => neoCommandLanguage(this.#preferences, Zotero.locale ?? ''),
        reviewMetadata: (window, items) => this.#main.openMetadataReview(window, items),
      });
    } catch (error) {
      this.#logger.debug(`Metadata review menu: ${String(error)}`);
    }
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

export async function createAddon(): Promise<ZoteroNeoController> {
  return new ZoteroNeoAddon(new ZoteroPreferenceStore());
}
