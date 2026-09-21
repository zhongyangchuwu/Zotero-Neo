import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { moveMainItemCursor } from '../../src/main/host';

describe('Main item Cursor host adapter', () => {
  it('uses Zotero focus-only selection movement without collapsing native selection', () => {
    const select = vi.fn();
    const ensureRowIsVisible = vi.fn();
    const onSelection = vi.fn(
      (
        index: number,
        shiftSelect: boolean,
        toggleSelection: boolean,
        moveFocused: boolean,
        shouldDebounce?: boolean,
      ) => {
        expect(index).toBe(4);
        expect(shiftSelect).toBe(false);
        expect(toggleSelection).toBe(false);
        expect(moveFocused).toBe(true);
        expect(shouldDebounce).toBe(true);
      },
    );
    const window = {
      ZoteroPane: {
        itemsView: {
          rowCount: 8,
          tree: { _onSelection: onSelection },
          selection: { focused: 2, count: 3, select },
          ensureRowIsVisible,
        },
      },
    } as unknown as MainWindow;

    expect(moveMainItemCursor(window, 4, true)).toBe(true);
    expect(onSelection).toHaveBeenCalledOnce();
    expect(ensureRowIsVisible).toHaveBeenCalledWith(4);
    expect(select).not.toHaveBeenCalled();
  });

  it('clamps the cursor target and fails closed when the host seam is unavailable', () => {
    const onSelection = vi.fn();
    const available = {
      ZoteroPane: {
        itemsView: { rowCount: 3, tree: { _onSelection: onSelection } },
      },
    } as unknown as MainWindow;
    expect(moveMainItemCursor(available, 20)).toBe(true);
    expect(onSelection).toHaveBeenCalledWith(2, false, false, true, false);

    const unavailable = {
      ZoteroPane: { itemsView: { rowCount: 3, tree: {} } },
    } as unknown as MainWindow;
    expect(moveMainItemCursor(unavailable, 1)).toBe(false);
  });
});
