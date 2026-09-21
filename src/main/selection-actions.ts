import type { MainWindow } from '../core/contracts';
import { mainCursorItemRef, projectMainItemSelection } from './host';
import type { MainNavigation } from './navigation';
import type { ItemRef, SelectionStore } from './selection-store';
import type { MainWindowSession } from './session';

export type SelectionToggleResult = 'added' | 'removed' | 'empty';

export function toggleSelectionTarget(
  selection: SelectionStore,
  target: readonly ItemRef[],
): SelectionToggleResult {
  if (!target.length) return 'empty';
  const remove = target.every((ref) => selection.has(ref));
  for (const ref of target) {
    if (remove) selection.delete(ref);
    else selection.add(ref);
  }
  return remove ? 'removed' : 'added';
}

/** Owns committed Main Selection operations; Visual owns only transient range construction. */
export class MainSelectionActions {
  readonly #navigation: MainNavigation;

  constructor(navigation: MainNavigation) {
    this.#navigation = navigation;
  }

  toggleCursor(
    window: MainWindow,
    session: MainWindowSession,
    shouldDebounce = false,
  ): SelectionToggleResult {
    const cursor = mainCursorItemRef(window);
    if (!cursor) return 'empty';

    const result = toggleSelectionTarget(session.selection, [cursor]);
    projectMainItemSelection(window, session.selection.values(), shouldDebounce);
    this.#navigation.refreshSelectionIndicator(window, session);

    // Yazi-like high-frequency workflow: toggle the current item, then advance Cursor.
    this.#navigation.navigate(window, session, 1, 1, shouldDebounce);
    return result;
  }

  toggleTarget(
    window: MainWindow,
    session: MainWindowSession,
    target: readonly ItemRef[],
    shouldDebounce = false,
  ): SelectionToggleResult {
    const result = toggleSelectionTarget(session.selection, target);
    if (result === 'empty') return result;
    projectMainItemSelection(window, session.selection.values(), shouldDebounce);
    this.#navigation.refreshSelectionIndicator(window, session);
    return result;
  }
}
