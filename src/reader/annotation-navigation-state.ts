import type { AnnotationColor, ReaderRuntime } from './types';

/**
 * Reader-local fallback state for annotation navigation.
 *
 * Zotero remains authoritative for the currently selected annotation. Neo keeps
 * only the last navigation target for host seams that temporarily expose no
 * selected annotation id, plus the color filter because Zotero currently
 * exposes a write-only setFilter seam here.
 */
export class ReaderAnnotationNavigationState {
  #filterColor: AnnotationColor | null = null;
  #lastAnnotationKey: string | null = null;

  filterColor(): AnnotationColor | null {
    return this.#filterColor;
  }

  setFilterColor(color: AnnotationColor | null): void {
    this.#filterColor = color;
  }

  rememberAnnotation(key: string | null): void {
    this.#lastAnnotationKey = key;
  }

  selectedAnnotationKey(reader: ReaderRuntime): string | null {
    return reader._internalReader?._state?.selectedAnnotationIDs?.[0] ?? this.#lastAnnotationKey;
  }

  /**
   * Clears all fallback state or only when the remembered key matches `key`.
   * @param key Optional key to protect a newer navigation target.
   */
  clearAnnotation(key?: string): void {
    if (key !== undefined && this.#lastAnnotationKey !== key) return;
    this.#lastAnnotationKey = null;
  }
}
