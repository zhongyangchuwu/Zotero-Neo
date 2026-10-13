import { CleanupFailure } from '../core/cleanup';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from './types';

export interface ReaderHostKeyBridgeDependencies {
  readonly reader: ReaderRuntime;
  readonly nativeEditableFocused: () => boolean;
  readonly consumesKey: (key: string, pdfWindow: PdfWindow | undefined) => boolean;
  readonly commentInputFocused: (window: Window | undefined) => boolean;
  readonly debug: (message: string) => void;
}

interface HostKeyPatch<Callback> {
  readonly original: Callback;
  readonly wrapper: Callback;
  active: boolean;
}

/**
 * Owns the two private PdfView key seams Neo must patch.
 *
 * ReaderSession decides which keys Neo consumes for the exact PDF view. This bridge only
 * installs/restores host callbacks as Zotero creates or replaces primary/secondary PdfViews.
 */
export class ReaderHostKeyBridge {
  readonly #dependencies: ReaderHostKeyBridgeDependencies;
  readonly #keyPatches = new Map<
    ReaderViewRuntime,
    HostKeyPatch<(event: KeyboardEvent) => unknown>
  >();
  readonly #textFocusPatches = new Map<ReaderViewRuntime, HostKeyPatch<() => boolean>>();

  constructor(dependencies: ReaderHostKeyBridgeDependencies) {
    this.#dependencies = dependencies;
  }

  sync(): void {
    const views = this.#views();
    this.#releasePatches(views);
    for (const view of views) {
      this.#patchKeyForwarding(view);
      this.#patchTextAnnotationFocus(view);
    }
  }

  dispose(): void {
    this.#releasePatches([]);
  }

  #releasePatches(views: readonly ReaderViewRuntime[]): void {
    // Retire every removed callback before a live restoration can throw or reenter.
    for (const [view, patch] of this.#keyPatches) if (!views.includes(view)) patch.active = false;
    for (const [view, patch] of this.#textFocusPatches)
      if (!views.includes(view)) patch.active = false;

    const failure = new CleanupFailure();
    for (const [view, patch] of this.#keyPatches) {
      if (patch.active) continue;
      this.#keyPatches.delete(view);
      failure.run(() => {
        if (!isDeadObject(view) && view._onKeyDown === patch.wrapper)
          view._onKeyDown = patch.original;
      });
    }
    for (const [view, patch] of this.#textFocusPatches) {
      if (patch.active) continue;
      this.#textFocusPatches.delete(view);
      failure.run(() => {
        if (!isDeadObject(view) && view._textAnnotationFocused === patch.wrapper)
          view._textAnnotationFocused = patch.original;
      });
    }
    failure.rethrow();
  }

  #views(): readonly ReaderViewRuntime[] {
    const primary = this.#dependencies.reader._internalReader?._primaryView as
      | ReaderViewRuntime
      | undefined;
    const secondary = this.#dependencies.reader._internalReader?._secondaryView as
      | ReaderViewRuntime
      | undefined;
    return [primary, secondary].filter((view): view is ReaderViewRuntime => view != null);
  }

  #patchKeyForwarding(view: ReaderViewRuntime): void {
    if (this.#keyPatches.has(view) || !view._onKeyDown) return;
    const original = view._onKeyDown;
    const wrapper = (event: KeyboardEvent): unknown => {
      if (!patch.active) return original.call(view, event);
      if (this.#dependencies.nativeEditableFocused()) return undefined;
      if (compositionOwnsKey(event, false)) return original.call(view, event);
      if (this.#dependencies.consumesKey(keyString(event), view._iframeWindow)) return undefined;
      return original.call(view, event);
    };
    const patch = { original, wrapper, active: true };
    try {
      view._onKeyDown = wrapper;
      this.#keyPatches.set(view, patch);
    } catch (error) {
      this.#dependencies.debug(`reader key forwarding patch failed: ${String(error)}`);
    }
  }

  #patchTextAnnotationFocus(view: ReaderViewRuntime): void {
    if (this.#textFocusPatches.has(view) || !view._textAnnotationFocused) return;
    const original = view._textAnnotationFocused;
    const wrapper = (): boolean => {
      if (!patch.active) return original.call(view);
      if (this.#dependencies.commentInputFocused(view._iframeWindow)) return true;
      return original.call(view);
    };
    const patch = { original, wrapper, active: true };
    try {
      view._textAnnotationFocused = wrapper;
      this.#textFocusPatches.set(view, patch);
    } catch (error) {
      this.#dependencies.debug(`reader text annotation patch failed: ${String(error)}`);
    }
  }
}
