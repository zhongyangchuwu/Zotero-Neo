import type { PreferenceReader, ScrollMode } from '../core/preferences';
import type { ActionId } from '../input/actions';
import type { PdfWindow } from './types';

type SmoothScrollAction = Extract<
  ActionId,
  'scrollDown' | 'scrollUp' | 'scrollLeft' | 'scrollRight'
>;

export interface SmoothScrollSpec {
  readonly axis: 'x' | 'y';
  readonly direction: -1 | 1;
}

const SMOOTH_SCROLL_SPECS: Readonly<Record<SmoothScrollAction, SmoothScrollSpec>> = {
  scrollDown: { axis: 'y', direction: 1 },
  scrollUp: { axis: 'y', direction: -1 },
  scrollLeft: { axis: 'x', direction: -1 },
  scrollRight: { axis: 'x', direction: 1 },
};

export function smoothScrollSpec(action: ActionId): SmoothScrollSpec | null {
  return action in SMOOTH_SCROLL_SPECS ? SMOOTH_SCROLL_SPECS[action as SmoothScrollAction] : null;
}

interface SmoothScrollConfig {
  readonly mode: ScrollMode;
  readonly initialSpeed: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly stopOnRelease: boolean;
  readonly followSpeed: number;
}

interface HoldState {
  active: boolean;
  releasing: boolean;
  key: string | null;
  axis: 'x' | 'y' | null;
  direction: -1 | 0 | 1;
  speed: number;
  rafId: number | null;
  lastTimestamp: number;
}

export interface ReaderSmoothScrollerHost {
  readonly preferences: PreferenceReader;
  readonly scrollBy: (pdfWindow: PdfWindow, x: number, y: number) => void;
}

/** Owns continuous Reader scroll hold state and its requestAnimationFrame lifecycle. */
export class ReaderSmoothScroller {
  readonly #host: ReaderSmoothScrollerHost;
  readonly #hold: HoldState = {
    active: false,
    releasing: false,
    key: null,
    axis: null,
    direction: 0,
    speed: 0,
    rafId: null,
    lastTimestamp: 0,
  };
  #pdfWindow: PdfWindow | null = null;

  constructor(host: ReaderSmoothScrollerHost) {
    this.#host = host;
  }

  get mode(): ScrollMode {
    return this.#config().mode;
  }

  isRepeat(event: KeyboardEvent): boolean {
    return (
      this.#hold.active &&
      this.#hold.key === event.key &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    );
  }

  start(pdfWindow: PdfWindow, key: string, spec: SmoothScrollSpec): boolean {
    const config = this.#config();
    if (config.mode === 'step') return false;

    if (this.#pdfWindow && this.#pdfWindow !== pdfWindow) this.#clearFrame();
    this.#pdfWindow = pdfWindow;
    this.#hold.active = true;
    this.#hold.releasing = false;
    this.#hold.key = key;
    this.#hold.axis = spec.axis;
    this.#hold.direction = spec.direction;
    this.#hold.speed = config.mode === 'follow' ? config.followSpeed : config.initialSpeed;
    this.#hold.lastTimestamp = 0;

    this.#scrollBySpeed(pdfWindow, 1 / 120);
    if (this.#hold.rafId === null) {
      this.#hold.rafId = pdfWindow.requestAnimationFrame((timestamp) => this.#tick(timestamp));
    }
    return true;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    if (this.#hold.key !== event.key) return false;
    const config = this.#config();
    this.stop(config.mode === 'follow' || config.stopOnRelease);
    return true;
  }

  stop(immediate: boolean): void {
    if (!immediate && this.#hold.active) {
      this.#hold.active = false;
      this.#hold.releasing = true;
      this.#hold.key = null;
      return;
    }
    this.#hold.active = false;
    this.#hold.releasing = false;
    this.#hold.key = null;
    this.#hold.axis = null;
    this.#hold.direction = 0;
    this.#hold.speed = 0;
    this.#hold.lastTimestamp = 0;
    this.#clearFrame();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#pdfWindow === pdfWindow) this.stop(true);
  }

  dispose(): void {
    this.stop(true);
  }

  #tick(timestamp: number): void {
    const pdfWindow = this.#pdfWindow;
    if (
      !pdfWindow ||
      (!this.#hold.active && !this.#hold.releasing) ||
      !this.#hold.axis ||
      !this.#hold.direction
    ) {
      this.#hold.rafId = null;
      return;
    }

    const seconds = this.#hold.lastTimestamp
      ? Math.min(0.05, Math.max(0.001, (timestamp - this.#hold.lastTimestamp) / 1000))
      : 0.016;
    this.#hold.lastTimestamp = timestamp;
    const config = this.#config();
    if (this.#hold.active && config.mode === 'trapezoid') {
      this.#hold.speed = Math.min(
        config.maxSpeed,
        Math.max(config.initialSpeed, this.#hold.speed + config.acceleration * seconds),
      );
    }
    if (this.#hold.releasing) {
      this.#hold.speed = Math.max(0, this.#hold.speed - config.deceleration * seconds);
      if (!this.#hold.speed) {
        this.stop(true);
        return;
      }
    }

    this.#scrollBySpeed(pdfWindow, seconds);
    this.#hold.rafId = pdfWindow.requestAnimationFrame((next) => this.#tick(next));
  }

  #scrollBySpeed(pdfWindow: PdfWindow, seconds: number): void {
    const delta = this.#hold.direction * this.#hold.speed * seconds;
    this.#host.scrollBy(
      pdfWindow,
      this.#hold.axis === 'x' ? delta : 0,
      this.#hold.axis === 'y' ? delta : 0,
    );
  }

  #clearFrame(): void {
    if (this.#hold.rafId !== null && this.#pdfWindow) {
      this.#pdfWindow.cancelAnimationFrame(this.#hold.rafId);
    }
    this.#hold.rafId = null;
    this.#pdfWindow = null;
  }

  #config(): SmoothScrollConfig {
    const preferences = this.#host.preferences;
    const configured = preferences.get('scroll.mode', 'follow');
    const mode: ScrollMode =
      configured === 'step' || configured === 'trapezoid' || configured === 'follow'
        ? configured
        : 'follow';
    return {
      mode,
      initialSpeed: preferences.get('smoothScroll.initialSpeed', 2000),
      maxSpeed: preferences.get('smoothScroll.maxSpeed', 2000),
      acceleration: preferences.get('smoothScroll.acceleration', 2600),
      deceleration: preferences.get('smoothScroll.deceleration', 4200),
      stopOnRelease: preferences.get('smoothScroll.stopOnRelease', false),
      followSpeed: preferences.get('smoothScroll.followSpeed', 2000),
    };
  }
}
