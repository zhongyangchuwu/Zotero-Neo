import {
  SettingsTransferError,
  type SettingsDocument,
  type SettingsOperationContext,
  type SettingsSection,
  type SettingsValue,
  type SettingState,
} from './contracts';

/** Resource admission limit, not a product promise that exports fit in one megabyte. */
export const MAX_SETTINGS_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_STRING = 2 * 1024 * 1024;
const UNSAFE_KEYS = { ['__proto__']: true, prototype: true, constructor: true } as const;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}
function invalid(message: string): never {
  throw new SettingsTransferError('invalid-file', message);
}
function validateValue(
  value: unknown,
  depth: number,
  budget: { remaining: number },
): asserts value is SettingsValue {
  if (depth > 32 || --budget.remaining < 0)
    invalid('Settings data is too deeply nested or contains too many values');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('Settings numbers must be finite');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) invalid('A settings field exceeds the resource limit');
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) validateValue(entry, depth + 1, budget);
    return;
  }
  if (!object(value)) invalid('Settings fields must be JSON values');
  for (const [key, entry] of Object.entries(value)) {
    if (Object.hasOwn(UNSAFE_KEYS, key) || key.length > 512)
      invalid('Settings data contains an unsafe object key');
    validateValue(entry, depth + 1, budget);
  }
}
export function assertSettingsCurrent(context: SettingsOperationContext): void {
  if (context.signal.aborted || !context.isCurrent())
    throw new SettingsTransferError('cancelled', 'The settings operation was cancelled');
}
export function validateSettingsSection(value: unknown): asserts value is SettingsSection {
  if (
    !object(value) ||
    !text(value.adapterID, 128) ||
    !/^[a-z][a-z0-9.-]*$/u.test(value.adapterID) ||
    !Number.isSafeInteger(value.schemaVersion) ||
    Number(value.schemaVersion) < 1 ||
    !text(value.sourceVersion, 128) ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_ENTRIES
  )
    invalid('Invalid settings adapter section');
  const keys = new Set<string>(),
    budget = { remaining: 200_000 };
  for (const entry of value.entries) {
    if (
      !object(entry) ||
      !text(entry.key, 512) ||
      !entry.key ||
      Object.hasOwn(UNSAFE_KEYS, entry.key) ||
      keys.has(entry.key) ||
      !object(entry.state)
    )
      invalid('Invalid or duplicate settings entry');
    keys.add(entry.key);
    if (entry.state.kind === 'set' && Object.hasOwn(entry.state, 'value'))
      validateValue(entry.state.value, 0, budget);
    else if (entry.state.kind !== 'reset') invalid('Unknown settings operation');
  }
}
export function validateSettingsDocument(value: unknown): asserts value is SettingsDocument {
  if (!object(value) || value.format !== 'zotero-neo-settings')
    invalid('This is not a Neo settings file');
  if (value.schemaVersion !== 1)
    throw new SettingsTransferError(
      'unsupported-schema',
      'This settings file version is not supported',
    );
  if (
    !text(value.createdAt, 64) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !object(value.producer) ||
    value.producer.name !== 'Zotero Neo' ||
    !text(value.producer.version, 128) ||
    !text(value.zoteroVersion, 128) ||
    !Array.isArray(value.sections) ||
    value.sections.length > 64
  )
    invalid('Invalid settings file metadata');
  const adapters = new Set<string>();
  let entries = 0;
  for (const section of value.sections) {
    validateSettingsSection(section);
    if (adapters.has(section.adapterID) || (entries += section.entries.length) > MAX_ENTRIES)
      invalid('Duplicate adapters or too many settings');
    adapters.add(section.adapterID);
  }
}
export function parseSettingsDocument(text: string): SettingsDocument {
  if (text.length > MAX_SETTINGS_BYTES) invalid('Settings file exceeds the resource limit');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return invalid('Settings file does not contain valid JSON');
  }
  validateSettingsDocument(value);
  return value;
}
export function serializeSettingsDocument(document: SettingsDocument): string {
  validateSettingsDocument(document);
  const text = JSON.stringify(document);
  if (text.length > MAX_SETTINGS_BYTES) invalid('Settings file exceeds the resource limit');
  return text;
}
function equalValue(left: SettingsValue, right: SettingsValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left))
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => equalValue(entry, right[index]!))
    );
  if (Array.isArray(right)) return false;
  const l = left as { readonly [key: string]: SettingsValue },
    r = right as { readonly [key: string]: SettingsValue };
  const keys = Object.keys(l);
  return (
    keys.length === Object.keys(r).length &&
    keys.every((key) => Object.hasOwn(r, key) && equalValue(l[key]!, r[key]!))
  );
}
export function sameSettingState(left: SettingState, right: SettingState): boolean {
  return left.kind === 'reset'
    ? right.kind === 'reset'
    : right.kind === 'set' && equalValue(left.value, right.value);
}
export function settingStateText(state: SettingState, secret: boolean): string {
  if (state.kind === 'reset') return '⟨default / 默认⟩';
  if (secret) return state.value ? '⟨set / 已设置⟩' : '⟨empty / 空⟩';
  return typeof state.value === 'string' ? state.value : JSON.stringify(state.value);
}
