import type { Cleanup } from '../core/cleanup';
import type { PreferenceStore } from '../core/preference-store';
import { normalizeAttributeKey } from './extra';
import {
  ITEM_ATTRIBUTE_PREFERENCE,
  ITEM_ATTRIBUTE_OPTION_ID,
  MAX_ITEM_ATTRIBUTE_OPTIONS,
  isChoiceAttribute,
  type ItemAttributeDefinition,
  type ItemAttributeOption,
  type ItemAttributeSchema,
} from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptions(value: unknown): readonly ItemAttributeOption[] {
  if (!Array.isArray(value) || value.length > MAX_ITEM_ATTRIBUTE_OPTIONS)
    throw new Error('Invalid item attribute options');
  const ids = new Set<string>();
  const labels = new Set<string>();
  const options = value.map((option: unknown): ItemAttributeOption => {
    if (
      !record(option) ||
      Object.keys(option).length !== 2 ||
      typeof option.id !== 'string' ||
      !ITEM_ATTRIBUTE_OPTION_ID.test(option.id) ||
      typeof option.label !== 'string' ||
      !option.label ||
      option.label.length > 120 ||
      option.label !== option.label.trim().normalize('NFC') ||
      /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(option.label)
    )
      throw new Error('Invalid item attribute option');
    const label = option.label.toLowerCase().normalize('NFC');
    if (ids.has(option.id) || labels.has(label))
      throw new Error('Duplicate item attribute option ID or label');
    ids.add(option.id);
    labels.add(label);
    return Object.freeze({ id: option.id, label: option.label });
  });
  return Object.freeze(options);
}

/** Shared structural validation; native reserved-key classification belongs to the host. */
export function parseItemAttributeDefinitions(raw: string): readonly ItemAttributeDefinition[] {
  if (raw === '') return Object.freeze([]);
  const value: unknown = JSON.parse(raw);
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.fields) ||
    Object.keys(value).some((key) => key !== 'version' && key !== 'fields')
  )
    throw new Error('Invalid item attribute schema');
  const ids = new Set<string>();
  const keys = new Set<string>();
  const definitions = value.fields.map((field: unknown): ItemAttributeDefinition => {
    if (
      !record(field) ||
      typeof field.id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(field.id) ||
      typeof field.key !== 'string' ||
      field.key !== field.key.trim() ||
      field.key !== field.key.normalize('NFC') ||
      typeof field.label !== 'string' ||
      !field.label.trim() ||
      /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(field.label) ||
      (field.type !== 'text' &&
        field.type !== 'number' &&
        field.type !== 'single-select' &&
        field.type !== 'multi-select')
    )
      throw new Error('Invalid item attribute definition');
    const key = normalizeAttributeKey(field.key);
    if (ids.has(field.id) || keys.has(key)) throw new Error('Duplicate attribute identity or key');
    ids.add(field.id);
    keys.add(key);
    const choice = isChoiceAttribute(field.type);
    if (Object.keys(field).length !== (choice ? 5 : 4) || (choice && value.version !== 2))
      throw new Error('Invalid item attribute definition');
    const options = choice ? parseOptions(field.options) : undefined;
    return Object.freeze({
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      ...(options ? { options } : {}),
    });
  });
  return Object.freeze(definitions);
}

export class ItemAttributeStore {
  readonly #preferences: PreferenceStore;
  readonly #validateNativeKey: (key: string) => void;
  readonly #listeners = new Set<() => void>();
  readonly #unobserve: Cleanup | undefined;
  #cached: ItemAttributeSchema | undefined;
  #disposed = false;

  constructor(preferences: PreferenceStore, validateNativeKey: (key: string) => void) {
    if (typeof validateNativeKey !== 'function')
      throw new Error('Native key classifier is unavailable');
    this.#preferences = preferences;
    this.#validateNativeKey = validateNativeKey;
    this.#unobserve = preferences.observe?.(ITEM_ATTRIBUTE_PREFERENCE, () => {
      this.#cached = undefined;
      this.#notify();
    });
  }

  #raw(): string {
    const raw = this.#preferences.get(ITEM_ATTRIBUTE_PREFERENCE, '');
    if (typeof raw !== 'string') throw new Error('Item attribute preference is not a string');
    return raw;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Item attribute store is disposed');
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  read(): ItemAttributeSchema {
    this.#assertActive();
    const revision = this.#raw();
    if (this.#cached?.revision === revision) return this.#cached;
    const definitions = parseItemAttributeDefinitions(revision);
    for (const definition of definitions) this.#validateNativeKey(definition.key);
    this.#cached = Object.freeze({ definitions, revision });
    return this.#cached;
  }

  write(definitions: readonly ItemAttributeDefinition[], expectedRevision: string): void {
    this.#assertActive();
    const current = this.read();
    if (current.revision !== expectedRevision)
      throw new Error('Item attribute schema revision changed');
    const version = definitions.some(({ type }) => isChoiceAttribute(type)) ? 2 : 1;
    const raw = JSON.stringify({ version, fields: definitions });
    const validated = parseItemAttributeDefinitions(raw);
    const byID = new Map(current.definitions.map((definition) => [definition.id, definition]));
    const byKey = new Map(
      current.definitions.map((definition) => [normalizeAttributeKey(definition.key), definition]),
    );
    for (const definition of validated) {
      this.#validateNativeKey(definition.key);
      const previous = byID.get(definition.id);
      if (previous && previous.key !== definition.key)
        throw new Error('Attribute storage keys are immutable');
      if (
        previous &&
        previous.type !== definition.type &&
        (isChoiceAttribute(previous.type) || isChoiceAttribute(definition.type))
      )
        throw new Error('Choice attribute types are immutable');
      const owner = byKey.get(normalizeAttributeKey(definition.key));
      if (owner && owner.id !== definition.id) throw new Error('Attribute IDs are immutable');
    }
    // A classifier is external code: do not let its reentrant changes bypass the guard.
    if (this.#raw() !== expectedRevision) throw new Error('Item attribute schema revision changed');
    if (raw === current.revision) return;
    this.#preferences.set(ITEM_ATTRIBUTE_PREFERENCE, raw);
    this.#cached = undefined;
    if (!this.#unobserve) this.#notify();
  }

  observe(listener: () => void): Cleanup {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unobserve?.();
    this.#listeners.clear();
    this.#cached = undefined;
  }
}
