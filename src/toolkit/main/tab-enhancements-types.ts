import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';

export const TAB_RAIL_WIDTH = { min: 180, max: 520, default: 260 } as const;

export function normalizeTabRailWidth(width: unknown): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) return TAB_RAIL_WIDTH.default;
  return Math.round(Math.max(TAB_RAIL_WIDTH.min, Math.min(TAB_RAIL_WIDTH.max, width)));
}

export type TabDocumentKind = 'reader' | 'note';
export interface TabDocumentRef {
  readonly kind: TabDocumentKind;
  readonly libraryID: number;
  readonly key: string;
}

/** Primitive display metadata only; citekey is empty when no genuine key is available. */
export interface TabTitleFields {
  readonly nativeTitle: string;
  readonly title: string;
  readonly citekey: string;
  readonly author: string;
  readonly year: string;
  readonly filename: string;
}

export interface TabViewSnapshot {
  readonly nativeID: string;
  readonly viewID: string;
  readonly kind: TabDocumentKind | 'library' | 'other';
  readonly state: 'loaded' | 'loading' | 'unloaded';
  readonly selected: boolean;
  readonly document: TabDocumentRef | null;
  readonly fields: TabTitleFields;
}

export interface TabRailLayoutOptions {
  readonly side: 'left' | 'right';
  readonly width: number;
  readonly collapsed: boolean;
}
export interface TabRailLayout {
  ownsTarget(target: EventTarget | null): boolean;
  update(options: TabRailLayoutOptions): void;
  dispose(): void;
}

/** Private native tab objects, DOM layout and session metadata stay behind this port. */
export interface TabEnhancementHost {
  readonly id: string;
  readonly window: MainWindow;
  snapshot(): readonly TabViewSnapshot[];
  observe(listener: () => void): Cleanup;
  metadata(document: TabDocumentRef): TabTitleFields | null;
  select(nativeID: string): boolean;
  focusContent(): void;
  close(nativeIDs: readonly string[]): void;
  move(nativeID: string, beforeNativeID: string | null): void;
  /** Opens a real native unloaded view; false means retired before mutation, never a fake tab. */
  open(document: TabDocumentRef, viewID: string, isCurrent: () => boolean): Promise<string | false>;
  mountSidebar(
    root: HTMLElement,
    toolbarSlot: HTMLElement,
    options: TabRailLayoutOptions,
    onResize: (width: number) => void,
  ): TabRailLayout;
  dispose(): void;
}
