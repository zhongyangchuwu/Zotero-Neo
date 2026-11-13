import type { ReaderEventRuntime } from '../../reader/types';
import type { PdfWindow, ReaderRuntime } from '../../toolkit/reader';
import {
  appendTranslationPopupAction,
  captureTranslateForZotero248,
  readerLoadedPDFSource,
  translationMarkerPosition,
} from '../../toolkit/reader';
import {
  captureTranslationSource,
  saveTranslationMarker,
  type TranslationSource,
} from '../../operations/save-translation';
import { translateForZoteroPresent } from '../../platform/translate-for-zotero-v248';

interface Ports {
  readonly reader: ReaderRuntime;
  readonly isCurrent: (window: PdfWindow) => boolean;
  readonly text: (key: string) => string;
  readonly debug: (message: string) => void;
}

/** Owns this native popup and its completed result; upstream still owns translation. */
export class ReaderTranslationSave {
  readonly #ports: Ports;
  #revision = 0;
  #button: HTMLButtonElement | null = null;
  #window: PdfWindow | null = null;
  #timer: number | null = null;
  #disposeCapture: (() => void) | null = null;
  readonly #sources = new WeakMap<object, Promise<TranslationSource>>();
  readonly #saved = new Map<string, Set<string>>();
  readonly #pending = new Set<string>();

  constructor(ports: Ports) {
    this.#ports = ports;
  }

  show(event: ReaderEventRuntime, window: PdfWindow, sourceCurrent: () => boolean): void {
    this.clear();
    const annotation = event.params?.annotation;
    const itemID = this.#ports.reader.itemID;
    if (!annotation?.text || !itemID || !translateForZoteroPresent()) return;
    const position = translationMarkerPosition(annotation.position);
    if (!position || !annotation.sortIndex || annotation.pageLabel === undefined) return;
    const action = appendTranslationPopupAction(event, this.#ports.text('save'));
    if (!action) return;
    const { button, popup } = action;
    this.#button = button;
    this.#window = window;
    const loaded = readerLoadedPDFSource(this.#ports.reader, window);
    if (!loaded) {
      button.disabled = true;
      button.title = this.#ports.text('sourceUnavailable');
      return;
    }
    const revision = this.#revision;
    const quote = annotation.text;
    const sortIndex = annotation.sortIndex;
    const pageLabel = annotation.pageLabel;
    const baseKey = JSON.stringify([itemID, quote, annotation.position]);
    let key = baseKey;
    let source = this.#sources.get(loaded.identity);
    if (!source) {
      source = loaded.fingerprint.then((fingerprint) =>
        captureTranslationSource(itemID, fingerprint),
      );
      this.#sources.set(loaded.identity, source);
    }
    const sourceSnapshot = source;
    let sourceReady = false;
    let sourceFailure: string | null = null;
    void sourceSnapshot.then(
      (identity) => {
        key = `${identity.fingerprint}:${baseKey}`;
        sourceReady = true;
      },
      (error: unknown) => {
        sourceFailure = String(error);
        this.#ports.debug(`Translation source unavailable: ${sourceFailure}`);
      },
    );
    const capture = captureTranslateForZotero248(popup, itemID, quote);
    let failure: string | null = null;
    const current = (): boolean => {
      try {
        return (
          this.#revision === revision &&
          button.isConnected &&
          this.#ports.isCurrent(window) &&
          sourceCurrent()
        );
      } catch {
        return false;
      }
    };
    const refresh = (): void => {
      if (this.#revision !== revision) return;
      if (!current()) {
        this.clear();
        return;
      }
      const result = capture.read();
      const saved = result.status === 'ready' && !!this.#saved.get(key)?.has(result.text);
      button.disabled =
        !sourceReady || result.status !== 'ready' || saved || this.#pending.has(key);
      button.textContent = this.#ports.text(saved ? 'saved' : failure ? 'failed' : 'save');
      button.title =
        sourceFailure ??
        failure ??
        (!sourceReady
          ? this.#ports.text('preparingSource')
          : result.status === 'ready'
            ? ''
            : this.#ports.text(result.status === 'not-ready' ? 'notReady' : result.status));
    };
    const click = (): void => {
      if (!current() || !sourceReady || this.#pending.has(key)) return;
      const result = capture.read();
      if (result.status !== 'ready' || this.#saved.get(key)?.has(result.text)) {
        refresh();
        return;
      }
      // Everything below belongs to this accepted source, even after its popup closes.
      const translation = result.text;
      const originalLabel = this.#ports.text('original');
      const translationLabel = this.#ports.text('badge');
      this.#pending.add(key);
      failure = null;
      refresh();
      void sourceSnapshot
        .then((identity) =>
          saveTranslationMarker({
            source: identity,
            quote,
            translation,
            position,
            sortIndex,
            pageLabel,
            originalLabel,
            translationLabel,
          }),
        )
        .then(() => {
          const saved = this.#saved.get(key) ?? new Set<string>();
          saved.add(translation);
          this.#saved.set(key, saved);
        })
        .catch((error: unknown) => {
          failure = String(error);
          this.#ports.debug(`Saving translation failed: ${failure}`);
        })
        .finally(() => {
          this.#pending.delete(key);
          if (current()) refresh();
        });
    };
    button.disabled = true;
    button.addEventListener('click', click);
    this.#disposeCapture = () => {
      capture.dispose();
      button.removeEventListener('click', click);
    };
    // Native listeners append their widgets in this same event turn.
    window.setTimeout(refresh, 0);
    this.#timer = window.setInterval(refresh, 150);
  }

  releaseView(window: PdfWindow): void {
    if (this.#window === window) this.clear();
  }

  clear(): void {
    this.#revision += 1;
    if (this.#timer !== null) {
      try {
        this.#window?.clearInterval(this.#timer);
      } catch {
        /* Detached view. */
      }
    }
    this.#timer = null;
    this.#disposeCapture?.();
    this.#disposeCapture = null;
    this.#button?.remove();
    this.#button = null;
    this.#window = null;
  }
}
