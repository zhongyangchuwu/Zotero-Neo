export type Cleanup = () => void;

export class CleanupScope {
  readonly #cleanups: Cleanup[] = [];
  #disposed = false;

  add(cleanup: Cleanup): Cleanup {
    if (this.#disposed) {
      cleanup();
      return cleanup;
    }
    this.#cleanups.push(cleanup);
    return cleanup;
  }

  addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
  }

  addTimeout(cancel: () => void): void {
    this.add(cancel);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (let index = this.#cleanups.length - 1; index >= 0; index -= 1) {
      try {
        this.#cleanups[index]?.();
      } catch {
        // Cleanup is best-effort; remaining resources must still be released.
      }
    }
    this.#cleanups.length = 0;
  }

  get disposed(): boolean {
    return this.#disposed;
  }
}
