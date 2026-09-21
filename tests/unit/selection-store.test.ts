import { describe, expect, it } from 'vitest';
import { SelectionStore, type ItemRef } from '../../src/main/selection-store';

const a: ItemRef = { libraryID: 1, itemID: 10 };
const b: ItemRef = { libraryID: 1, itemID: 11 };
const c: ItemRef = { libraryID: 2, itemID: 10 };

describe('SelectionStore', () => {
  it('keys the workset by stable library/item identity', () => {
    const store = new SelectionStore();

    expect(store.add(a)).toBe(true);
    expect(store.add({ ...a })).toBe(false);
    expect(store.add(c)).toBe(true);

    expect(store.size).toBe(2);
    expect(store.has(a)).toBe(true);
    expect(store.has(c)).toBe(true);
    expect(store.values()).toEqual([a, c]);
  });

  it('toggles single members without depending on row indexes', () => {
    const store = new SelectionStore();

    expect(store.toggle(a)).toBe(true);
    expect(store.has(a)).toBe(true);
    expect(store.toggle(a)).toBe(false);
    expect(store.has(a)).toBe(false);
  });

  it('applies the Visual target all-or-none toggle rule', () => {
    const store = new SelectionStore();
    store.add(a);
    store.add(c);

    expect(store.toggleTarget([a, b, c])).toBe('added');
    expect(store.values()).toEqual([a, c, b]);

    expect(store.toggleTarget([a, b, c])).toBe('removed');
    expect(store.empty).toBe(true);
  });

  it('deduplicates a target and ignores invalid identities', () => {
    const store = new SelectionStore();

    expect(
      store.toggleTarget([a, { ...a }, { libraryID: 0, itemID: 20 }, { libraryID: 1, itemID: -1 }]),
    ).toBe('added');
    expect(store.values()).toEqual([a]);

    expect(store.clear()).toBe(true);
    expect(store.clear()).toBe(false);
    expect(store.toggleTarget([])).toBe('unchanged');
  });
});
