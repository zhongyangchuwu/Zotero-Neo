import { describe, expect, it, vi } from 'vitest';
import type { BindingMap } from '../../src/input/bindings';
import { InputRuntime, type InputTimerHost } from '../../src/input/runtime';

const bindings: BindingMap = {
  'main-normal:gg': 'mainNavFirst',
  'main-normal:x': 'nextTab',
  'main-normal:xy': 'previousTab',
  'main-select:gg': 'mainSelectFirst',
};

function clock() {
  const callbacks: Array<() => void> = [];
  const cancelled: number[] = [];
  const timers: InputTimerHost = {
    setTimeout(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearTimeout(timer) {
      if (timer !== undefined) cancelled.push(timer);
    },
  };
  return { timers, callbacks, cancelled };
}

describe('InputRuntime lifecycle', () => {
  it('keeps counts across backspace, clears them on cancel, and executes exact-mode continuation', () => {
    const runtime = new InputRuntime(clock().timers);
    expect(runtime.advance('main-normal', bindings, '3', true)).toMatchObject({
      kind: 'pending',
      timeoutMs: null,
    });
    runtime.advance('main-normal', bindings, 'g', true);
    expect(runtime.keyBuffer).toBe('g');
    expect(runtime.countBuffer).toBe('3');
    expect(runtime.backspace('main-normal')).toBe(true);
    expect(runtime.keyBuffer).toBe('');
    expect(runtime.countBuffer).toBe('3');
    runtime.advance('main-normal', bindings, 'g', true);
    expect(runtime.advance('main-normal', bindings, 'g', true)).toMatchObject({
      kind: 'execute',
      action: 'mainNavFirst',
      count: 3,
    });
    runtime.advance('main-normal', bindings, 'g', true);
    expect(runtime.cancel('main-normal')).toBe(true);
    expect(runtime.cancel('main-normal')).toBe(false);
    expect(runtime.keyBuffer).toBe('');
    expect(runtime.countBuffer).toBe('');
    runtime.dispose();
  });

  it('invalidates queued timeouts on continuation, reset and disposal', () => {
    const { timers, callbacks, cancelled } = clock();
    const runtime = new InputRuntime(timers);
    const fired = vi.fn();
    const first = runtime.advance('main-normal', bindings, 'x', true);
    if (first.kind !== 'pending') throw new Error('Expected ambiguous x');
    runtime.schedule(first, 800, fired);
    expect(runtime.advance('main-normal', bindings, 'y', true)).toMatchObject({
      kind: 'execute',
      action: 'previousTab',
    });
    callbacks[0](); // A queued callback may run even after clearTimeout.
    expect(fired).not.toHaveBeenCalled();
    expect(cancelled).toContain(1);

    const second = runtime.advance('main-normal', bindings, 'x', true);
    if (second.kind !== 'pending') throw new Error('Expected ambiguous x');
    runtime.schedule(second, 800, fired);
    runtime.reset();
    callbacks[1]();
    expect(fired).not.toHaveBeenCalled();
    expect(runtime.keyBuffer).toBe('');

    const third = runtime.advance('main-normal', bindings, 'x', true);
    if (third.kind !== 'pending') throw new Error('Expected ambiguous x');
    runtime.schedule(third, 800, fired);
    callbacks[2]();
    expect(fired).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'execute', action: 'nextTab' }),
    );
    expect(runtime.keyBuffer).toBe('');

    const fourth = runtime.advance('main-normal', bindings, 'x', true);
    if (fourth.kind !== 'pending') throw new Error('Expected ambiguous x');
    runtime.schedule(fourth, 800, fired);
    runtime.dispose();
    callbacks[3]();
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('resets before mode changes and reads replacement bindings on continuation', () => {
    const { timers, callbacks } = clock();
    const runtime = new InputRuntime(timers);
    const fired = vi.fn();
    const main = runtime.advance('main-normal', bindings, 'g', true);
    if (main.kind !== 'pending') throw new Error('Expected goto prefix');
    runtime.schedule(main, 1200, fired);
    runtime.reset();
    callbacks[0]();
    expect(fired).not.toHaveBeenCalled();

    runtime.advance('main-select', bindings, 'g', false);
    expect(runtime.advance('main-select', bindings, 'g', false)).toMatchObject({
      kind: 'execute',
      action: 'mainSelectFirst',
    });
    runtime.advance('main-normal', bindings, 'g', true);
    expect(
      runtime.advance('main-normal', { ...bindings, 'main-normal:gg': 'nextTab' }, 'g', true),
    ).toMatchObject({ kind: 'execute', action: 'nextTab' });
  });
  it('expires a host-owned pending sequence and ignores stale replacement timers', () => {
    const { timers, callbacks } = clock();
    const runtime = new InputRuntime(timers);
    const expired = vi.fn();
    runtime.replace('m', '');
    runtime.scheduleReset(1200, expired);
    runtime.replace('dm', '4');
    runtime.scheduleReset(1200, expired);
    callbacks[0]();
    expect(runtime.keyBuffer).toBe('dm');
    expect(runtime.countBuffer).toBe('4');
    expect(expired).not.toHaveBeenCalled();
    callbacks[1]();
    expect(runtime.keyBuffer).toBe('');
    expect(runtime.countBuffer).toBe('');
    expect(expired).toHaveBeenCalledOnce();
    runtime.replace('`', '');
    runtime.scheduleReset(1200, expired);
    runtime.scheduleReset(1200, expired);
    callbacks[2](); // Cancellation may not retract an already queued callback.
    expect(runtime.keyBuffer).toBe('`');
    expect(expired).toHaveBeenCalledOnce();
    callbacks[3]();
    expect(runtime.keyBuffer).toBe('');
    expect(expired).toHaveBeenCalledTimes(2);

    runtime.replace('m', '');
    runtime.scheduleReset(1200, expired);
    runtime.dispose();
    callbacks[4]();
    expect(expired).toHaveBeenCalledTimes(2);
  });
});
