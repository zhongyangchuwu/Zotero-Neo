import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  currentMainItemCursorRef,
  mainItemViewGenerationToken,
  mainItemViewSettled,
  observeMainItemView,
  projectMainSelection,
} from './host';
import type { MainWindowSession } from './session';
import type { ItemRef } from './selection-store';

/**
 * Keeps Neo's stable Cursor/Selection identities projected onto Zotero's current
 * item-tree View. Zotero remains authoritative for the View itself.
 */
export function installMainViewLifecycle(
  window: MainWindow,
  session: MainWindowSession,
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

  const restoreProjection = (): void => {
    if (applying) return;
    applying = true;
    try {
      const visible = projectMainSelection(window, session.selection.values(), cursor);
      logger.debug(
        `Main View refresh projected Selection visible=${visible}/${session.selection.size}`,
      );
    } catch (error) {
      logger.debug(`Main View refresh projection failed: ${String(error)}`);
    } finally {
      viewGeneration = mainItemViewGenerationToken(window);
      applying = false;
      onStateChange?.();
    }
  };

  const removeObservers = observeMainItemView(window, {
    onSelect: rememberCursor,
    onRefresh: restoreProjection,
  });

  // Capture the initial Cursor after observers are attached so the lifecycle
  // starts from the same stable identity used by later refreshes.
  rememberCursor();

  return removeObservers;
}
