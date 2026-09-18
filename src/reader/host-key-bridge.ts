import { keyString } from '../input/keys';
import type { ReaderRuntime, ReaderViewRuntime } from './types';

export interface ReaderHostKeyBridgeDependencies {
  readonly reader: ReaderRuntime;
  readonly nativeEditableFocused: () => boolean;
  readonly consumesKey: (key: string) => boolean;
  readonly commentInputFocused: (window: Window | undefined) => boolean;
  readonly debug: (message: string) => void;
}

/**
 * Owns the two private PdfView key seams Neo must patch.
 *
 * ReaderSession decides which keys Neo consumes and owns Note/Insert state. This bridge only
 * installs/restores host callbacks as Zotero creates or replaces primary/secondary PdfViews.
 */
export class ReaderHostKeyBridge {
  readonly #dependencies: ReaderHostKeyBridgeDependencies;
  readonly #keyPatches = new Map<ReaderViewRuntime, (event: KeyboardEvent) => unknown>();
  readonly #textFocusPatches = new Map<ReaderViewRuntime, () => boolean>();

  constructor(dependencies: ReaderHostKeyBridgeDependencies) {
    this.#dependencies = dependencies;
  }

  sync(): void {
    for (const view of this.#views()) {
      this.#patchKeyForwarding(view);
      this.#patchTextAnnotationFocus(view);
    }
  }

  dispose(): void {
    for (const [view, original] of this.#keyPatches) {
      try {
        view._onKeyDown = original;
      } catch {
        // A recreated view may no longer accept restoration.
      }
    }
    this.#keyPatches.clear();

    for (const [view, original] of this.#textFocusPatches) {
      try {
        view._textAnnotationFocused = original;
      } catch {
        // A recreated view may no longer accept restoration.
      }
    }
    this.#textFocusPatches.clear();
  }

  #views(): readonly ReaderViewRuntime[] {
    return [
      this.#dependencies.reader._internalReader?._primaryView,
      this.#dependencies.reader._internalReader?._secondaryView,
    ].filter((view): view is ReaderViewRuntime => !!view);
  }

  #patchKeyForwarding(view: ReaderViewRuntime): void {
    if (this.#keyPatches.has(view) || !view._onKeyDown) return;
    const original = view._onKeyDown;
    const wrapper = (event: KeyboardEvent): unknown => {
      if (
        this.#dependencies.nativeEditableFocused() ||
        this.#dependencies.consumesKey(keyString(event))
      )
        return undefined;
      return original.call(view, event);
    };
    try {
      view._onKeyDown = wrapper;
      this.#keyPatches.set(view, original);
    } catch (error) {
      this.#dependencies.debug(`reader key forwarding patch failed: ${String(error)}`);
    }
  }

  #patchTextAnnotationFocus(view: ReaderViewRuntime): void {
    if (this.#textFocusPatches.has(view) || !view._textAnnotationFocused) return;
    const original = view._textAnnotationFocused;
    const wrapper = (): boolean => {
      if (this.#dependencies.commentInputFocused(view._iframeWindow)) return true;
      return original.call(view);
    };
    try {
      view._textAnnotationFocused = wrapper;
      this.#textFocusPatches.set(view, original);
    } catch (error) {
      this.#dependencies.debug(`reader text annotation patch failed: ${String(error)}`);
    }
  }
}
