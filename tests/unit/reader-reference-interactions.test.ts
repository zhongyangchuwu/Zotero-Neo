import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeReaderReferenceInteractions } from '../../src/toolkit/reader/reference-interactions';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';
import type {
  ReaderReferenceInteractionCallbacks,
  ReaderReferencePopupSlot,
  ReaderReferenceMenuContext,
} from '../../src/toolkit/reader/reference-interaction-contracts';

const oldZotero = Reflect.get(globalThis, 'Zotero');
const oldComponents = Reflect.get(globalThis, 'Components');
afterEach(() => {
  if (oldZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', oldZotero);
  if (oldComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', oldComponents);
});

class ElementFixture {
  parent: ElementFixture | null = null;
  children: ElementFixture[] = [];
  text = '';
  connected = false;
  constructor(readonly name: string) {}
  get isConnected(): boolean {
    return this.connected || !!this.parent?.isConnected;
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  appendChild(child: ElementFixture): ElementFixture {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  closest(selector: string): ElementFixture | null {
    return this.name === selector ? this : (this.parent?.closest(selector) ?? null);
  }
  querySelector(selector: string): ElementFixture | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): ElementFixture[] {
    return this.children.flatMap((child) => [
      ...(child.name === selector ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  getBoundingClientRect() {
    return { left: 1, top: 2, right: 3, bottom: 4 };
  }
}

function fixture() {
  Reflect.set(globalThis, 'Components', { utils: { cloneInto: <T>(value: T) => value } });
  const root = new ElementFixture('root');
  root.connected = true;
  const bar = root.appendChild(new ElementFixture('.toolbar'));
  bar.appendChild(new ElementFixture('.custom-sections'));
  const pane = root.appendChild(new ElementFixture('.primary-view'));
  const container = root.appendChild(new ElementFixture('container'));
  const popupElement = pane.appendChild(new ElementFixture('.view-popup.citation-popup'));
  const first = popupElement.appendChild(new ElementFixture('.reference-row'));
  first.text = 'First paper';
  const second = popupElement.appendChild(new ElementFixture('.reference-row'));
  second.text = 'Second paper';
  const doc = {
    documentElement: root,
    createElement: () => new ElementFixture('span'),
    querySelector: (selector: string) => root.querySelector(selector.replace('#reader-ui ', '')),
  };
  let tick = () => {};
  const disconnect = vi.fn();
  const ui = {
    document: doc,
    MutationObserver: class {
      constructor(callback: () => void) {
        tick = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const pdf = { document: {}, PDFViewerApplication: { pdfDocument: {} } };
  const view = { _iframeWindow: pdf };
  const position = { pageIndex: 0, rects: [[1, 2, 3, 4]] };
  const reference = (text: string, index: number) => ({
    index,
    text,
    chars: [...text].map((c) => ({ c })),
    position: { pageIndex: index, rects: [[1, 2, 3, 4]] },
  });
  const state = {
    primary: true,
    primaryViewOverlayPopup: {
      type: 'citation',
      position,
      references: [reference('First paper', 1), reference('Second paper', 2)],
    } as unknown,
  };
  const internal = {
    _primaryView: view,
    _primaryViewContainer: container,
    _lastView: view,
    _state: state,
    _handleOverlayPopupClose: vi.fn(() => {
      state.primaryViewOverlayPopup = null;
    }),
  };
  const reader = {
    itemID: 42,
    _iframeWindow: ui,
    _internalReader: internal,
  } as unknown as ReaderRuntime;
  let listener: (event: unknown) => void = () => {};
  const unregister = vi.fn();
  Reflect.set(globalThis, 'Zotero', {
    Reader: {
      registerEventListener: (_name: string, fn: typeof listener) => {
        listener = fn;
      },
      unregisterEventListener: unregister,
    },
  });
  const slots: ReaderReferencePopupSlot[] = [];
  let menu: ReaderReferenceMenuContext | undefined;
  const popupCleanup = vi.fn();
  const toolbarCleanup = vi.fn();
  const callbacks: ReaderReferenceInteractionCallbacks = {
    onCitationPopup: (slot) => {
      slots.push(slot);
      return popupCleanup;
    },
    onContextMenu: (value) => {
      menu = value;
    },
    onToolbar: vi.fn(() => toolbarCleanup),
  };
  const dispose = observeReaderReferenceInteractions(reader, 'plugin', callbacks);
  return {
    root,
    bar,
    pane,
    container,
    popupElement,
    first,
    second,
    doc,
    ui,
    pdf,
    view,
    state,
    internal,
    reader,
    position,
    slots,
    callbacks,
    dispose,
    tick: () => tick(),
    emit: (event: unknown) => listener(event),
    menu: () => menu!,
    popupCleanup,
    toolbarCleanup,
    unregister,
    disconnect,
  };
}

describe('Reader reference interactions', () => {
  it('binds each native row to its own reference without replacing row content or navigation', () => {
    const f = fixture();
    expect(f.slots.map((slot) => slot.context.references[0].text)).toEqual([
      'First paper',
      'Second paper',
    ]);
    expect(f.slots.map((slot) => slot.context.references[0].location.pageIndex)).toEqual([1, 2]);
    expect(f.first.textContent).toBe('First paper');
    expect(f.second.textContent).toBe('Second paper');
    expect(f.slots[0].context.anchorRect()).toEqual([1, 2, 3, 4]);
    expect(f.slots[0].context.window).toBe(f.pdf);
    f.slots[0].context.dismissPreview?.();
    expect(f.slots[0].context.isCurrent()).toBe(false);
    expect(f.slots[0].context.isSourceCurrent()).toBe(true);
    f.tick();
    expect(f.popupCleanup).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it('appends synchronously and guards commands against replacement of their captured PDF', async () => {
    const f = fixture();
    const command = vi.fn();
    const appended: Array<{ onCommand(): void }> = [];
    f.callbacks.onContextMenu = ({ context, append }) => {
      expect(context.position).toEqual(f.position);
      expect(context.references).toEqual([]);
      append([{ label: 'References', onCommand: command }]);
      queueMicrotask(() => append([{ label: 'late', onCommand: command }]));
    };
    f.emit({
      reader: f.reader,
      params: { position: f.position, x: 10, y: 20, overlay: null },
      append: (item: { onCommand(): void }) => appended.push(item),
    });
    await Promise.resolve();
    expect(appended).toHaveLength(1);
    appended[0].onCommand();
    expect(command).toHaveBeenCalledTimes(1);
    f.pdf.PDFViewerApplication.pdfDocument = {};
    appended[0].onCommand();
    expect(command).toHaveBeenCalledTimes(1);
    f.dispose();
  });

  it('does not dismiss a successor popup or reuse stale row bindings', () => {
    const f = fixture();
    const previous = f.slots[0].context;
    const next = {
      type: 'citation',
      position: f.position,
      references: [
        {
          text: 'Other paper',
          chars: [...'Other paper'].map((c) => ({ c })),
          position: f.position,
        },
      ],
    };
    f.state.primaryViewOverlayPopup = next;
    previous.dismissPreview?.();
    expect(f.internal._handleOverlayPopupClose).not.toHaveBeenCalled();
    f.tick();
    expect(f.slots).toHaveLength(2);
    f.second.remove();
    f.first.text = 'Other paper';
    f.tick();
    expect(f.slots).toHaveLength(3);
    expect(f.slots[2].context.references[0].text).toBe('Other paper');
    f.dispose();
  });

  it('keeps native citation group targets in menu and invalidates superseded commands', () => {
    const f = fixture();
    const command = vi.fn();
    const items: Array<{ onCommand(): void }> = [];
    f.callbacks.onContextMenu = ({ context, append }) => {
      expect(context.references.map((reference) => reference.text)).toEqual([
        'First paper',
        'Second paper',
      ]);
      append([{ label: 'Open', onCommand: command }]);
    };
    const event = {
      reader: f.reader,
      params: { position: f.position, overlay: f.state.primaryViewOverlayPopup },
      append: (item: { onCommand(): void }) => items.push(item),
    };
    f.emit(event);
    f.emit(event);
    items[0].onCommand();
    items[1].onCommand();
    expect(command).toHaveBeenCalledTimes(1);
    f.dispose();
  });

  it('captures the secondary presentation without redirecting to primary after pane changes', () => {
    const f = fixture();
    f.root.appendChild(new ElementFixture('.secondary-view'));
    const secondaryContainer = f.root.appendChild(new ElementFixture('secondary-container'));
    const secondaryPdf = { document: {}, PDFViewerApplication: { pdfDocument: {} } };
    const secondaryView = { _iframeWindow: secondaryPdf };
    Object.assign(f.internal, {
      _secondaryView: secondaryView,
      _secondaryViewContainer: secondaryContainer,
      _lastView: secondaryView,
    });
    const command = vi.fn();
    const items: Array<{ onCommand(): void }> = [];
    f.callbacks.onContextMenu = ({ context, append }) => {
      expect(context.window).toBe(secondaryPdf);
      append([{ label: 'Open', onCommand: command }]);
    };
    f.emit({
      reader: f.reader,
      params: { position: f.position },
      append: (item: { onCommand(): void }) => items.push(item),
    });
    expect(items).toHaveLength(1);
    Object.assign(f.internal, { _secondaryView: { _iframeWindow: secondaryPdf } });
    items[0].onCommand();
    expect(command).not.toHaveBeenCalled();
    f.dispose();
  });

  it('retires the captured source when the Reader UI pane is replaced', () => {
    const f = fixture();
    const context = f.slots[0].context;
    f.pane.remove();
    f.root.appendChild(new ElementFixture('.primary-view'));
    expect(context.isSourceCurrent()).toBe(false);
    f.tick();
    expect(f.popupCleanup).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it('retires source on pane or DOM replacement and disposes toolbar and observer', () => {
    const f = fixture();
    const old = f.slots[0].context;
    f.container.remove();
    expect(old.isSourceCurrent()).toBe(false);
    f.tick();
    expect(f.popupCleanup).toHaveBeenCalledTimes(2);
    f.bar.remove();
    f.tick();
    expect(f.toolbarCleanup).toHaveBeenCalledTimes(1);
    f.dispose();
    expect(f.unregister).toHaveBeenCalledTimes(1);
    expect(f.disconnect).toHaveBeenCalledTimes(1);
  });
});

it.each(['pane', 'tab'])('rejects a late menu command after the active %s changes', (change) => {
  const f = fixture();
  const tabs = { selectedID: 'reader-tab' };
  Object.assign(f.reader, { tabID: 'reader-tab', _window: { Zotero_Tabs: tabs } });
  const command = vi.fn();
  const items: Array<{ onCommand(): void }> = [];
  f.callbacks.onContextMenu = ({ append }) => append([{ label: 'Open', onCommand: command }]);
  f.emit({
    reader: f.reader,
    params: { position: f.position },
    append: (item: { onCommand(): void }) => items.push(item),
  });
  if (change === 'pane') Object.assign(f.internal, { _lastView: {} });
  else tabs.selectedID = 'other-tab';
  items[0].onCommand();
  expect(command).not.toHaveBeenCalled();
  f.dispose();
});
