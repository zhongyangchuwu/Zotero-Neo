import { nativeObjectIdentity } from '../../../platform/cross-compartment';

const NATIVE_CONTRACT = '@mozilla.org/autocomplete/search;1?name=zotero';
const ALIAS = 'zotero-neo-business-tags';
const ALIAS_CONTRACT = `@mozilla.org/autocomplete/search;1?name=${ALIAS}`;
const CID = '{8f965744-3d5c-49a4-b545-7789a330a0da}';

interface Result {
  readonly searchString: string;
  readonly searchResult: number;
  readonly defaultIndex: number;
  readonly errorDescription: string;
  readonly matchCount: number;
  getValueAt(index: number): string;
  getLabelAt(index: number): string;
  getCommentAt(index: number): string;
  getStyleAt(index: number): string;
  getImageAt(index: number): string;
  getFinalCompleteValueAt(index: number): string;
  isRemovableAt(index: number): boolean;
  removeValueAt(index: number, removeFromDatabase?: boolean): void;
}
interface Listener {
  QueryInterface?: unknown;
  onSearchResult(search: Search, result: Result): void;
}
interface Search {
  startSearch(value: string, param: string, previous: Result | null, listener: Listener): void;
  stopSearch(): void;
}
interface Registrar {
  registerFactory(cid: unknown, description: string, contract: string, factory: object): void;
  unregisterFactory(cid: unknown, factory: object): void;
}
interface NativeInput extends Element {
  controller?: { input?: { wrappedJSObject?: object } | null };
  nsIAutocompleteInput?: object;
  attachController(): void;
  detachController(): void;
}
interface Control extends Element {
  autocomplete?: { search?: string; searchParam?: string; [key: string]: unknown } | string;
  ref?: NativeInput;
}

type OwnedControl = { kind: 'property' } | { kind: 'attribute' };

function tagParameter(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      !!parsed && typeof parsed === 'object' && 'fieldName' in parsed && parsed.fieldName === 'tag'
    );
  } catch {
    return false;
  }
}

/** A native provider alias used only by tag autocomplete controls. */
export class ManagedTagAutocomplete {
  readonly #windows = new Set<() => void>();
  readonly #active = new Set<{ stopSearch(): void }>();
  readonly #nativeResults = new WeakMap<object, Result>();
  #registration: { registrar: Registrar; cid: unknown; factory: object } | null = null;
  #disposed = false;
  readonly #isManaged: (name: string) => boolean;
  readonly #onError: (error: unknown) => void;

  constructor(isManaged: (name: string) => boolean, onError: (error: unknown) => void) {
    this.#isManaged = isManaged;
    this.#onError = onError;
  }

  start(): void {
    if (this.#registration || this.#disposed) return;
    const components = Components as unknown as {
      ID(value: string): unknown;
      manager: { QueryInterface(iid: unknown): Registrar };
      interfaces: { nsIComponentRegistrar: unknown; nsIAutoCompleteSearch: unknown };
      classes: Record<string, { createInstance(iid: unknown): Search }>;
    };
    const qi = (interfaces: string[]) =>
      ChromeUtils.generateQI(interfaces) as unknown as (iid: unknown) => unknown;
    const registrar = components.manager.QueryInterface(
      components.interfaces.nsIComponentRegistrar,
    );
    const cid = components.ID(CID);
    const owner = this;
    const factory = {
      QueryInterface: qi(['nsIFactory']),
      createInstance(iid: unknown) {
        const native = components.classes[NATIVE_CONTRACT]!.createInstance(
          components.interfaces.nsIAutoCompleteSearch,
        );
        let generation = 0;
        const search = {
          QueryInterface: qi(['nsIAutoCompleteSearch']),
          startSearch(value: string, param: string, previous: Result | null, listener: Listener) {
            if (owner.#disposed) return;
            const current = ++generation;
            owner.#active.add(search);
            const unwrapped = previous && (owner.#nativeResults.get(previous) ?? previous);
            try {
              native.startSearch(value, param, unwrapped, {
                QueryInterface: qi(['nsIAutoCompleteObserver']),
                onSearchResult(_source, result) {
                  if (owner.#disposed || current !== generation) return;
                  try {
                    const projected = owner.#project(result);
                    if (result.searchResult !== 5 && result.searchResult !== 6) {
                      owner.#active.delete(search);
                    }
                    listener.onSearchResult(search, projected);
                  } catch (error) {
                    owner.#active.delete(search);
                    owner.#onError(error);
                  }
                },
              });
            } catch (error) {
              owner.#active.delete(search);
              throw error;
            }
          },
          stopSearch() {
            ++generation;
            owner.#active.delete(search);
            native.stopSearch();
          },
        };
        return search.QueryInterface(iid);
      },
    };
    registrar.registerFactory(cid, 'Neo business tag autocomplete', ALIAS_CONTRACT, factory);
    this.#registration = { registrar, cid, factory };
  }

  #project(native: Result): Result {
    const indices: number[] = [];
    for (let i = 0; i < native.matchCount; i++) {
      if (!this.#isManaged(native.getValueAt(i))) indices.push(i);
    }
    const nativeIndex = (index: number): number => {
      const mapped = indices[index];
      if (mapped === undefined) throw new RangeError('Autocomplete result index is out of bounds');
      return mapped;
    };
    const result: Result = {
      QueryInterface: ChromeUtils.generateQI(['nsIAutoCompleteResult']),
      get searchString() {
        return native.searchString;
      },
      get searchResult() {
        if (indices.length || (native.searchResult !== 4 && native.searchResult !== 6)) {
          return native.searchResult;
        }
        return native.searchResult === 6 ? 5 : 3;
      },
      get defaultIndex() {
        return indices.indexOf(native.defaultIndex);
      },
      get errorDescription() {
        return native.errorDescription;
      },
      get matchCount() {
        return indices.length;
      },
      getValueAt(index) {
        return native.getValueAt(nativeIndex(index));
      },
      getLabelAt(index) {
        return native.getLabelAt(nativeIndex(index));
      },
      getCommentAt(index) {
        return native.getCommentAt(nativeIndex(index));
      },
      getStyleAt(index) {
        return native.getStyleAt(nativeIndex(index));
      },
      getImageAt(index) {
        return native.getImageAt(nativeIndex(index));
      },
      getFinalCompleteValueAt(index) {
        return native.getFinalCompleteValueAt(nativeIndex(index));
      },
      isRemovableAt(index) {
        return native.isRemovableAt(nativeIndex(index));
      },
      removeValueAt(index, removeFromDatabase) {
        const original = nativeIndex(index);
        native.removeValueAt(original, removeFromDatabase);
        indices.splice(index, 1);
        for (let i = index; i < indices.length; i++) indices[i]!--;
      },
    } as Result;
    this.#nativeResults.set(result, native);
    return result;
  }

  attachWindow(window: Window): () => void {
    if (this.#disposed || !this.#registration) return () => {};
    const owned = new Map<Control, OwnedControl>();
    let detached = false;
    const nativeInput = (control: Control): NativeInput =>
      nativeObjectIdentity(control.ref ?? control) as NativeInput;
    const ownsController = (input: NativeInput): boolean => {
      const current = input.controller?.input?.wrappedJSObject;
      return (
        !!current &&
        !!input.nsIAutocompleteInput &&
        nativeObjectIdentity(current) === nativeObjectIdentity(input.nsIAutocompleteInput)
      );
    };
    const replaceSearch = (control: Control, kind: OwnedControl['kind'], search: string): void => {
      const previous = nativeInput(control);
      const active = ownsController(previous);
      // Gecko shares a controller across windows and caches searches when its input is bound.
      if (active) previous.detachController();
      try {
        if (kind === 'property') {
          const config = control.autocomplete;
          if (!config || typeof config !== 'object')
            throw new Error('Tag autocomplete configuration disappeared');
          control.autocomplete = { ...config, search };
        } else {
          control.setAttribute('autocompletesearch', search);
        }
      } finally {
        if (active) {
          const next = nativeInput(control);
          const focused = next.ownerDocument.activeElement;
          if (next.isConnected && focused && nativeObjectIdentity(focused) === next)
            next.attachController();
        }
      }
    };
    const restore = (control: Control, state: OwnedControl) => {
      if (state.kind === 'property') {
        const config = control.autocomplete;
        if (config && typeof config === 'object' && config.search === ALIAS) {
          replaceSearch(control, state.kind, 'zotero');
        }
      } else if (control.getAttribute('autocompletesearch') === ALIAS) {
        replaceSearch(control, state.kind, 'zotero');
      }
    };
    const reconcile = (control: Control): void => {
      const state = owned.get(control);
      const config = control.autocomplete;
      if (state) {
        const valid =
          control.isConnected &&
          control.ownerDocument === window.document &&
          (state.kind === 'property'
            ? config &&
              typeof config === 'object' &&
              config.search === ALIAS &&
              tagParameter(config.searchParam)
            : control.getAttribute('autocompletesearch') === ALIAS &&
              tagParameter(control.getAttribute('autocompletesearchparam')));
        if (valid) return;
        restore(control, state);
        owned.delete(control);
      }
      if (control.isConnected && control.ownerDocument === window.document) {
        const latest = control.autocomplete;
        if (
          latest &&
          typeof latest === 'object' &&
          latest.search === 'zotero' &&
          tagParameter(latest.searchParam)
        ) {
          replaceSearch(control, 'property', ALIAS);
          owned.set(control, { kind: 'property' });
        } else if (
          control.getAttribute('autocompletesearch') === 'zotero' &&
          tagParameter(control.getAttribute('autocompletesearchparam'))
        ) {
          replaceSearch(control, 'attribute', ALIAS);
          owned.set(control, { kind: 'attribute' });
        }
      }
    };
    const scan = (records?: readonly MutationRecord[]): void => {
      if (detached) return;
      try {
        if (!records) {
          for (const control of window.document.querySelectorAll<Control>(
            'editable-text, [autocompletesearch]',
          )) {
            if (control) reconcile(control as Control);
          }
        } else {
          let removed = false;
          for (const record of records) {
            if (record.type === 'attributes' && record.target.nodeType === 1) {
              reconcile(record.target as Control);
            }
            for (const node of record.addedNodes) {
              if (node?.nodeType !== 1) continue;
              reconcile(node as Control);
              for (const control of (node as Element).querySelectorAll<Control>(
                'editable-text, [autocompletesearch]',
              )) {
                if (control) reconcile(control as Control);
              }
            }
            removed ||= record.removedNodes.length > 0;
          }
          if (removed) {
            for (const control of owned.keys()) {
              if (!control.isConnected || control.ownerDocument !== window.document) {
                reconcile(control);
              }
            }
          }
        }
      } catch (error) {
        this.#onError(error);
      }
    };
    const Observer = (window as unknown as { MutationObserver: typeof MutationObserver })
      .MutationObserver;
    const observer = new Observer(scan);
    observer.observe(window.document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['autocomplete', 'autocompletesearch', 'autocompletesearchparam'],
    });
    scan();
    const detach = () => {
      if (detached) return;
      detached = true;
      observer.disconnect();
      for (const [control, state] of owned) {
        try {
          restore(control, state);
        } catch (error) {
          this.#onError(error);
        }
      }
      owned.clear();
      this.#windows.delete(detach);
    };
    this.#windows.add(detach);
    return detach;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const detach of this.#windows) detach();
    for (const search of this.#active) {
      try {
        search.stopSearch();
      } catch (error) {
        this.#onError(error);
      }
    }
    const registration = this.#registration;
    this.#registration = null;
    if (registration)
      registration.registrar.unregisterFactory(registration.cid, registration.factory);
  }
}
