import { describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import { ItemAttributeStore, parseItemAttributeDefinitions } from '../../src/item-attributes/store';
import {
  ITEM_ATTRIBUTE_PREFERENCE,
  type ItemAttributeDefinition,
} from '../../src/item-attributes/types';

const field: ItemAttributeDefinition = {
  id: 'score',
  key: 'Research Score',
  label: 'Score',
  type: 'number',
};
const schema = (fields: readonly ItemAttributeDefinition[]) =>
  JSON.stringify({ version: 1, fields });

function preferences(initial: unknown = '') {
  let raw = initial;
  const listeners = new Set<() => void>();
  const unobserve = vi.fn();
  const store = {
    has: () => raw !== '',
    get: () => raw,
    set: vi.fn((key: string, value: unknown) => {
      expect(key).toBe(ITEM_ATTRIBUTE_PREFERENCE);
      raw = value;
      for (const listener of listeners) listener();
    }),
    clear: vi.fn(),
    observe: vi.fn((_key: string, listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unobserve();
      };
    }),
  } as unknown as PreferenceStore;
  return { store, unobserve };
}

describe('versioned local attribute definitions', () => {
  it('reads missing definitions without creating preferences and retains raw revision bytes', () => {
    const pref = preferences();
    const classify = vi.fn();
    const store = new ItemAttributeStore(pref.store, classify);
    expect(store.read()).toEqual({ definitions: [], revision: '' });
    expect(pref.store.set).not.toHaveBeenCalled();
    const raw = ` { "version": 1, "fields": [${JSON.stringify(field)}] } `;
    pref.store.set(ITEM_ATTRIBUTE_PREFERENCE, raw);
    const first = store.read();
    expect(first).toEqual({ definitions: [field], revision: raw });
    expect(store.read()).toBe(first);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(first.definitions[0])).toBe(true);
  });

  it('rejects non-NFC storage keys before creation without rewriting immutable identities', () => {
    const invalid = { ...field, key: '\u212b Score' };
    const canonical = { ...field, key: '\u00c5 Score' };
    expect(() => parseItemAttributeDefinitions(schema([invalid]))).toThrow();
    expect(parseItemAttributeDefinitions(schema([canonical]))).toEqual([canonical]);
    const pref = preferences();
    const classify = vi.fn();
    const store = new ItemAttributeStore(pref.store, classify);
    expect(() => store.write([invalid], '')).toThrow();
    expect(pref.store.set).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    store.write([canonical], '');
    const revision = schema([canonical]);
    expect(store.read()).toEqual({ definitions: [canonical], revision });
    expect(() => store.write([invalid], revision)).toThrow();
    expect(store.read().revision).toBe(revision);
    expect(pref.store.set).toHaveBeenCalledTimes(1);
  });

  it('keeps structural parsing independent of native reserved-key classification', () => {
    const reserved = { ...field, key: 'Title' };
    expect(parseItemAttributeDefinitions(schema([reserved]))).toEqual([reserved]);
  });

  it.each([
    'not JSON',
    'null',
    '[]',
    '{}',
    '{"version":2,"fields":[]}',
    '{"version":1,"fields":[],"other":true}',
    '{"version":1,"fields":[{"id":"x","key":"Score","type":"text"}]}',
    schema([{ ...field, type: 'date' } as unknown as ItemAttributeDefinition]),
    schema([{ ...field, label: 'bad\nlabel' }]),
    schema([{ ...field, key: 'zV-marks_reader' }]),
    schema([{ ...field, key: 'Score: injection' }]),
    schema([{ ...field, key: '\u212b Score' }]),
    schema([{ ...field, id: 'bad id' }]),
    schema([field, { ...field, key: 'Other key' }]),
    schema([field, { ...field, id: 'other', key: 'research_score' }]),
  ])('rejects corrupted definitions without dropping entries: %s', (raw) => {
    expect(() => parseItemAttributeDefinitions(raw)).toThrow();
    const pref = preferences(raw);
    expect(() => new ItemAttributeStore(pref.store, () => undefined).read()).toThrow();
    expect(pref.store.set).not.toHaveBeenCalled();
  });

  it('rejects non-string stored preferences and fails closed when classification is unavailable', () => {
    const pref = preferences(false);
    expect(() => new ItemAttributeStore(pref.store, () => undefined).read()).toThrow(
      /not a string/,
    );
    expect(
      () => new ItemAttributeStore(pref.store, undefined as unknown as (key: string) => void),
    ).toThrow(/classifier/);
    const raw = schema([field]);
    const reserved = preferences(raw);
    const store = new ItemAttributeStore(reserved.store, () => {
      throw new Error('Native registry unavailable');
    });
    expect(() => store.read()).toThrow(/Native registry unavailable/);
    expect(() => store.write([], raw)).toThrow(/Native registry unavailable/);
    expect(reserved.store.set).not.toHaveBeenCalled();
  });

  it('changes display/type metadata without changing storage identity and permits deletion', () => {
    const pref = preferences(schema([field]));
    const store = new ItemAttributeStore(pref.store, () => undefined);
    const renamed = { ...field, label: 'Priority', type: 'text' as const };
    store.write([renamed], store.read().revision);
    expect(store.read().definitions).toEqual([renamed]);
    store.write([], store.read().revision);
    expect(store.read().definitions).toEqual([]);
  });

  it('rejects key mutation, identity replacement, duplicate keys, and stale revisions without writing', () => {
    const raw = schema([field]);
    const pref = preferences(raw);
    const store = new ItemAttributeStore(pref.store, () => undefined);
    expect(() => store.write([{ ...field, key: 'Other' }], raw)).toThrow(/immutable/);
    expect(() => store.write([{ ...field, key: 'research-score' }], raw)).toThrow(/immutable/);
    expect(() => store.write([{ ...field, id: 'replacement' }], raw)).toThrow(/immutable/);
    expect(() => store.write([field, { ...field, id: 'other' }], raw)).toThrow(/Duplicate/);
    expect(() => store.write([], '')).toThrow(/revision/);
    expect(pref.store.set).not.toHaveBeenCalled();
    expect(store.read().revision).toBe(raw);
  });

  it('rechecks revision after native validation and never overwrites reentrant preference changes', () => {
    const pref = preferences();
    const external = schema([{ ...field, id: 'external', key: 'External' }]);
    const classify = vi.fn(() => pref.store.set(ITEM_ATTRIBUTE_PREFERENCE, external));
    const store = new ItemAttributeStore(pref.store, classify);
    expect(() => store.write([field], '')).toThrow(/revision/);
    expect(pref.store.get(ITEM_ATTRIBUTE_PREFERENCE, '')).toBe(external);
    expect(pref.store.set).toHaveBeenCalledTimes(1);
  });

  it('refuses new reserved keys without changing the existing schema', () => {
    const pref = preferences();
    const store = new ItemAttributeStore(pref.store, (key) => {
      if (key === 'Title') throw new Error('Native key is reserved');
    });
    expect(() => store.write([{ ...field, key: 'Title' }], '')).toThrow(/reserved/);
    expect(pref.store.set).not.toHaveBeenCalled();
  });

  it('observes external changes, releases subscriptions, and rejects disposed use', () => {
    const pref = preferences();
    const store = new ItemAttributeStore(pref.store, () => undefined);
    const listener = vi.fn();
    const release = store.observe(listener);
    store.write([field], '');
    expect(listener).toHaveBeenCalledTimes(1);
    store.write([field], store.read().revision);
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    pref.store.set(ITEM_ATTRIBUTE_PREFERENCE, 'corrupt');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.read()).toThrow();
    store.dispose();
    store.dispose();
    expect(pref.unobserve).toHaveBeenCalledTimes(1);
    expect(() => store.read()).toThrow(/disposed/);
    expect(() => store.write([], '')).toThrow(/disposed/);
    expect(() => store.observe(listener)).toThrow(/disposed/);
  });

  it('notifies local writes even without preference observation support', () => {
    const pref = preferences();
    const { observe: _observe, ...plain } = pref.store;
    const store = new ItemAttributeStore(plain, () => undefined);
    const listener = vi.fn();
    store.observe(listener);
    store.write([field], '');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.read().definitions).toEqual([field]);
  });
});
