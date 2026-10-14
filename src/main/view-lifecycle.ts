import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  currentMainItemCursorRef,
  mainItemViewGenerationToken,
  mainItemViewSettled,
  observeMainItemView,
  restoreMainItemCursorAnchor,
  type MainItemViewSelectionIntent,
} from '../toolkit/main';
import type { ItemRef } from './selection-store';

/** Keeps Neo's stable Cursor identity anchored to Zotero's current item-tree View. */
export function installMainViewLifecycle(
  window: MainWindow,
  logger: Logger,
  onStateChange?: () => void,
): () => void {
  let cursor: ItemRef | undefined = currentMainItemCursorRef(window);
  let viewGeneration = mainItemViewGenerationToken(window);
  let applying = false;
  let retired = false;

  const rememberCursor = (): void => {
    if (retired || applying || !mainItemViewSettled(window)) return;
    // Ignore native fallback selections until row completion or refresh reconciles the generation.
    // Reconciliation restores the cached identity before admitting later user selections.
    if (mainItemViewGenerationToken(window) !== viewGeneration) return;
    cursor = currentMainItemCursorRef(window);
    onStateChange?.();
  };

  const restoreCursor = (): void => {
    if (retired || applying) return;
    applying = true;
    try {
      const restored = cursor ? restoreMainItemCursorAnchor(window, cursor) : false;
      logger.debug(`Main View update restored Cursor anchor=${restored}`);
    } catch (error) {
      logger.debug(`Main View Cursor restore failed: ${String(error)}`);
    } finally {
      applying = false;
      if (!retired) {
        viewGeneration = mainItemViewGenerationToken(window);
        onStateChange?.();
      }
    }
  };

  const settleRows = (intent: MainItemViewSelectionIntent): void => {
    if (retired || applying || !mainItemViewSettled(window)) return;
    const generation = mainItemViewGenerationToken(window);
    if (intent === 'explicit') {
      const selectedCursor = currentMainItemCursorRef(window);
      cursor = selectedCursor;
      viewGeneration = generation;
      onStateChange?.();
      return;
    }
    if (generation === viewGeneration) return;
    // Preserve updates restore the stable anchor before admitting this generation's
    // later selections. Explicit native targets above are adopted instead.
    restoreCursor();
  };

  const removeObservers = observeMainItemView(window, {
    onSelect: rememberCursor,
    onRefresh: restoreCursor,
    onRowsSettled: settleRows,
  });

  // Capture the initial Cursor after observers are attached so the lifecycle
  // starts from the same stable identity used by later refreshes.
  rememberCursor();

  return () => {
    if (retired) return;
    retired = true;
    removeObservers();
  };
}
