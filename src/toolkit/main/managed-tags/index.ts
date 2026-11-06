import { CleanupScope } from '../../../core/cleanup';
import { confirmChromeAction, observeChromeWindows } from '../../../platform/chrome-windows';
import { ManagedTagAutocomplete } from './autocomplete';
import { protectNativeTagsBox } from './box';
import { protectNativeTagMutations } from './library';
import { protectNativeTagSelector } from './selector';

interface WindowLifetime {
  readonly scope: CleanupScope;
  document: Document | null;
  surface: CleanupScope | null;
}

/** Owns presentation and native mutation protection; the caller owns the reserved-name policy. */
export class ManagedTagsUI {
  readonly #isManaged: (name: string) => boolean;
  readonly #onError: (error: unknown) => void;
  readonly #windows = new Map<Window, WindowLifetime>();
  #active = false;
  #stopWindows: (() => void) | null = null;
  #stopMutations: (() => void) | null = null;
  #autocomplete: ManagedTagAutocomplete | null = null;

  constructor(isManaged: (name: string) => boolean, onError: (error: unknown) => void) {
    this.#isManaged = isManaged;
    this.#onError = onError;
  }

  start(): void {
    if (this.#active) return;
    this.#active = true;
    try {
      this.#stopMutations = protectNativeTagMutations(this.#isManaged);
      this.#autocomplete = new ManagedTagAutocomplete(this.#isManaged, this.#onError);
      this.#autocomplete.start();
      this.#stopWindows = observeChromeWindows(
        (window) => this.#open(window),
        (window) => this.#close(window),
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (!this.#active) return;
    this.#active = false;
    const finish = (cleanup: (() => void) | null): void => {
      try {
        cleanup?.();
      } catch (error) {
        this.#onError(error);
      }
    };
    finish(this.#stopWindows);
    this.#stopWindows = null;
    for (const window of this.#windows.keys()) this.#close(window);
    finish(this.#autocomplete ? () => this.#autocomplete!.dispose() : null);
    this.#autocomplete = null;
    finish(this.#stopMutations);
    this.#stopMutations = null;
  }

  #open(window: Window): void {
    if (!this.#active || this.#windows.has(window) || window.closed) return;
    const lifetime: WindowLifetime = {
      scope: new CleanupScope(),
      document: null,
      surface: null,
    };
    this.#windows.set(window, lifetime);
    lifetime.scope.add(() => lifetime.surface?.dispose());
    lifetime.scope.addEventListener(window, 'load', () => this.#load(window, lifetime));
    lifetime.scope.addEventListener(window, 'unload', () => {
      lifetime.surface?.dispose();
      lifetime.surface = null;
      lifetime.document = null;
    });
    if (window.document.readyState !== 'loading') this.#load(window, lifetime);
  }

  #close(window: Window): void {
    const lifetime = this.#windows.get(window);
    if (!lifetime) return;
    this.#windows.delete(window);
    lifetime.scope.dispose();
  }

  #load(window: Window, lifetime: WindowLifetime): void {
    if (!this.#active || this.#windows.get(window) !== lifetime || window.closed) return;
    const document = window.document;
    if (lifetime.document === document) return;
    lifetime.surface?.dispose();
    lifetime.surface = null;
    lifetime.document = document;
    if (!document.documentURI.startsWith('chrome://zotero/content/')) return;
    const scope = new CleanupScope();
    lifetime.surface = scope;
    const current = (): boolean =>
      this.#active && !scope.disposed && !window.closed && window.document === document;
    const boxes = new Map<Element, () => void>();
    let selector: object | undefined;
    let stopSelector: (() => void) | null = null;
    scope.add(this.#autocomplete!.attachWindow(window));
    scope.add(() => {
      for (const dispose of boxes.values()) {
        try {
          dispose();
        } catch (error) {
          this.#onError(error);
        }
      }
      boxes.clear();
    });
    scope.add(() => stopSelector?.());
    const attachBox = (box: Element): void => {
      if (!current() || boxes.has(box)) return;
      const dispose = protectNativeTagsBox(box, this.#isManaged, this.#onError, () =>
        confirmChromeAction(window, '', Zotero.getString('pane.item.tags.removeAll')),
      );
      if (dispose) boxes.set(box, dispose);
    };
    const scan = (root: Document | Element): void => {
      if ('localName' in root && root.localName === 'tags-box') attachBox(root);
      for (const box of root.querySelectorAll<Element>('tags-box')) {
        if (box) attachBox(box as Element);
      }
    };
    const attachSelector = (): void => {
      const next = (window as Window & { ZoteroPane?: { tagSelector?: object } }).ZoteroPane
        ?.tagSelector;
      if (next === selector) return;
      stopSelector?.();
      stopSelector = null;
      selector = undefined;
      if (next) {
        stopSelector = protectNativeTagSelector(window, next, this.#isManaged, this.#onError);
        if (stopSelector) selector = next;
      }
    };
    const MutationObserver = (
      window as Window & {
        MutationObserver: typeof globalThis.MutationObserver;
      }
    ).MutationObserver;
    const observer = new MutationObserver((records) => {
      if (!current()) return;
      try {
        let removed = false;
        for (const record of records) {
          if (record.target.nodeType === 1) {
            const enclosing = (record.target as Element).closest('tags-box');
            if (enclosing) attachBox(enclosing);
          }
          for (const node of record.addedNodes) {
            if (node?.nodeType === 1) scan(node as Element);
          }
          removed ||= record.removedNodes.length > 0;
        }
        if (removed) {
          for (const [box, dispose] of boxes) {
            if (!box.isConnected || box.ownerDocument !== document) {
              boxes.delete(box);
              dispose();
            }
          }
        }
        attachSelector();
      } catch (error) {
        this.#onError(error);
      }
    });
    scope.add(() => observer.disconnect());
    observer.observe(document, { childList: true, subtree: true });
    try {
      scan(document);
      attachSelector();
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }
}
