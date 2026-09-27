import { describe, expect, it, vi } from 'vitest';
import { ACTION_LABELS } from '../../src/input/actions';
import type { BindingMap } from '../../src/input/bindings';
import { InputRuntime, type InputTimerHost } from '../../src/input/runtime';
import { PrefixGuideRuntime, type PrefixGuideView } from '../../src/ui/key-guide-runtime';

interface FakeGuideNode {
  id: string;
  textContent: string;
  style: { cssText: string; fontSize: string };
  children: FakeGuideNode[];
  setAttribute(name: string, value: string): void;
  append(...nodes: FakeGuideNode[]): void;
  appendChild(node: FakeGuideNode): void;
  replaceChildren(...nodes: FakeGuideNode[]): void;
  remove(): void;
}

function guideHarness() {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  const cancelled: number[] = [];
  const timers: InputTimerHost = {
    setTimeout(callback, delayMs) {
      callbacks.push(callback);
      delays.push(delayMs);
      return callbacks.length;
    },
    clearTimeout(timer) {
      if (timer !== undefined) cancelled.push(timer);
    },
  };
  const mounted: FakeGuideNode[] = [];
  function element(): FakeGuideNode {
    const children: FakeGuideNode[] = [];
    const node: FakeGuideNode = {
      id: '',
      textContent: '',
      style: { cssText: '', fontSize: '' },
      children,
      setAttribute: () => {},
      append: (...nodes) => children.push(...nodes),
      appendChild: (child) => children.push(child),
      replaceChildren: (...nodes) => children.splice(0, children.length, ...nodes),
      remove() {
        const index = mounted.indexOf(node);
        if (index >= 0) mounted.splice(index, 1);
      },
    };
    return node;
  }
  const document = {
    createElement: element,
    body: { appendChild: (node: FakeGuideNode) => mounted.push(node) },
  } as unknown as Document;
  const theme = { add: vi.fn(() => vi.fn()) };
  const input = new InputRuntime(timers);
  const guide = new PrefixGuideRuntime(timers);
  const bindings: BindingMap = { 'main-normal:xx': 'nextTab' };
  let view: PrefixGuideView = {
    input,
    mode: 'main-normal',
    bindings,
    enabled: true,
    language: 'en',
    delayMs: 200,
    fontSizePx: 15,
    document,
    theme,
  };
  const current = () => view;
  const update = (patch: Partial<PrefixGuideView>) => {
    view = { ...view, ...patch };
  };
  return { callbacks, delays, cancelled, mounted, input, guide, bindings, current, update, theme };
}

function firstLabel(mounted: readonly FakeGuideNode[]): string | undefined {
  return mounted[0]?.children[1]?.children[0]?.children[1]?.textContent;
}

describe('PrefixGuideRuntime', () => {
  it('delays the initial guide and updates a visible guide immediately', () => {
    const h = guideHarness();
    h.input.advance('main-normal', h.bindings, 'x', true);
    h.guide.refresh(h.current);
    expect(h.delays).toEqual([200]);
    expect(h.mounted).toHaveLength(0);
    h.callbacks[0]();
    expect(h.mounted).toHaveLength(1);
    expect(firstLabel(h.mounted)).toBe(ACTION_LABELS.nextTab.en);

    const extended: BindingMap = { ...h.bindings, 'main-normal:xy': 'previousTab' };
    h.update({ bindings: extended, fontSizePx: 18 });
    h.guide.refresh(h.current);
    expect(h.mounted).toHaveLength(1);
    expect(h.delays).toEqual([200]);
    expect(h.mounted[0].style.fontSize).toBe('18px');
    expect(h.mounted[0].children[1].children).toHaveLength(2);
    h.guide.clear();
    expect(h.mounted).toHaveLength(0);
    expect(h.theme.add.mock.results[0]?.value).toHaveBeenCalledOnce();
  });

  it('shows Note-owned leader groups without borrowing Main candidates', () => {
    const h = guideHarness();
    const bindings: BindingMap = {
      'note-normal:<Space>ff': 'findAllItems',
      'main-normal:<Space>xx': 'nextTab',
    };
    h.input.advance('note-normal', bindings, ' ', true);
    h.update({ mode: 'note-normal', bindings });
    h.guide.refresh(h.current);
    h.callbacks[0]();
    expect(h.mounted).toHaveLength(1);
    expect(h.mounted[0].children[0]?.textContent).toBe('SPC');
    expect(h.mounted[0].children[1]?.children).toHaveLength(1);
    expect(firstLabel(h.mounted)).toBe('+ Find');
    h.guide.dispose();
  });

  it('rejects stale prefix, input owner and mode even when the same prefix remains', () => {
    const h = guideHarness();
    h.input.advance('main-normal', h.bindings, 'x', true);
    h.guide.refresh(h.current);
    h.input.reset();
    h.callbacks[0]();
    expect(h.mounted).toHaveLength(0);

    h.input.advance('main-normal', h.bindings, 'x', true);
    h.guide.refresh(h.current);
    h.update({ mode: 'note-normal', bindings: { 'note-normal:xx': 'switchTab' } });
    h.callbacks[1]();
    expect(h.mounted).toHaveLength(0);

    h.update({ mode: 'main-normal', bindings: h.bindings });
    h.guide.refresh(h.current);
    const other = new InputRuntime({ setTimeout: () => 0, clearTimeout: () => {} });
    other.advance('main-normal', h.bindings, 'x', true);
    h.update({ input: other });
    h.callbacks[2]();
    expect(h.mounted).toHaveLength(0);
    h.guide.dispose();
  });

  it('uses the live binding and enabled state at show time, then hides on disable and disposal', () => {
    const h = guideHarness();
    h.input.advance('main-normal', h.bindings, 'x', true);
    h.guide.refresh(h.current);
    h.update({ bindings: { 'main-normal:xy': 'previousTab' } });
    h.callbacks[0]();
    expect(firstLabel(h.mounted)).toBe(ACTION_LABELS.previousTab.en);
    h.guide.clear();

    h.guide.refresh(h.current);
    h.update({ enabled: false });
    h.callbacks[1]();
    expect(h.mounted).toHaveLength(0);
    h.guide.refresh(h.current);
    expect(h.mounted).toHaveLength(0);
    h.update({ enabled: true, bindings: h.bindings });
    h.guide.refresh(h.current);
    h.guide.dispose();
    h.callbacks[2](); // A queued callback may outlive clearTimeout.
    expect(h.mounted).toHaveLength(0);
    expect(h.cancelled).toContain(3);
  });
  it('does not show an obsolete guide after same-prefix bindings are removed', () => {
    const h = guideHarness();
    h.input.advance('main-normal', h.bindings, 'x', true);
    h.guide.refresh(h.current);
    h.update({ bindings: { 'main-normal:y': 'nextTab' } });
    h.callbacks[0]();
    expect(h.mounted).toHaveLength(0);
    h.guide.dispose();
  });
});
