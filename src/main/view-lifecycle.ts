import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  currentMainItemCursorRef,
  mainItemViewGenerationToken,
  mainItemViewSettled,
  observeMainItemView,
  restoreMainItemCursorAnchor,
} from './host';
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

  const rememberCursor = (): void => {
    if (applying || !mainItemViewSettled(window)) return;
    // Zotero can emit onSelect after replacing the View rows but before onRefresh.
    // Keep the stable Cursor from the previous item-tree generation in that window.
    if (mainItemViewGenerationToken(window) !== viewGeneration) return;
    cursor = currentMainItemCursorRef(window);
    onStateChange?.();
  };

  const restoreCursor = (): void => {
    if (applying) return;
    applying = true;
    try {
      const restored = cursor ? restoreMainItemCursorAnchor(window, cursor) : false;
      logger.debug(`Main View refresh restored Cursor anchor=${restored}`);
    } catch (error) {
      logger.debug(`Main View Cursor restore failed: ${String(error)}`);
    } finally {
      viewGeneration = mainItemViewGenerationToken(window);
      applying = false;
      onStateChange?.();
    }
  };

  const removeObservers = observeMainItemView(window, {
    onSelect: rememberCursor,
    onRefresh: restoreCursor,
  });

  // Capture the initial Cursor after observers are attached so the lifecycle
  // starts from the same stable identity used by later refreshes.
  rememberCursor();

  return removeObservers;
}
