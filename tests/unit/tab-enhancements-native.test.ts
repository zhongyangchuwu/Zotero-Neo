import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTabEnhancementHost,
  prepareTabEnhancementData,
} from '../../src/toolkit/main/tab-enhancements';
import { mountRail } from '../../src/toolkit/main/tab-enhancements/layout';

vi.mock('../../src/platform/cross-compartment', () => ({
  cloneInto: (value: object) => structuredClone(value),
}));

const oldZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  vi.useRealTimers();
  if (oldZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', oldZotero);
});

function fixture(options: { prefix?: string; copiedData?: Record<string, unknown> } = {}) {
  vi.useFakeTimers();
  let counter = 0;
  const item = {
    id: 7,
    libraryID: 1,
    key: 'PDF',
    parentItemID: 8,
    attachmentFilename: 'paper.pdf',
    deleted: false,
    isAttachment: () => true,
    isNote: () => false,
    getTabTitle: async () => 'PDF',
  };
  const parent = {
    id: 8,
    deleted: false,
    isRegularItem: () => true,
    getCreators: () => [{ lastName: 'Smith' }],
    getField: (name: string) =>
      ({ title: 'Paper', date: '2020-06-10', citationKey: 'Smith2020' })[name] || '',
  };
  const data = { itemID: 7, native: 'untouched' };
  const tabs = {
    _selectedID: 'zotero-pane',
    _tabs: [
      { id: 'zotero-pane', type: 'library', title: 'Library', data: {} as Record<string, unknown> },
      {
        id: 'a',
        type: 'reader',
        title: 'A',
        data: options.copiedData ?? { ...data },
      },
      { id: 'b', type: 'reader', title: 'B', data: { ...data } },
    ],
    _update: vi.fn(),
    _openMenu: vi.fn(),
    toggleAudio: vi.fn(),
    setTabData(id: string, patch: Record<string, unknown>) {
      Object.assign(this._tabs.find((tab) => tab.id === id)!.data, patch);
    },
    select: vi.fn(),
    close: vi.fn(),
    move: vi.fn(),
    add: vi.fn((options: { type: string; title: string; data: Record<string, unknown> }) => {
      tabs._tabs.push({ id: 'added', ...options });
      return { id: 'added' };
    }),
  };
  let notify = () => {};
  Reflect.set(globalThis, 'Zotero', {
    Items: {
      get: (id: number) => (id === 7 ? item : id === 8 ? parent : null),
      getByLibraryAndKey: (libraryID: number, key: string) =>
        libraryID === 1 && key === 'PDF' ? item : null,
    },
    Notifier: {
      registerObserver: (observer: { notify: () => void }) => {
        notify = observer.notify;
        return 1;
      },
      unregisterObserver: vi.fn(),
    },
  });
  const window = {
    document: {},
    closed: false,
    crypto: { randomUUID: () => `${options.prefix ?? 'uid'}-${++counter}` },
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    Zotero_Tabs: tabs,
  } as unknown as Window;
  const host = createTabEnhancementHost(window, vi.fn());
  return { host, tabs, item, notify: () => notify() };
}

describe('native tab enhancement host', () => {
  it('projects audio and delegates native controls only for live window tabs', () => {
    const h = fixture();
    Object.assign(h.tabs._tabs[1]!, { audioStatus: { active: true, paused: true } });
    h.tabs._update();
    vi.runOnlyPendingTimers();
    const tab = h.host.snapshot().find((item) => item.nativeID === 'a')!;
    expect(tab.audioStatus).toEqual({ active: true, paused: true });
    h.host.toggleAudio(tab.viewID);
    expect(h.tabs.toggleAudio).toHaveBeenCalledWith('a');
    const removed: string[] = [];
    const menuItems = ['tabs.moveToStart', 'tabs.moveToEnd', 'tabs.moveToWindow'].map((label) => ({
      localName: 'menuitem',
      getAttribute: () => label,
      remove: () => removed.push(label),
    }));
    const popup = {
      children: [
        {
          localName: 'menu',
          getAttribute: () => 'tabs.move',
          querySelector: () => ({ children: menuItems }),
        },
      ],
      hidePopup: vi.fn(),
    };
    Reflect.set(Zotero, 'getString', (key: string) => key);
    h.tabs._openMenu.mockReturnValue(popup);
    h.host.openNativeMenu(tab.viewID, 120, 80);
    vi.runOnlyPendingTimers();
    expect(h.tabs._openMenu).toHaveBeenCalledWith(120, 80, 'a');
    expect(removed).toEqual(['tabs.moveToStart', 'tabs.moveToEnd']);
    h.host.openNativeMenu('missing', 0, 0);
    vi.runOnlyPendingTimers();
    expect(h.tabs._openMenu).toHaveBeenCalledTimes(1);
    h.host.dispose();
  });
  it('waits for saved and open-tab libraries before accessing their items', async () => {
    const pending = Promise.withResolvers<void>();
    const load = vi.fn((id: number) => (id === 2 ? pending.promise : Promise.resolve()));
    const get = vi.fn((id: number) => (id === 99 ? false : { waitForDataLoad: () => load(id) }));
    Reflect.set(globalThis, 'Zotero', {
      Items: {
        getLibraryAndKeyFromID: (id: number) => (id === 7 ? { libraryID: 1, key: 'PDF' } : false),
      },
      Libraries: { get },
    });
    const window = {
      Zotero_Tabs: { _tabs: [{ data: { itemID: 7 } }, { data: { itemID: 7 } }, { data: {} }] },
    } as unknown as Window;
    let completed = false;
    const preparation = prepareTabEnhancementData(window, [2, 2, 99]).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(get.mock.calls.map(([id]) => id).sort()).toEqual([1, 2, 99]);
    expect(load.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
    pending.resolve();
    await preparation;
    expect(completed).toBe(true);
  });
  it('preserves native data and distinct persistent per-view IDs through unload settlement', () => {
    const h = fixture();
    const first = h.host.snapshot();
    expect(first[1]!.viewID).not.toBe(first[2]!.viewID);
    expect(first[1]!.fields).toMatchObject({
      title: 'Paper',
      citekey: 'Smith2020',
      author: 'Smith',
      year: '2020',
      filename: 'paper.pdf',
    });
    expect(Object.isFrozen(first[1]!.fields)).toBe(true);
    expect(h.tabs._tabs[1]!.data.native).toBe('untouched');
    const listener = vi.fn();
    h.host.observe(listener);
    const old = h.tabs._tabs.splice(1, 1)[0]!;
    h.tabs._update();
    h.tabs._tabs.splice(1, 0, { ...old, type: 'reader-unloaded' });
    h.tabs._update();
    expect(listener).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(h.host.snapshot()[1]).toMatchObject({
      nativeID: 'a',
      viewID: first[1]!.viewID,
      state: 'unloaded',
    });
    h.host.dispose();
  });

  it('assigns copied tabs distinct identities across windows and releases retired claims', () => {
    const first = fixture({ prefix: 'first' });
    const original = first.host.snapshot()[1]!.viewID;
    const sharedData = first.tabs._tabs[1]!.data;
    const second = fixture({ prefix: 'second', copiedData: sharedData });
    const duplicate = second.host.snapshot()[1]!.viewID;
    expect(duplicate).not.toBe(original);
    expect(first.host.snapshot()[1]!.viewID).toBe(original);
    expect(first.tabs._tabs[1]!.data).toBe(sharedData);
    expect(second.tabs._tabs[1]!.data).not.toBe(sharedData);
    expect(sharedData.zoteroNeoTabEnhancements).toEqual({ version: 1, viewID: original });
    expect(second.tabs._tabs[1]!.data.zoteroNeoTabEnhancements).toEqual({
      version: 1,
      viewID: duplicate,
    });
    first.host.dispose();
    const restored = fixture({ prefix: 'third', copiedData: sharedData });
    expect(restored.host.snapshot()[1]!.viewID).toBe(original);
    second.host.dispose();
    restored.host.dispose();
  });

  it('uses native insertion boundaries and protects the library tab', () => {
    const h = fixture();
    h.host.move('a', 'b');
    h.host.move('b', 'a');
    h.host.move('a', null);
    h.host.move('zotero-pane', null);
    expect(h.tabs.move.mock.calls).toEqual([
      ['a', 2],
      ['b', 1],
      ['a', 3],
    ]);
    h.host.close(['zotero-pane', 'a']);
    expect(h.tabs.close).toHaveBeenCalledWith(['a']);
    h.host.dispose();
  });

  it('admits an unloaded real tab in its owner only after the asynchronous title resolves', async () => {
    const h = fixture();
    const ref = { kind: 'reader' as const, libraryID: 1, key: 'PDF' };
    let current = true;
    const denied = h.host.open(ref, 'saved', () => current);
    current = false;
    expect(await denied).toBe(false);
    expect(h.tabs.add).not.toHaveBeenCalled();
    current = true;
    expect(await h.host.open(ref, 'saved', () => current)).toBe('added');
    expect(h.tabs.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reader-unloaded',
        select: false,
        data: expect.objectContaining({
          itemID: 7,
          zoteroNeoTabEnhancements: { version: 1, viewID: 'saved' },
        }),
      }),
    );
    h.host.dispose();
  });

  it('refreshes item metadata on notifier events and returns null for missing references', () => {
    const h = fixture();
    const listener = vi.fn();
    h.host.observe(listener);
    h.item.deleted = true;
    h.notify();
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(h.host.metadata({ kind: 'reader', libraryID: 1, key: 'PDF' })).toBeNull();
    h.host.dispose();
  });
});
class EventTargetFixture {
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(type: string, listener: unknown) {
    if (typeof listener !== 'function') return;
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener as (event: unknown) => void);
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: unknown) {
    if (typeof listener === 'function')
      this.#listeners.get(type)?.delete(listener as (event: unknown) => void);
  }
  emit(type: string, event: unknown) {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}
class Element extends EventTargetFixture {
  children: Element[] = [];
  parentNode: Element | null = null;
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  style = {
    display: '',
    width: '',
    flex: '',
    cssText: '',
    paddingInlineStart: '',
    paddingInlineEnd: '',
    getPropertyValue: (name: string) => (name === 'display' ? this.style.display : ''),
    getPropertyPriority: () => '',
    setProperty: (name: string, value: string) => {
      if (name === 'display') this.style.display = value;
    },
    removeProperty: (name: string) => {
      if (name === 'display') this.style.display = '';
    },
  };
  tabIndex = 0;
  get parentElement() {
    return this.parentNode;
  }
  get nextSibling(): Element | null {
    if (!this.parentNode) return null;
    return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] ?? null;
  }
  insertBefore(node: Element, before: Element | null) {
    node.remove();
    const index = before ? this.children.indexOf(before) : -1;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node.parentNode = this;
  }
  appendChild(node: Element) {
    this.insertBefore(node, null);
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

function railFixture(side: 'left' | 'right', width: number) {
  const browser = new Element();
  const content = new Element();
  const title = new Element();
  const strip = new Element();
  const toolbar = new Element();
  const root = new Element();
  const slot = new Element();
  browser.appendChild(content);
  title.appendChild(strip);
  title.appendChild(toolbar);
  root.appendChild(slot);
  const nodes: Record<string, Element> = {
    browser,
    appcontent: content,
    'zotero-title-bar': title,
    'tab-bar-container': strip,
    'zotero-tabs-toolbar': toolbar,
  };
  const document = {
    getElementById: (id: string) => nodes[id] ?? null,
    createElementNS: () => new Element(),
  };
  const window = Object.assign(new EventTargetFixture(), { document }) as unknown as Window &
    EventTargetFixture;
  const resized: number[] = [];
  const layout = mountRail(
    window,
    root as unknown as HTMLElement,
    slot as unknown as HTMLElement,
    { side, width, collapsed: false },
    (next) => resized.push(next),
  );
  return { layout, root, splitter: browser.children[1]!, window, resized };
}

describe('native rail layout', () => {
  it('limits keyboard and drag widths and ARIA values on both sides', () => {
    for (const side of ['left', 'right'] as const) {
      const maximumKeyboard = railFixture(side, 520);
      maximumKeyboard.splitter.emit('keydown', {
        key: side === 'left' ? 'ArrowRight' : 'ArrowLeft',
        shiftKey: false,
        preventDefault: vi.fn(),
      });
      expect(maximumKeyboard.root.style.width).toBe('520px');
      expect(maximumKeyboard.splitter.attributes.get('aria-valuemin')).toBe('180');
      expect(maximumKeyboard.splitter.attributes.get('aria-valuemax')).toBe('520');
      expect(maximumKeyboard.splitter.attributes.get('aria-valuenow')).toBe('520');
      expect(maximumKeyboard.resized).toEqual([520]);

      const minimumKeyboard = railFixture(side, 180);
      minimumKeyboard.splitter.emit('keydown', {
        key: side === 'left' ? 'ArrowLeft' : 'ArrowRight',
        shiftKey: false,
        preventDefault: vi.fn(),
      });
      expect(minimumKeyboard.root.style.width).toBe('180px');
      expect(minimumKeyboard.splitter.attributes.get('aria-valuenow')).toBe('180');

      const maximumDrag = railFixture(side, 510);
      maximumDrag.splitter.emit('mousedown', {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      });
      maximumDrag.window.emit('mousemove', { clientX: side === 'left' ? 200 : 0 });
      expect(maximumDrag.root.style.width).toBe('520px');
      expect(maximumDrag.splitter.attributes.get('aria-valuenow')).toBe('520');
      expect(maximumDrag.resized).toEqual([]);
      maximumDrag.window.emit('mouseup', {});
      expect(maximumDrag.resized).toEqual([520]);

      const minimumDrag = railFixture(side, 190);
      minimumDrag.splitter.emit('mousedown', {
        button: 0,
        clientX: 100,
        preventDefault: vi.fn(),
      });
      minimumDrag.window.emit('mousemove', { clientX: side === 'left' ? 0 : 200 });
      expect(minimumDrag.root.style.width).toBe('180px');
      expect(minimumDrag.splitter.attributes.get('aria-valuenow')).toBe('180');
      expect(minimumDrag.resized).toEqual([]);
      minimumDrag.window.emit('mouseup', {});
      expect(minimumDrag.resized).toEqual([180]);
    }
  });

  it('cancels a drag on side changes without persisting it', () => {
    const rail = railFixture('left', 240);
    rail.splitter.emit('mousedown', {
      button: 0,
      clientX: 100,
      preventDefault: vi.fn(),
    });
    rail.window.emit('mousemove', { clientX: 140 });
    expect(rail.root.style.width).toBe('280px');
    rail.layout.update({ side: 'right', width: 300, collapsed: false });
    expect(rail.root.style.width).toBe('300px');
    rail.window.emit('mouseup', {});
    expect(rail.resized).toEqual([]);
  });

  it('reserves native titlebar safe areas and updates them on resize', () => {
    const rail = railFixture('left', 240);
    let safeStart = '90px';
    Object.assign(rail.window, {
      getComputedStyle: () => ({
        getPropertyValue: (name: string) => (name === '--safe-area-start' ? safeStart : '0px'),
      }),
    });
    rail.layout.update({ side: 'top', width: 240, collapsed: false });
    expect(rail.root.style.paddingInlineStart).toBe('90px');
    safeStart = '8px';
    rail.window.emit('resize', {});
    expect(rail.root.style.paddingInlineStart).toBe('8px');
    rail.layout.dispose();
  });

  it('moves only the rail and toolbar, switches sides, and restores the native toolbar', () => {
    const browser = new Element();
    const content = new Element();
    const title = new Element();
    const strip = new Element();
    const toolbar = new Element();
    const root = new Element();
    const slot = new Element();
    browser.appendChild(content);
    title.appendChild(strip);
    title.appendChild(toolbar);
    root.appendChild(slot);
    const nodes: Record<string, Element> = {
      browser,
      appcontent: content,
      'zotero-title-bar': title,
      'tab-bar-container': strip,
      'zotero-tabs-toolbar': toolbar,
    };
    const document = {
      getElementById: (id: string) => nodes[id] ?? null,
      createElementNS: () => new Element(),
    };
    const window = {
      document,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const layout = mountRail(
      window,
      root as unknown as HTMLElement,
      slot as unknown as HTMLElement,
      { side: 'left', width: 240, collapsed: false },
      vi.fn(),
    );
    expect(browser.children[0]).toBe(root);
    const splitter = browser.children[1]!;
    expect(browser.children[2]).toBe(content);
    expect(slot.children).toEqual([toolbar]);
    expect(title.style.display).toBe('none');
    expect(layout.ownsTarget(splitter as unknown as EventTarget)).toBe(true);
    layout.update({ side: 'right', width: 300, collapsed: false });
    expect(browser.children).toEqual([content, splitter, root]);
    layout.update({ side: 'top', width: 300, collapsed: false });
    expect(browser.children).toEqual([content]);
    expect(title.children).toEqual([root, strip, toolbar]);
    expect(strip.style.display).toBe('none');
    expect(toolbar.parentNode).toBe(title);
    layout.update({ side: 'top', width: 300, collapsed: true });
    expect(strip.style.display).toBe('');
    layout.update({ side: 'left', width: 240, collapsed: false });
    expect(title.style.display).toBe('none');
    expect(slot.children).toEqual([toolbar]);
    layout.update({ side: 'top', width: 300, collapsed: false });
    layout.dispose();
    expect(browser.children).toEqual([content]);
    expect(title.children).toEqual([strip, toolbar]);
    expect(strip.style.display).toBe('');
    expect(title.style.display).toBe('');
    const second = mountRail(
      window,
      root as unknown as HTMLElement,
      slot as unknown as HTMLElement,
      { side: 'left', width: 240, collapsed: false },
      vi.fn(),
    );
    const otherOwner = new Element();
    otherOwner.appendChild(toolbar);
    second.dispose();
    expect(otherOwner.children).toEqual([toolbar]);
    title.appendChild(toolbar);
    title.appendChild(new Element());
    expect(() =>
      mountRail(
        window,
        root as unknown as HTMLElement,
        slot as unknown as HTMLElement,
        { side: 'left', width: 240, collapsed: false },
        vi.fn(),
      ),
    ).toThrow('Unsupported native tab layout');
    expect(toolbar.parentNode).toBe(title);
  });
});
