import { describe, expect, it } from 'vitest';

import { SelectionStore, itemRefKey, type ItemRef } from '../../src/main/selection-store';

const A: ItemRef = { libraryID: 1, itemID: 10 };
const B: ItemRef = { libraryID: 1, itemID: 11 };
const C: ItemRef = { libraryID: 2, itemID: 10 };

describe('SelectionStore', () => {
  it('keys items by library and item identity rather than row position', () => {
    expect(itemRefKey(A)).toBe('1:10');
    expect(itemRefKey(C)).toBe('2:10');

    const store = new SelectionStore();
    expect(store.add(A)).toBe(true);
    expect(store.add({ ...A })).toBe(false);
    expect(store.add(C)).toBe(true);
    expect(store.values()).toEqual([A, C]);
  });

  it('supports deterministic toggle, replace and clear semantics', () => {
    const store = new SelectionStore();

    expect(store.toggle(A)).toBe(true);
    expect(store.has(A)).toBe(true);
    expect(store.toggle(A)).toBe(false);
    expect(store.empty).toBe(true);

    store.replace([A, B, A]);
    expect(store.size).toBe(2);
    expect(store.values()).toEqual([A, B]);

    store.clear();
    expect(store.values()).toEqual([]);
    expect(store.empty).toBe(true);
  });

  it('counts only workset members visible in the current View', () => {
    const store = new SelectionStore();
    store.replace([A, B, C]);

    expect(store.countVisible([B, { ...B }, C])).toBe(2);
    expect(store.size).toBe(3);
  });
});
