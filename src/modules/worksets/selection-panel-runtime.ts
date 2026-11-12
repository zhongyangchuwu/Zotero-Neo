import type { ItemRef } from '../../core/item-ref';

/** Mutable state owned by one Main selection-panel feature instance. */
export class SelectionPanelRuntime {
  open = false;
  revision = 0;
  refs: ItemRef[] = [];
  selected = 0;
  commandBuffer = '';
  commandTimer: number | undefined;
  overlay: HTMLElement | null = null;
  previousElement: Element | null = null;
  themeCleanup: (() => void) | null = null;
}
