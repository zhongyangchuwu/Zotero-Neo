import { describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import type { MainNavigation } from '../../src/main/navigation';
import { MainSelectionActions, toggleSelectionTarget } from '../../src/main/selection-actions';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

describe('Main Selection actions', () => {
  it('toggles a target all-or-none instead of symmetric difference', () => {
    const selection = new SelectionStore();
    const a = { libraryID: 1, itemID: 10 };
    const b = { libraryID: 1, itemID: 11 };
    const c = { libraryID: 1, itemID: 12 };
    selection.replace([a, c]);

    expect(toggleSelectionTarget(selection, [a, b, c])).toBe('added');
    expect(selection.values()).toEqual([a, c, b]);

    expect(toggleSelectionTarget(selection, [a, b, c])).toBe('removed');
    expect(selection.values()).toEqual([]);
  });

  it('toggles Cursor then advances it in the normal Yazi-like workflow', () => {
    const rows = [
      { ref: { id: 10, libraryID: 1 } },
      { ref: { id: 11, libraryID: 1 } },
    ];
    const selection = {
      focused: 0,
      pivot: 0,
      selected: new Set([0]),
      _updateTree: vi.fn(),
    };
    const window = {
      ZoteroPane: {
        itemsView: {
          rowCount: rows.length,
          selection,
          getRow: (index: number) => rows[index],
          tree: { invalidate: vi.fn() },
        },
      },
    } as unknown as MainWindow;
    const session = {
      selection: new SelectionStore(),
    } as unknown as MainWindowSession;
    const navigation = {
      refreshSelectionIndicator: vi.fn(),
      navigate: vi.fn(),
    } as unknown as MainNavigation;
    const actions = new MainSelectionActions(navigation);

    expect(actions.toggleCursor(window, session, true)).toBe('added');
    expect(session.selection.values()).toEqual([{ libraryID: 1, itemID: 10 }]);
    expect(navigation.refreshSelectionIndicator).toHaveBeenCalledWith(window, session);
    expect(navigation.navigate).toHaveBeenCalledWith(window, session, 1, 1, true);
  });
});
