import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  currentMainItemCursorRef,
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
): () => void {
  let cursor: ItemRef | undefined = currentMainItemCursorRef(window);
  let applying = false;

  const rememberCursor = (): void => {
    if (applying || !mainItemViewSettled(window)) return;
    cursor = currentMainItemCursorRef(window);
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
      applying = false;
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
