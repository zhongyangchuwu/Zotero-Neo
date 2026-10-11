import { describe, expect, it } from 'vitest';
import { LocalBindingRuntime } from '../../src/input/local-binding-runtime';
import type { ActionId } from '../../src/input/actions';
import type { BindingMap } from '../../src/input/bindings';

function harness(initialBindings: BindingMap) {
  let bindings = initialBindings;
  let selection = 2;
  let openedInWindow = false;
  let timerId = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const retired: Array<() => void> = [];
  const target = {} as EventTarget;
  const runtime = new LocalBindingRuntime({
    bindings: () => bindings,
    execute: (action: ActionId, event) => {
      if (action === 'uiNext') selection += 1;
      else if (action === 'uiPrevious') selection -= 1;
      else if (action === 'uiConfirm') openedInWindow = event?.shiftKey ?? false;
      else return false;
      return true;
    },
    schedule: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimer: (timer) => {
      if (timer === undefined) return;
      const task = timers.get(timer);
      if (task) retired.push(task.callback);
      timers.delete(timer);
    },
  });
  const event = (key: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent =>
    ({
      key,
      target,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      keyCode: 0,
      ...extra,
    }) as KeyboardEvent;
  const expire = () => {
    const tasks = [...timers.values()];
    timers.clear();
    for (const task of tasks) task.callback();
  };
  return {
    runtime,
    event,
    timers,
    retired,
    expire,
    changeBindings: (next: BindingMap) => {
      bindings = next;
    },
    selection: () => selection,
    openedInWindow: () => openedInWindow,
  };
}

describe('configured local binding lifecycle', () => {
  it('uses the common engine for exact-prefix waits and longer configured sequences', () => {
    const host = harness({ 'picker-list:x': 'uiNext', 'picker-list:xy': 'uiPrevious' });
    expect(host.runtime.handle(host.event('x'), 'picker-list')).toBe(true);
    expect([...host.timers.values()][0].delay).toBe(800);
    expect(host.selection()).toBe(2);
    host.changeBindings({ 'picker-list:x': 'uiNext', 'picker-list:xy': 'uiPrevious' });
    host.expire();
    expect(host.selection()).toBe(3);
    host.runtime.handle(host.event('x'), 'picker-list');
    host.changeBindings({ 'picker-list:xy': 'uiPrevious', 'picker-list:x': 'uiNext' });
    expect(host.runtime.handle(host.event('y'), 'picker-list')).toBe(true);
    expect(host.selection()).toBe(2);
    for (const callback of host.retired) callback();
    expect(host.selection()).toBe(2);
  });

  it('expires a prefix-only wait without executing and passes unmatched keys', () => {
    const host = harness({ 'picker-list:xy': 'uiPrevious' });
    expect(host.runtime.handle(host.event('x'), 'picker-list')).toBe(true);
    expect([...host.timers.values()][0].delay).toBe(1200);
    host.expire();
    expect(host.runtime.handle(host.event('y'), 'picker-list')).toBe(false);
    expect(host.selection()).toBe(2);
    expect(host.runtime.handle(host.event('z'), 'picker-list')).toBe(false);
  });

  it('does not borrow bindings from another context or consume unsupported actions', () => {
    const host = harness({ 'picker-list:x': 'uiNext', 'picker-input:x': 'scrollDown' });
    expect(host.runtime.handle(host.event('x'), 'plugins-list')).toBe(false);
    expect(host.runtime.handle(host.event('x'), 'picker-input')).toBe(false);
    expect(host.selection()).toBe(2);
  });

  it.each(['deactivate', 'dispose'] as const)(
    'fences even already-queued callbacks after %s',
    (operation) => {
      const host = harness({ 'picker-list:x': 'uiNext', 'picker-list:xy': 'uiPrevious' });
      host.runtime.handle(host.event('x'), 'picker-list');
      const callback = [...host.timers.values()][0].callback;
      host.runtime[operation]();
      callback();
      expect(host.selection()).toBe(2);
      expect(host.timers.size).toBe(0);
      expect(host.runtime.handle(host.event('x'), 'picker-list')).toBe(operation === 'deactivate');
    },
  );

  it('cancels stale sequences on context, focus target, composition, and binding reload', () => {
    for (const boundary of ['context', 'target', 'composition', 'bindings'] as const) {
      const host = harness({ 'picker-list:x': 'uiNext', 'picker-list:xy': 'uiPrevious' });
      host.runtime.handle(host.event('x'), 'picker-list');
      const callback = [...host.timers.values()][0].callback;
      if (boundary === 'context') host.runtime.handle(host.event('z'), 'plugins-list');
      if (boundary === 'target')
        host.runtime.handle(host.event('z', { target: {} as EventTarget }), 'picker-list');
      if (boundary === 'composition')
        host.runtime.handle(host.event('x', { isComposing: true }), 'picker-list');
      if (boundary === 'bindings') host.changeBindings({});
      callback();
      expect(host.selection()).toBe(2);
    }
  });

  it('preserves Shift Enter semantics through an exact-prefix timeout', () => {
    const host = harness({
      'picker-list:<S-Enter>': 'uiConfirm',
      'picker-list:<S-Enter>x': 'uiNext',
    });
    host.runtime.handle(host.event('Enter', { shiftKey: true }), 'picker-list');
    host.expire();
    expect(host.openedInWindow()).toBe(true);
  });
});
