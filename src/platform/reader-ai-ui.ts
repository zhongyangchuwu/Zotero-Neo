import type { ReaderAICommand, ReaderAIUIRuntime } from '../reader-ai/view-contracts';
import { isDeadObject, nativeObjectIdentity } from './cross-compartment';

interface RuntimeWindow extends Window {
  NeoReaderAIUI?: ReaderAIUIRuntime;
}

interface RuntimeEntry {
  active: boolean;
  runtime?: ReaderAIUIRuntime;
  promise: Promise<ReaderAIUIRuntime>;
}

const runtimes = new WeakMap<Window, RuntimeEntry>();

interface WindowCloseObserver {
  observe(subject: object, topic: string): void;
}

interface WindowWatcher {
  openWindow(parent: Window, uri: string, name: string, features: string, args: null): Window;
  registerNotification(observer: WindowCloseObserver): void;
  unregisterNotification(observer: WindowCloseObserver): void;
}

export interface ReaderAIWindowHost {
  readonly uri: string;
  open(parent: Window): Window;
  observeClosed(window: Window, listener: () => void): () => void;
  dispose(): void;
}

/** Chrome windows require a registered chrome URI, not the add-on's file/jar URI. */
export function createReaderAIWindowHost(rootURI: string): ReaderAIWindowHost {
  const uri = 'chrome://zotero-neo-reader-ai/content/reader-ai-window.xhtml';
  const watcher = Services.ww as unknown as WindowWatcher;
  let registration: { destruct(): void } | null = null;
  let disposed = false;
  return {
    uri,
    open(parent) {
      if (disposed) throw new Error('Reader AI window host disposed');
      if (!registration) {
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
        registration = startup.registerChrome(Services.io.newURI(`${rootURI}manifest.json`), [
          ['content', 'zotero-neo-reader-ai', 'content/'],
        ]);
      }
      return nativeObjectIdentity(
        watcher.openWindow(
          nativeObjectIdentity(parent),
          uri,
          '_blank',
          'chrome,dialog=no,centerscreen,resizable,titlebar,close,width=440,height=720',
          null,
        ),
      );
    },
    observeClosed(window, listener) {
      const target = nativeObjectIdentity(window);
      let active = true;
      const observer: WindowCloseObserver = {
        observe(subject, topic) {
          if (active && topic === 'domwindowclosed' && nativeObjectIdentity(subject) === target)
            listener();
        },
      };
      watcher.registerNotification(observer);
      return () => {
        if (!active) return;
        active = false;
        watcher.unregisterNotification(observer);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const current = registration;
      registration = null;
      current?.destruct();
    },
  };
}

/** Load once per native owner, while allowing a later activation to retry failures. */
export function loadReaderAIUI(rootURI: string, window: Window): Promise<ReaderAIUIRuntime> {
  const owner = nativeObjectIdentity(window);
  const existing = runtimes.get(owner);
  if (existing) return existing.promise;

  const entry: RuntimeEntry = {
    active: true,
    promise: Promise.resolve().then(() => {
      if (!entry.active) throw new Error('Reader AI UI runtime released');
      if (isDeadObject(owner) || owner.closed)
        throw new Error('Reader AI owner window unavailable');
      const target = owner as RuntimeWindow;
      const previous = target.NeoReaderAIUI;
      // A previous add-on lifetime may have left a global behind. Always install ours.
      Services.scriptloader.loadSubScript(`${rootURI}content/reader-ai-ui.js`, owner);
      const runtime = target.NeoReaderAIUI;
      if (!runtime || runtime === previous) throw new Error('Reader AI UI runtime unavailable');
      entry.runtime = runtime;
      return runtime;
    }),
  };
  runtimes.set(owner, entry);
  void entry.promise.catch(() => {
    if (runtimes.get(owner) === entry) runtimes.delete(owner);
  });
  return entry.promise;
}

/** Release only this module lifetime's runtime, after its views have been disposed. */
export function releaseReaderAIUI(window: Window): void {
  if (isDeadObject(window)) return;
  const owner = nativeObjectIdentity(window);
  const entry = runtimes.get(owner);
  if (!entry) return;
  entry.active = false;
  runtimes.delete(owner);
  try {
    const target = owner as RuntimeWindow;
    if (entry.runtime && target.NeoReaderAIUI === entry.runtime) delete target.NeoReaderAIUI;
  } catch (error) {
    if (!isDeadObject(owner)) throw error;
  }
}

/** Export a callable into the owner's compartment, without exposing a privileged object. */
export function exportReaderAIDispatch(
  window: Window,
  dispatch: (command: ReaderAICommand) => void,
): (command: ReaderAICommand) => void {
  const utils = Components.utils as unknown as {
    exportFunction(
      fn: (command: ReaderAICommand) => void,
      target: Window,
    ): (command: ReaderAICommand) => void;
  };
  return utils.exportFunction((command) => {
    // Commands are plain JSON data. Recreate them in this compartment before dispatch.
    const copy = JSON.parse(JSON.stringify(nativeObjectIdentity(command))) as ReaderAICommand;
    dispatch(copy);
  }, window);
}
