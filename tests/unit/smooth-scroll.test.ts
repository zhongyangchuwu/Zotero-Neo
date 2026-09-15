import { describe, expect, it, vi } from 'vitest';

import type { PreferenceReader } from '../../src/core/preferences';
import {
  ReaderSmoothScroller,
  smoothScrollSpec,
  type SmoothScrollSpec,
} from '../../src/reader/smooth-scroll';
import type { PdfWindow } from '../../src/reader/types';

type FrameTask = (timestamp: number) => void;

function keyboardEvent(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

function fakePdfWindow() {
  let nextFrame = 1;
  const frames = new Map<number, FrameTask>();
  const requestAnimationFrame = vi.fn((task: FrameTask) => {
    const id = nextFrame++;
    frames.set(id, task);
    return id;
  });
  const cancelAnimationFrame = vi.fn((id: number) => {
    frames.delete(id);
  });
  const pdfWindow = {
    requestAnimationFrame,
    cancelAnimationFrame,
  } as unknown as PdfWindow;
  return {
    pdfWindow,
    requestAnimationFrame,
    cancelAnimationFrame,
    runNext(timestamp: number) {
      const next = frames.entries().next().value as [number, FrameTask] | undefined;
      if (!next) throw new Error('Expected a pending animation frame');
      frames.delete(next[0]);
      next[1](timestamp);
    },
    pendingFrames: () => frames.size,
  };
}

function createHarness(
  values: Readonly<Record<string, boolean | number | string>> = {},
) {
  const preferences = {
    get<T extends boolean | number | string>(key: string, fallback: T): T {
      return (values[key] ?? fallback) as T;
    },
  } as PreferenceReader;
  const scrollBy = vi.fn();
  const scroller = new ReaderSmoothScroller({ preferences, scrollBy });
  return { scroller, scrollBy };
}

const down: SmoothScrollSpec = { axis: 'y', direction: 1 };
const right: SmoothScrollSpec = { axis: 'x', direction: 1 };

function trapezoidPreferences(
  extra: Readonly<Record<string, boolean | number | string>> = {},
): Readonly<Record<string, boolean | number | string>> {
  return {
    'scroll.mode': 'trapezoid',
    'smoothScroll.initialSpeed': 900,
    'smoothScroll.maxSpeed': 2400,
    'smoothScroll.acceleration': 1000,
    'smoothScroll.deceleration': 500,
    'smoothScroll.stopOnRelease': false,
    ...extra,
  };
}

describe('ReaderSmoothScroller', () => {
  it('owns follow hold repeat and keyup release state', () => {
    const window = fakePdfWindow();
    const { scroller, scrollBy } = createHarness({
      'scroll.mode': 'follow',
      'smoothScroll.followSpeed': 1200,
    });

    expect(scroller.start(window.pdfWindow, 'j', down)).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith(window.pdfWindow, 0, 10);
    expect(window.pendingFrames()).toBe(1);
    expect(scroller.isRepeat(keyboardEvent('j'))).toBe(true);
    expect(scroller.isRepeat(keyboardEvent('j', { ctrlKey: true }))).toBe(false);
    expect(scroller.handleKeyUp(keyboardEvent('k'))).toBe(false);

    expect(scroller.handleKeyUp(keyboardEvent('j'))).toBe(true);
    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(window.pendingFrames()).toBe(0);
    expect(scroller.isRepeat(keyboardEvent('j'))).toBe(false);
  });

  it('accelerates while held and decelerates after trapezoid release', () => {
    const window = fakePdfWindow();
    const { scroller, scrollBy } = createHarness(trapezoidPreferences());

    scroller.start(window.pdfWindow, 'l', right);
    expect(scrollBy).toHaveBeenNthCalledWith(1, window.pdfWindow, 7.5, 0);

    window.runNext(16);
    const accelerated = scrollBy.mock.calls[1]?.[1] as number;
    expect(accelerated).toBeGreaterThan(14.4);
    expect(accelerated).toBeLessThan(14.8);

    expect(scroller.handleKeyUp(keyboardEvent('l'))).toBe(true);
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled();
    window.runNext(32);
    const decelerating = scrollBy.mock.calls[2]?.[1] as number;
    expect(decelerating).toBeGreaterThan(0);
    expect(decelerating).toBeLessThan(accelerated);
    expect(window.pendingFrames()).toBe(1);
  });

  it('stops trapezoid motion immediately when stopOnRelease is enabled', () => {
    const window = fakePdfWindow();
    const { scroller } = createHarness(
      trapezoidPreferences({ 'smoothScroll.stopOnRelease': true }),
    );

    scroller.start(window.pdfWindow, 'j', down);
    expect(window.pendingFrames()).toBe(1);
    scroller.handleKeyUp(keyboardEvent('j'));

    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(window.pendingFrames()).toBe(0);
  });

  it('refuses continuous holds in step mode', () => {
    const window = fakePdfWindow();
    const { scroller, scrollBy } = createHarness({ 'scroll.mode': 'step' });

    expect(scroller.start(window.pdfWindow, 'j', down)).toBe(false);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('moves RAF ownership to a new split view and cancels on the owning view', () => {
    const first = fakePdfWindow();
    const second = fakePdfWindow();
    const { scroller, scrollBy } = createHarness({
      'scroll.mode': 'follow',
      'smoothScroll.followSpeed': 1200,
    });

    scroller.start(first.pdfWindow, 'j', down);
    scroller.start(second.pdfWindow, 'j', down);

    expect(first.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(first.pendingFrames()).toBe(0);
    expect(second.pendingFrames()).toBe(1);
    expect(scrollBy).toHaveBeenNthCalledWith(2, second.pdfWindow, 0, 10);

    scroller.releaseView(first.pdfWindow);
    expect(second.cancelAnimationFrame).not.toHaveBeenCalled();
    scroller.releaseView(second.pdfWindow);
    expect(second.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(second.pendingFrames()).toBe(0);
  });

  it('maps only continuous Reader scroll actions to geometry specs', () => {
    expect(smoothScrollSpec('scrollDown')).toEqual({ axis: 'y', direction: 1 });
    expect(smoothScrollSpec('scrollUp')).toEqual({ axis: 'y', direction: -1 });
    expect(smoothScrollSpec('scrollLeft')).toEqual({ axis: 'x', direction: -1 });
    expect(smoothScrollSpec('scrollRight')).toEqual({ axis: 'x', direction: 1 });
    expect(smoothScrollSpec('historyBack')).toBeNull();
  });
});
