import { selectedAnnotationIDs } from '../toolkit/reader';
import type { ReaderRuntime } from './types';

/**
 * Reader Surface CurrentTarget fallback for native annotation navigation.
 *
 * Zotero remains authoritative for the currently selected annotation. Neo keeps
 * only the last navigation target for host seams that temporarily expose no
 * selected annotation id. Feature-specific filtering belongs to reader-annotations.
 */
export class ReaderAnnotationNavigationState {
  #lastAnnotationKey: string | null = null;

  rememberAnnotation(key: string | null): void {
    this.#lastAnnotationKey = key;
  }

  selectedAnnotationKey(reader: ReaderRuntime): string | null {
    return selectedAnnotationIDs(reader)[0] ?? this.#lastAnnotationKey;
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
