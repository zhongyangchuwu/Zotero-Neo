import type { ReaderJumpLocation } from '../core/contracts';
import { ReaderJumpHostAdapter } from './jump-host';
import type { ReaderPdfHistoryRuntime, ReaderRuntime, ReaderViewRuntime } from './types';

interface ReaderHistoryPatch {
  readonly history: ReaderPdfHistoryRuntime;
  readonly original: NonNullable<ReaderPdfHistoryRuntime['save']>;
  readonly wrapper: NonNullable<ReaderPdfHistoryRuntime['save']>;
}

export interface ReaderJumpHistoryBridgeDependencies {
  readonly reader: ReaderRuntime;
  readonly host: ReaderJumpHostAdapter;
  readonly record: (source: ReaderJumpLocation, destination: ReaderJumpLocation) => void;
  readonly debug: (message: string) => void;
}

/** Observes hard Reader PDF history points without owning another navigation stack. */
export class ReaderJumpHistoryBridge {
  readonly #dependencies: ReaderJumpHistoryBridgeDependencies;
  readonly #patches = new Map<ReaderViewRuntime, ReaderHistoryPatch>();
  readonly #manualJumps = new WeakMap<ReaderViewRuntime, () => boolean>();
  #disposed = false;

  constructor(dependencies: ReaderJumpHistoryBridgeDependencies) {
    this.#dependencies = dependencies;
  }

  sync(): void {
    if (this.#disposed) return;
    const internal = this.#dependencies.reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    for (const view of this.#patches.keys()) {
      if (view !== primary && view !== secondary) this.#restore(view);
    }
    if (primary) this.#patch(primary);
    if (secondary && secondary !== primary) this.#patch(secondary);
  }

  /** Holds only this operation's intermediate points; superseded user navigation remains observable. */
  holdJump(view: ReaderViewRuntime, isCurrent: () => boolean): () => void {
    this.#manualJumps.set(view, isCurrent);
    return () => {
      if (this.#manualJumps.get(view) === isCurrent) this.#manualJumps.delete(view);
    };
  }

  releaseWindow(window: Window): void {
    for (const [view] of this.#patches) {
      if (view._iframeWindow === window) this.#restore(view);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const view of this.#patches.keys()) this.#restore(view);
  }

  #patch(view: ReaderViewRuntime): void {
    const history = view._history;
    const original = history?.save;
    if (!history || typeof original !== 'function') return;
    const previous = this.#patches.get(view);
    if (previous?.history === history && history.save === previous.wrapper) return;
    if (previous) this.#restore(view);

    const host = this.#dependencies.host;
    const bridge = this;
    // Native history may discard a transient matching its closest back point.
    let lastLocation = history._currentLocation;
    try {
      const position = host.captureReader(bridge.#dependencies.reader, undefined, view)?.position;
      if (position)
        lastLocation = {
          dest: [position.pageIndex, { name: 'XYZ' }, position.left, position.top, null],
        };
    } catch {
      // The view may not yet expose readable geometry; retain the native seed.
    }
    const wrapper: NonNullable<ReaderPdfHistoryRuntime['save']> = function (
      this: ReaderPdfHistoryRuntime,
      ...args
    ): unknown {
      const [location, transient] = args;
      // Content Function.apply cannot read a chrome-realm argument array.
      if (transient === true) {
        const result = Reflect.apply(original, this, args);
        lastLocation = location;
        return result;
      }

      let source: ReaderJumpLocation | null = null;
      let destination: ReaderJumpLocation | null = null;
      try {
        source = host.captureHardLocation(bridge.#dependencies.reader, view, lastLocation);
        destination = host.captureHardLocation(bridge.#dependencies.reader, view, location);
      } catch (error) {
        try {
          bridge.#dependencies.debug(`reader jump history capture failed: ${String(error)}`);
        } catch {
          // Diagnostics must never interfere with the native history save.
        }
      }

      const result = Reflect.apply(original, this, args);
      lastLocation = location;
      if (source && destination) {
        try {
          if (!bridge.#manualJumps.get(view)?.() && !host.isRestoredLocation(view, location))
            bridge.#dependencies.record(source, destination);
        } catch (error) {
          try {
            bridge.#dependencies.debug(`reader jump history record failed: ${String(error)}`);
          } catch {
            // Diagnostics must never interfere with the native history save.
          }
        }
      }
      return result;
    };
    try {
      history.save = wrapper;
      this.#patches.set(view, { history, original, wrapper });
    } catch (error) {
      this.#dependencies.debug(`reader jump history patch failed: ${String(error)}`);
    }
  }

  #restore(view: ReaderViewRuntime): void {
    const patch = this.#patches.get(view);
    if (!patch) return;
    this.#manualJumps.delete(view);
    try {
      if (patch.history.save === patch.wrapper) patch.history.save = patch.original;
    } catch {
      this.#dependencies.debug('reader jump history cleanup failed');
    }
    this.#patches.delete(view);
  }
}
