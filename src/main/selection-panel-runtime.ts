import type { ItemRef } from './selection-store';

/** Mutable state owned by one Main selection-panel feature instance. */
export class SelectionPanelRuntime {
  open = false;
  refs: ItemRef[] = [];
  selected = 0;
  commandBuffer = '';
  commandTimer: number | undefined;
  overlay: HTMLElement | null = null;
  list: HTMLElement | null = null;
  details: HTMLElement | null = null;
  count: HTMLElement | null = null;
  footer: HTMLElement | null = null;
  previousElement: Element | null = null;
  themeCleanup: (() => void) | null = null;
}
