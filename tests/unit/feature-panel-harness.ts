import { vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { MainWindowSession } from '../../src/main/session';
import { PickerRuntime } from '../../src/main/picker/runtime';
import { PluginManagerRuntime } from '../../src/main/plugin-manager-runtime';

export function createPickerHarness(width = 1200): {
  window: MainWindow;
  session: MainWindowSession;
  bodyChildren: HTMLElement[];
  cleanups: Array<() => void>;
} {
  let activeElement: Element | null = null;
  let document: Document;
  const createElement = (tag: string) => {
    const children: HTMLElement[] = [];
    const listeners = new Map<string, EventListener[]>();
    let textContent = '';
    const element = {
      setAttribute: (name: string, value: string) => {
        Reflect.set(element, name, value);
      },
      tagName: tag.toUpperCase(),
      localName: tag,
      ownerDocument: null as unknown as Document,
      parentElement: null as HTMLElement | null,
      style: {} as CSSStyleDeclaration,
      children,
      dataset: {} as DOMStringMap,
      value: '',
      type: '',
      placeholder: '',
      tabIndex: 0,
      clientHeight: 400,
      isConnected: true,
      get childElementCount() {
        return children.length;
      },
      get textContent() {
        return textContent;
      },
      set textContent(value: string) {
        textContent = value;
      },
      set innerHTML(value: string) {
        textContent = value.replace(/<[^>]*>/g, '');
      },
      append: (...nodes: HTMLElement[]) => {
        for (const node of nodes)
          Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.push(...nodes);
        textContent += nodes.map((node) => node.textContent ?? '').join('');
      },
      appendChild: (node: HTMLElement) => {
        Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.push(node);
        textContent += node.textContent ?? '';
      },
      replaceChildren: (...nodes: HTMLElement[]) => {
        for (const child of children) Reflect.set(child, 'parentElement', null);
        for (const node of nodes)
          Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.splice(0, children.length, ...nodes);
        textContent = nodes.map((node) => node.textContent ?? '').join('');
      },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
        );
      },
      closest: (selector: string) => {
        if (selector === '[data-zv-picker-row="1"]' && element.dataset.zvPickerRow === '1')
          return element as unknown as HTMLElement;
        return element.parentElement?.closest?.(selector) ?? null;
      },
      emit: (type: string, event: Partial<Event> = {}) => {
        let stopped = false;
        const synthetic = {
          ...event,
          target: event.target ?? element,
          preventDefault: () => event.preventDefault?.(),
          stopPropagation: () => {
            stopped = true;
            event.stopPropagation?.();
          },
          stopImmediatePropagation: () => {
            stopped = true;
            event.stopImmediatePropagation?.();
          },
        } as Event;
        for (const listener of listeners.get(type) ?? []) listener(synthetic);
        if (!stopped)
          (
            element.parentElement as
              | (HTMLElement & { emit?: (type: string, event?: Event) => void })
              | null
          )?.emit?.(type, synthetic);
      },
      focus: () => {
        if (activeElement !== (element as unknown as Element))
          (activeElement as (Element & { emit(type: string): void }) | null)?.emit('focusout');
        activeElement = element as unknown as Element;
        element.emit('focus');
      },
      select: vi.fn(),
      scrollBy: vi.fn(),
      scrollIntoView: vi.fn(),
      remove: () => {
        element.isConnected = false;
        element.parentElement = null;
      },
    };
    element.ownerDocument = document;
    return element as unknown as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
  };
  const bodyChildren: HTMLElement[] = [];
  document = {
    get activeElement() {
      return activeElement;
    },
    createElementNS: (_namespace: string, tag: string) => createElement(tag),
    getElementById: () => null,
    querySelector: () => null,
    body: { append: (node: HTMLElement) => bodyChildren.push(node) },
    documentElement: { append: (node: HTMLElement) => bodyChildren.push(node) },
  } as unknown as Document;
  const window = {
    document,
    innerWidth: width,
    setTimeout,
    clearTimeout,
  } as unknown as MainWindow;
  const cleanups: Array<() => void> = [];
  const session = {
    window,
    picker: new PickerRuntime(),
    pluginManager: new PluginManagerRuntime(),
    status: { textContent: '', style: {} },
    cleanup: { add: (cleanup: () => void) => cleanups.push(cleanup) },
    theme: { add: () => () => {} },
  } as unknown as MainWindowSession;
  return { window, session, bodyChildren, cleanups };
}

export function pickerKey(
  key: string,
  target: EventTarget | null,
  options: { ctrl?: boolean; shift?: boolean; isComposing?: boolean; keyCode?: number } = {},
): KeyboardEvent {
  return {
    key,
    target,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
    metaKey: false,
    altKey: false,
    isComposing: options.isComposing ?? false,
    keyCode: options.keyCode ?? 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}
