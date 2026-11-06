import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSourceNoteIdentity } from '../../src/platform/note-relations';
import { ManagedTagAutocomplete } from '../../src/toolkit/main/managed-tags/autocomplete';

const prefix = 'urn:zotero-neo:chapter-note:v1:';
const hidden = prefix + 'a'.repeat(32);
const near = hidden + 'x';
type NativeResult = ReturnType<typeof result>;
type Observer = { onSearchResult(source: unknown, value: NativeResult): void };
type Provider = {
  startSearch(
    value: string,
    param: string,
    previous: unknown,
    listener: { onSearchResult(source: unknown, result: NativeResult): void },
  ): void;
  stopSearch(): void;
};

function result(values: string[], status = 4) {
  const entries = [...values];
  return {
    searchString: 'urn',
    searchResult: status,
    defaultIndex: 2,
    errorDescription: '',
    get matchCount() {
      return entries.length;
    },
    getValueAt: (index: number) => entries[index]!,
    getLabelAt: (index: number) => `label:${entries[index]}`,
    getCommentAt: (index: number) => `comment:${entries[index]}`,
    getStyleAt: (index: number) => `style:${entries[index]}`,
    getImageAt: (index: number) => `image:${entries[index]}`,
    getFinalCompleteValueAt: (index: number) => `final:${entries[index]}`,
    removeValueAt: vi.fn((index: number, _database: boolean) => {
      entries.splice(index, 1);
    }),
    isRemovableAt: (index: number) => entries[index] === near,
  };
}

function harness() {
  let factory: { createInstance(iid: unknown): Provider } | undefined;
  const callbacks: Observer[] = [];
  const native = {
    startSearch: vi.fn((_value: string, _param: string, _previous: unknown, observer: Observer) =>
      callbacks.push(observer),
    ),
    stopSearch: vi.fn(),
  };
  const registerFactory = vi.fn(
    (
      _cid: unknown,
      _description: string,
      _contract: string,
      value: { createInstance(iid: unknown): Provider },
    ) => {
      factory = value;
    },
  );
  const unregisterFactory = vi.fn();
  vi.stubGlobal('Components', {
    ID: (value: string) => value,
    manager: { QueryInterface: () => ({ registerFactory, unregisterFactory }) },
    interfaces: { nsIComponentRegistrar: {}, nsIAutoCompleteSearch: {} },
    utils: { waiveXrays: (value: object) => value },
    classes: { '@mozilla.org/autocomplete/search;1?name=zotero': { createInstance: () => native } },
  });
  vi.stubGlobal('ChromeUtils', {
    generateQI: () =>
      function (this: unknown) {
        return this;
      },
  });
  const errors = vi.fn();
  const managed = new ManagedTagAutocomplete(isSourceNoteIdentity, errors);
  managed.start();
  const search = factory!.createInstance({});
  const publish = vi.fn((_search: unknown, _result: NativeResult) => {});
  return {
    managed,
    search,
    native,
    callbacks,
    publish,
    errors,
    registerFactory,
    unregisterFactory,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('managed tag autocomplete', () => {
  it('projects only exact managed identities and maps all result methods and removals', () => {
    const h = harness();
    const native = result(['first', hidden, near, 'last']);
    h.search.startSearch('urn', '{}', null, { onSearchResult: h.publish });
    h.callbacks[0]!.onSearchResult(h.native, native);
    const projected = h.publish.mock.calls[0]![1];
    expect(projected.matchCount).toBe(3);
    expect(projected.defaultIndex).toBe(1);
    expect([0, 1, 2].map((i) => projected.getValueAt(i))).toEqual(['first', near, 'last']);
    expect(projected.getLabelAt(1)).toBe(`label:${near}`);
    expect(projected.getCommentAt(1)).toBe(`comment:${near}`);
    expect(projected.getStyleAt(1)).toBe(`style:${near}`);
    expect(projected.getImageAt(1)).toBe(`image:${near}`);
    expect(projected.getFinalCompleteValueAt(1)).toBe(`final:${near}`);
    expect(projected.isRemovableAt(1)).toBe(true);
    projected.removeValueAt(1, true);
    expect(native.removeValueAt).toHaveBeenCalledWith(2, true);
    expect(projected.getValueAt(1)).toBe('last');
    h.search.startSearch('next', '{}', projected, { onSearchResult: h.publish });
    expect(h.native.startSearch.mock.calls[1]![2]).toBe(native);
    h.managed.dispose();
  });

  it('returns correct no-match states while preserving other native statuses', () => {
    const h = harness();
    for (const [status, expected] of [
      [4, 3],
      [6, 5],
      [2, 2],
      [3, 3],
    ]) {
      h.search.startSearch('urn', '{}', null, { onSearchResult: h.publish });
      h.callbacks.at(-1)!.onSearchResult(h.native, result([hidden], status));
      const projected = h.publish.mock.calls.at(-1)![1];
      expect(projected.matchCount).toBe(0);
      expect(projected.searchResult).toBe(expected);
      expect(() => projected.getValueAt(0)).toThrow(RangeError);
      expect(() => projected.getValueAt(-1)).toThrow(RangeError);
    }
    h.search.startSearch('urn', '{}', null, { onSearchResult: h.publish });
    h.callbacks.at(-1)!.onSearchResult(h.native, result([hidden, near], 6));
    expect(h.publish.mock.calls.at(-1)![1].searchResult).toBe(6);
    h.managed.dispose();
  });

  it('suppresses superseded, stopped and disposed search callbacks', () => {
    const h = harness();
    const listener = { onSearchResult: h.publish };
    h.search.startSearch('a', '{}', null, listener);
    h.search.startSearch('b', '{}', null, listener);
    h.callbacks[0]!.onSearchResult(h.native, result(['old']));
    h.search.stopSearch();
    h.callbacks[1]!.onSearchResult(h.native, result(['stopped']));
    h.search.startSearch('c', '{}', null, listener);
    h.managed.dispose();
    h.callbacks[2]!.onSearchResult(h.native, result(['disposed']));
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.native.stopSearch).toHaveBeenCalledTimes(2);
    expect(h.unregisterFactory).toHaveBeenCalledOnce();
  });

  it('detaches one window without cancelling a different window pending search', () => {
    const h = harness();
    const factory = h.registerFactory.mock.calls[0]![3];
    const second = factory.createInstance({});
    class MutationObserver {
      observe() {}
      disconnect() {}
    }
    const controller: { input: { wrappedJSObject: object } | null; stopSearch(): void } = {
      input: null,
      stopSearch: () => second.stopSearch(),
    };
    const proxies: object[] = [];
    const makeWindow = (): Window => {
      const proxy = {};
      proxies.push(proxy);
      const document = { activeElement: null, querySelectorAll: () => [control] };
      const ref = {
        controller,
        nsIAutocompleteInput: proxy,
        ownerDocument: document,
        isConnected: true,
        detachController() {
          if (controller.input?.wrappedJSObject === proxy) {
            controller.stopSearch();
            controller.input = null;
          }
        },
        attachController() {
          controller.input = { wrappedJSObject: proxy };
        },
      };
      const control = {
        ownerDocument: document,
        isConnected: true,
        autocomplete: { search: 'zotero', searchParam: '{"fieldName":"tag"}' },
        ref,
        getAttribute: () => null,
        setAttribute() {},
      };
      return { document, MutationObserver } as unknown as Window;
    };
    const detachFirst = h.managed.attachWindow(makeWindow());
    h.managed.attachWindow(makeWindow());
    const firstResult = vi.fn();
    const secondResult = vi.fn();
    h.search.startSearch('a', '{}', null, { onSearchResult: firstResult });
    // Gecko shares one controller; moving focus retires A before B owns the input proxy.
    h.search.stopSearch();
    controller.input = { wrappedJSObject: proxies[1]! };
    second.startSearch('b', '{}', null, { onSearchResult: secondResult });
    detachFirst();
    h.callbacks[0]!.onSearchResult(h.native, result(['closed-window']));
    h.callbacks[1]!.onSearchResult(h.native, result(['still-open']));
    expect(firstResult).not.toHaveBeenCalled();
    expect(secondResult.mock.calls.map(([, value]) => value.getValueAt(0))).toEqual(['still-open']);
    h.managed.dispose();
  });
  it('refreshes the focused native provider cache so the previous provider cannot expose identities', () => {
    const h = harness();
    const factory = h.registerFactory.mock.calls[0]![3];
    let cachedSearch = 'zotero';
    const proxy = {};
    const controller: { input: { wrappedJSObject: object } | null } = {
      input: { wrappedJSObject: proxy },
    };
    class MutationObserver {
      observe() {}
      disconnect() {}
    }
    const document = { activeElement: null as object | null, querySelectorAll: () => [control] };
    const ref = {
      controller,
      nsIAutocompleteInput: proxy,
      ownerDocument: document,
      isConnected: true,
      detachController() {
        if (controller.input?.wrappedJSObject === proxy) controller.input = null;
      },
      attachController() {
        controller.input = { wrappedJSObject: proxy };
        cachedSearch = control.autocomplete.search;
      },
    };
    const control = {
      ownerDocument: document,
      isConnected: true,
      ref,
      autocomplete: { search: 'zotero', searchParam: '{"fieldName":"tag"}' },
      getAttribute: () => null,
      setAttribute() {},
    };
    document.activeElement = ref;
    h.managed.attachWindow({ document, MutationObserver } as unknown as Window);
    let visible: string[] = [];
    const listener = {
      onSearchResult(_search: unknown, value: NativeResult) {
        visible = Array.from({ length: value.matchCount }, (_, index) => value.getValueAt(index));
      },
    };
    if (cachedSearch === 'zotero') h.native.startSearch('urn', '{}', null, listener);
    else factory.createInstance({}).startSearch('urn', '{}', null, listener);
    h.callbacks.at(-1)!.onSearchResult(h.native, result([hidden, near]));
    expect(visible).toEqual([near]);
    h.managed.dispose();
  });
  it('routes only tag controls, updates recycled controls and restores owned state', () => {
    const h = harness();
    let notify = () => {};
    class MutationObserver {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
    const doc = { querySelectorAll: () => controls };
    const property = {
      ownerDocument: doc,
      isConnected: true,
      autocomplete: { search: 'zotero', searchParam: '{"fieldName":"tag"}', popup: 'popup' },
      getAttribute: () => null,
      setAttribute: vi.fn(),
    };
    const restored = {
      ownerDocument: doc,
      isConnected: true,
      autocomplete: { search: 'zotero', searchParam: '{"fieldName":"tag"}', popup: 'other' },
      getAttribute: () => null,
      setAttribute: vi.fn(),
    };
    const title = {
      ownerDocument: doc,
      isConnected: true,
      autocomplete: { search: 'zotero', searchParam: '{"fieldName":"title"}' },
      getAttribute: () => null,
      setAttribute: vi.fn(),
    };
    const attrs = new Map([
      ['autocompletesearch', 'zotero'],
      ['autocompletesearchparam', '{"fieldName":"tag"}'],
    ]);
    const attribute = {
      ownerDocument: doc,
      isConnected: true,
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
    };
    const controls = [property, title, attribute, restored];
    const detach = h.managed.attachWindow({ document: doc, MutationObserver } as unknown as Window);
    expect(property.autocomplete.search).toBe('zotero-neo-business-tags');
    expect(attrs.get('autocompletesearch')).toBe('zotero-neo-business-tags');
    expect(title.autocomplete.search).toBe('zotero');
    attrs.set('autocompletesearchparam', '{"fieldName":"creator"}');
    notify();
    expect(attrs.get('autocompletesearch')).toBe('zotero');
    property.autocomplete.search = 'another-provider';
    detach();
    expect(property.autocomplete.search).toBe('another-provider');
    expect(restored.autocomplete).toEqual({
      search: 'zotero',
      searchParam: '{"fieldName":"tag"}',
      popup: 'other',
    });
    h.managed.dispose();
  });
});
