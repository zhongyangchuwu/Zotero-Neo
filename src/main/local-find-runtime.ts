/** Mutable state owned by one Main local-find feature instance. */
export class MainLocalFindRuntime {
  open = false;
  query = '';
  overlay: HTMLElement | null = null;
  input: HTMLInputElement | null = null;
  previousElement: Element | null = null;
  themeCleanup: (() => void) | null = null;
}
