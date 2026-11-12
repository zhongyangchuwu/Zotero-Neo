import { cloneInto, nativeObjectIdentity } from './cross-compartment';

interface WindowlessBrowser {
  docShell: {
    createAboutBlankDocumentViewer(principal: unknown, storagePrincipal: unknown): void;
    QueryInterface(iid: unknown): { readonly document: { readonly defaultView: Window | null } };
  };
  close(): void;
}
interface Runtime {
  generate(input: object): Promise<string>;
  cancel(id: string): void;
  dispose(): void;
}
interface RuntimeWindow extends Window {
  NeoAIRuntime?: Runtime;
}

export function createAIAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}

export function createAIRuntimeHost(rootURI: string): {
  generate(input: object): Promise<string>;
  cancel(id: string): void;
  dispose(): void;
} {
  let browser: WindowlessBrowser | undefined;
  let runtime: Runtime | undefined;
  let owner: Window | undefined;
  let disposed = false;
  function acquire(): Runtime {
    if (disposed) throw new Error('AI runtime disposed');
    if (runtime) return runtime;
    const appShell = Services.appShell as unknown as {
      createWindowlessBrowser(chrome: boolean): WindowlessBrowser;
    };
    const candidate = appShell.createWindowlessBrowser(true);
    try {
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      candidate.docShell.createAboutBlankDocumentViewer(principal, principal);
      const win = candidate.docShell.QueryInterface(Components.interfaces.nsIWebNavigation).document
        .defaultView;
      if (!win) throw new Error('AI runtime window unavailable');
      const target = nativeObjectIdentity(win as RuntimeWindow);
      Services.scriptloader.loadSubScript(`${rootURI}content/ai-runtime.js`, target);
      const installed = target.NeoAIRuntime;
      if (!installed) throw new Error('AI runtime unavailable');
      browser = candidate;
      owner = target;
      runtime = installed;
      return installed;
    } catch (error) {
      candidate.close();
      throw error;
    }
  }
  return {
    generate(input) {
      const instance = acquire();
      return instance.generate(cloneInto(input, owner!));
    },
    cancel(id) {
      runtime?.cancel(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        runtime?.dispose();
      } finally {
        browser?.close();
        browser = undefined;
        runtime = undefined;
        owner = undefined;
      }
    },
  };
}
