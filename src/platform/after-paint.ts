import { isDeadObject } from './cross-compartment';

/** Yield to the host's next paint, then run during idle (or in a separate timer task). */
export function scheduleAfterPaint(
  window: Window,
  run: (deadline?: IdleDeadline) => void,
): (() => void) | undefined {
  if (
    isDeadObject(window) ||
    typeof window.requestAnimationFrame !== 'function' ||
    typeof window.cancelAnimationFrame !== 'function'
  )
    return;
  const hasIdle =
    typeof window.requestIdleCallback === 'function' &&
    typeof window.cancelIdleCallback === 'function';
  if (
    !hasIdle &&
    (typeof window.setTimeout !== 'function' || typeof window.clearTimeout !== 'function')
  )
    return;
  const frame = window.requestAnimationFrame(() => {
    if (isDeadObject(window)) return;
    if (hasIdle) {
      const idle = window.requestIdleCallback(run);
      cancel = () => window.cancelIdleCallback(idle);
    } else {
      const timer = window.setTimeout(() => run(), 0);
      cancel = () => window.clearTimeout(timer);
    }
  });
  let cancel = () => window.cancelAnimationFrame(frame);
  return () => {
    if (!isDeadObject(window)) cancel();
  };
}
