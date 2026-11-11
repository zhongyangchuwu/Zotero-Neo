import { CleanupFailure } from '../core/cleanup';
import type {
  NativeReactLibrary,
  NativeReactView,
  NativeReactViewOptions,
  NativeUIRuntime,
  ReactView,
} from '../ui/react/types';
import { cloneInto, isDeadObject, nativeObjectIdentity } from './cross-compartment';

const CONTENT_URI = 'chrome://zotero-neo-ui/content/';
const H = 'http://www.w3.org/1999/xhtml';
interface RuntimeWindow extends Window {
  NeoReactRuntime?: NativeReactLibrary;
  NeoNativeUI?: NativeUIRuntime;
}
interface Registration {
  active: boolean;
  readonly owners: Set<OwnerEntry>;
  readonly chrome: { destruct(): void };
}
interface OwnerEntry {
  readonly owner: RuntimeWindow;
  readonly document: Document;
  readonly registration: Registration;
  readonly views: Set<() => void>;
  readonly unload: EventListener;
  active: boolean;
  library?: Promise<void>;
  libraryValue?: NativeReactLibrary;
  ui?: Promise<NativeUIRuntime>;
  uiValue?: NativeUIRuntime;
}
const owners = new WeakMap<Window, OwnerEntry>();
let registration: Registration | null = null;

function ownerCurrent(entry: OwnerEntry): boolean {
  if (!entry.active || !entry.registration.active || isDeadObject(entry.owner)) return false;
  try {
    return !entry.owner.closed && entry.owner.document === entry.document;
  } catch {
    return false;
  }
}

function retireOwner(entry: OwnerEntry): void {
  if (!entry.active) return;
  entry.active = false;
  entry.registration.owners.delete(entry);
  if (owners.get(entry.owner) === entry) owners.delete(entry.owner);
  const failure = new CleanupFailure();
  for (const dispose of entry.views) failure.run(dispose);
  entry.views.clear();
  if (!isDeadObject(entry.owner)) {
    failure.run(() => entry.owner.removeEventListener('unload', entry.unload));
    if (entry.uiValue) failure.run(() => entry.uiValue?.dispose());
    failure.run(() => {
      if (entry.owner.NeoNativeUI === entry.uiValue) delete entry.owner.NeoNativeUI;
      if (entry.owner.NeoReactRuntime === entry.libraryValue) delete entry.owner.NeoReactRuntime;
    });
  }
  failure.rethrow();
}

function ownerEntry(window: Window): OwnerEntry {
  const active = registration;
  if (!active?.active) throw new Error('Native UI resources are not registered');
  const owner = nativeObjectIdentity(window) as RuntimeWindow;
  const previous = owners.get(owner);
  if (previous && ownerCurrent(previous)) return previous;
  if (previous) retireOwner(previous);
  if (isDeadObject(owner) || owner.closed) throw new Error('Native UI owner is unavailable');
  const document = owner.document;
  const entry: OwnerEntry = {
    owner,
    document,
    registration: active,
    views: new Set(),
    active: true,
    unload: (event) => {
      if (event.target && nativeObjectIdentity(event.target) === nativeObjectIdentity(document))
        retireOwner(entry);
    },
  };
  owners.set(owner, entry);
  active.owners.add(entry);
  owner.addEventListener('unload', entry.unload);
  return entry;
}

/** Register static packaged resources for this add-on lifetime; no UI is loaded here. */
export function registerNativeUIResources(rootURI: string): () => void {
  if (registration?.active) throw new Error('Native UI resources already registered');
  const classes = Components.classes as unknown as {
    readonly '@mozilla.org/addons/addon-manager-startup;1': {
      getService(iid: unknown): {
        registerChrome(uri: unknown, entries: string[][]): { destruct(): void };
      };
    };
  };
  const startup = classes['@mozilla.org/addons/addon-manager-startup;1'].getService(
    Components.interfaces.amIAddonManagerStartup,
  );
  const active: Registration = {
    active: true,
    owners: new Set(),
    chrome: startup.registerChrome(Services.io.newURI(`${rootURI}manifest.json`), [
      ['content', 'zotero-neo-ui', 'content/'],
    ]),
  };
  registration = active;
  return () => {
    if (!active.active) return;
    active.active = false;
    if (registration === active) registration = null;
    const failure = new CleanupFailure();
    for (const entry of active.owners) failure.run(() => retireOwner(entry));
    active.owners.clear();
    failure.run(() => active.chrome.destruct());
    failure.rethrow();
  };
}

/** One statically vendored React instance per exact native Window/Document. */
export function ensureNativeReactRuntime(window: Window): Promise<void> {
  const entry = ownerEntry(window);
  if (entry.library) return entry.library;
  entry.library = Promise.resolve().then(() => {
    if (!ownerCurrent(entry)) throw new Error('Native React owner retired');
    const previous = entry.owner.NeoReactRuntime;
    Services.scriptloader.loadSubScript(`${CONTENT_URI}react-runtime.js`, entry.owner);
    const library = entry.owner.NeoReactRuntime;
    if (!library || library === previous) throw new Error('Native React runtime unavailable');
    entry.libraryValue = library;
  });
  void entry.library.catch(() => {
    if (ownerCurrent(entry)) entry.library = undefined;
  });
  return entry.library;
}

function loadUI(entry: OwnerEntry): Promise<NativeUIRuntime> {
  if (entry.ui) return entry.ui;
  entry.ui = ensureNativeReactRuntime(entry.owner).then(() => {
    if (!ownerCurrent(entry)) throw new Error('Native UI owner retired');
    const previous = entry.owner.NeoNativeUI;
    Services.scriptloader.loadSubScript(`${CONTENT_URI}native-ui.js`, entry.owner);
    const runtime = entry.owner.NeoNativeUI;
    if (!runtime || runtime === previous) throw new Error('Native UI renderer unavailable');
    entry.uiValue = runtime;
    return runtime;
  });
  void entry.ui.catch(() => {
    if (ownerCurrent(entry)) entry.ui = undefined;
  });
  return entry.ui;
}

/**
 * Mounts into an already owned HTML container without changing feature policy.
 * Models and commands cross the compartment only as data. Retirement fences both
 * deferred loading and later dispatch; host disposal unmounts before DOM removal.
 */
export function mountNativeReactView<Model extends object, Command>(
  options: NativeReactViewOptions<Model, Command>,
): NativeReactView<Model> {
  const owner = options.root.ownerDocument.defaultView;
  if (!owner) throw new Error('Native UI root has no owner window');
  const entry = ownerEntry(owner);
  let active = true;
  let model = options.model;
  let view: ReactView<unknown> | null = null;
  const current = (): boolean => {
    if (!active || !ownerCurrent(entry) || isDeadObject(options.root)) return false;
    return (
      options.root.isConnected &&
      nativeObjectIdentity(options.root.ownerDocument) === nativeObjectIdentity(entry.document) &&
      options.isCurrent()
    );
  };
  const status = entry.document.createElementNS(H, 'p');
  status.setAttribute('role', 'status');
  status.textContent = options.loadingText;
  options.root.append(status);
  const dispose = (): void => {
    if (!active) return;
    active = false;
    entry.views.delete(dispose);
    const mounted = view;
    view = null;
    if (mounted && !isDeadObject(entry.owner) && !isDeadObject(options.root)) mounted.dispose();
    if (!isDeadObject(status)) status.remove();
  };
  entry.views.add(dispose);
  const fail = (error: unknown): void => {
    if (!current()) return;
    const mounted = view;
    view = null;
    mounted?.dispose();
    status.setAttribute('role', 'alert');
    status.textContent = options.errorText;
    options.root.replaceChildren(status);
    options.onError(error);
  };
  const utils = Components.utils as unknown as {
    exportFunction(fn: (command: unknown) => void, target: Window): (command: unknown) => void;
  };
  const dispatch = utils.exportFunction((command) => {
    if (!current()) return;
    const copy = JSON.parse(JSON.stringify(nativeObjectIdentity(command as object))) as Command;
    if (current()) options.dispatch(copy);
  }, entry.owner);
  const ready = loadUI(entry)
    .then((runtime) => {
      if (!current()) throw new Error('Native UI view retired before mount');
      const mounted = runtime.mount(
        options.surface,
        options.root,
        cloneInto(model, entry.owner),
        dispatch,
      );
      if (!current()) {
        mounted.dispose();
        throw new Error('Native UI view retired while mounting');
      }
      view = mounted;
    })
    .catch((error: unknown) => {
      fail(error);
      throw error;
    });
  // Closing before load is an expected cancellation, even for synchronous openers.
  void ready.catch(() => undefined);
  return {
    ready,
    update(nextModel) {
      model = nextModel;
      if (!current() || !view) return;
      try {
        view.update(cloneInto(model, entry.owner));
      } catch (error) {
        fail(error);
      }
    },
    getElement(part) {
      return current() ? (view?.getElement(part) ?? null) : null;
    },
    dispose,
  };
}
