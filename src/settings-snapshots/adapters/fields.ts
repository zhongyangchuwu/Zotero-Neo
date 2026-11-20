import { BINDING_SCHEMA_VERSION, migrateBindingPreferences } from '../../core/preferences';
import type { SettingState, SettingsValue } from '../contracts';
import { parseBindingOverrides } from '../../input/bindings';
import { parseLocalRuleProfile } from '../../document-analysis/local-rules/profile';
import {
  normalizeAICredential,
  normalizeAIEndpoint,
  parseAIConfiguration,
} from '../../ai/configuration-policy';
import { SettingsSnapshotError } from '../contracts';

export interface TransferField {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly type?: 'boolean' | 'number' | 'string';
  readonly secret?: boolean;
  readonly restart?: boolean;
  readonly last?: boolean;
  readonly path?: 'file' | 'directory';
  readonly manual?: string;
  readonly library?: boolean;
  readonly normalize?: (state: SettingState) => SettingState;
  readonly validate?: (value: SettingsValue) => boolean;
}
export const fields = (
  type: TransferField['type'],
  category: string,
  keys: string,
): TransferField[] =>
  keys
    .split(/\s+/u)
    .filter(Boolean)
    .map((key) => ({ key, label: key, type, category }));
const object = (value: SettingsValue): value is { readonly [key: string]: SettingsValue } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const textObject = (value: SettingsValue): boolean =>
  object(value) && Object.values(value).every((item) => typeof item === 'string');
export function safeEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
function jsonObject(raw: SettingsValue): { readonly [key: string]: SettingsValue } | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as SettingsValue;
    return object(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
export function validAI(value: SettingsValue): boolean {
  const parsed = jsonObject(value);
  if (
    !parsed ||
    Object.keys(parsed).some(
      (key) => !['api', 'endpoint', 'model', 'maxOutputTokens', 'sendImages'].includes(key),
    )
  )
    return false;
  try {
    parseAIConfiguration(parsed);
    return true;
  } catch {
    return false;
  }
}
export function validBindings(value: SettingsValue): boolean {
  if (
    !object(value) ||
    Object.keys(value).some((key) => key !== 'schemaVersion' && key !== 'overrides') ||
    !Number.isInteger(value.schemaVersion) ||
    Number(value.schemaVersion) < 0 ||
    Number(value.schemaVersion) > BINDING_SCHEMA_VERSION ||
    typeof value.overrides !== 'string'
  )
    return false;
  try {
    const parsed = JSON.parse(value.overrides) as SettingsValue;
    if (
      !object(parsed) ||
      !Object.values(parsed).every((item) => item === null || typeof item === 'string')
    )
      return false;
    if (Number(value.schemaVersion) < BINDING_SCHEMA_VERSION) return true;
    const canonical = parseBindingOverrides(value.overrides);
    return (
      Object.keys(canonical).length === Object.keys(parsed).length &&
      Object.values(canonical).every((action) => action === null || typeof action === 'string')
    );
  } catch {
    return value.overrides === '';
  }
}
export function migrateTransferBindings(value: SettingsValue): {
  schemaVersion: number;
  overrides: string;
} {
  if (!validBindings(value)) throw new Error('Invalid binding schema');
  const binding = value as { schemaVersion: number; overrides: string };
  const saved = new Map<string, string | number | boolean>([
    ['bindings.schemaVersion', binding.schemaVersion],
    ['bindings', binding.overrides],
  ]);
  migrateBindingPreferences({
    get: ((key: string, fallback: string | number | boolean) => saved.get(key) ?? fallback) as {
      (key: string, fallback: string): string;
      (key: string, fallback: number): number;
      (key: string, fallback: boolean): boolean;
    },
    set: (key, setting) => {
      saved.set(key, setting);
    },
    clear: (key) => {
      saved.delete(key);
    },
  });
  const canonical = {
    schemaVersion: BINDING_SCHEMA_VERSION,
    overrides: String(saved.get('bindings') ?? ''),
  };
  if (!validBindings(canonical)) throw new Error('Invalid canonical binding schema');
  return canonical;
}
export function nativeResourceField(key: string): TransferField | null {
  if (/^webdav:password:.+$/u.test(key)) {
    try {
      if (!decodeURIComponent(key.slice(16)) || /[\r\n\0]/u.test(decodeURIComponent(key.slice(16))))
        return null;
    } catch {
      return null;
    }
    return {
      key,
      label: 'WebDAV password',
      category: 'WebDAV',
      secret: true,
      type: 'string',
      restart: true,
      last: true,
    };
  }
  if (key === 'quickCopy:sites')
    return {
      key,
      label: 'Quick Copy per-site formats',
      category: 'Quick Copy',
      validate: validQuickCopySites,
    };
  if (key === 'locate:engines')
    return {
      key,
      label: 'Locate engines (without device icons)',
      category: 'Locate',
      validate: validLocate,
    };
  if (
    /^library:(user|group):[1-9][0-9]*:(tagColors|readerCustomThemes|attachmentRenameTemplate|autoRenameFiles|autoRenameFilesFileTypes)$/u.test(
      key,
    )
  )
    return {
      key,
      label: `Library setting: ${key.split(':').at(-1)}`,
      category: 'Synced library settings (optional)',
      library: true,
      validate: (value) => validLibrary(key, value),
    };
  if (key.startsWith('csl:') && safeEndpoint(key.slice(4)))
    return {
      key,
      label: 'Citation style (CSL)',
      category: 'Citation styles',
      restart: true,
      validate: (value) =>
        object(value) &&
        Object.keys(value).every((name) =>
          ['id', 'title', 'source', 'hidden', 'text'].includes(name),
        ) &&
        value.id === key.slice(4) &&
        typeof value.title === 'string' &&
        typeof value.source === 'string' &&
        (!value.source || safeEndpoint(value.source)) &&
        typeof value.hidden === 'boolean' &&
        typeof value.text === 'string' &&
        !/<!DOCTYPE|<!ENTITY|<\s*script\b/iu.test(value.text),
    };
  return null;
}
function validQuickCopySites(value: SettingsValue): boolean {
  if (!Array.isArray(value)) return false;
  const domains = new Set<string>();
  for (const row of value) {
    if (
      !object(row) ||
      Object.keys(row).some((name) => !['domainPath', 'format'].includes(name)) ||
      typeof row.domainPath !== 'string' ||
      typeof row.format !== 'string' ||
      domains.has(row.domainPath)
    )
      return false;
    domains.add(row.domainPath);
  }
  return true;
}

const CREDENTIAL_TEXT =
  /(?:https?:\/\/[^/\s]*:[^/\s]*@|[?&#](?:access_token|api_key|apikey|password|token|secret|client_secret|authorization)=)/iu;
function credentialParameter(name: string): boolean {
  return /^(?:accessToken|apiKey|password|passwd|token|secret|clientSecret|authorization|credential|credentials)$/iu.test(
    name.replace(/[-_\s]/gu, ''),
  );
}
function locateTextContainsCredentials(value: string): boolean {
  if (CREDENTIAL_TEXT.test(value)) return true;
  try {
    const url = new URL(value);
    if (url.username || url.password) return true;
    for (const parameters of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) {
      for (const [name, parameter] of parameters) {
        if (credentialParameter(name) || CREDENTIAL_TEXT.test(parameter)) return true;
      }
    }
  } catch {
    // Ordinary labels and OpenSearch substitutions need not be standalone URLs.
  }
  return false;
}
function locateContainsCredentials(value: SettingsValue): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((engine) => {
    if (!object(engine)) return false;
    for (const [key, item] of Object.entries(engine)) {
      if (typeof item === 'string' && locateTextContainsCredentials(item)) return true;
      if ((key === '_urlParams' || key === '_urlNamespaces') && object(item)) {
        for (const [name, parameter] of Object.entries(item)) {
          if (
            (key === '_urlParams' && credentialParameter(name)) ||
            (typeof parameter === 'string' && locateTextContainsCredentials(parameter))
          )
            return true;
        }
      }
    }
    return false;
  });
}

function validLocate(value: SettingsValue): boolean {
  const allowed = [
    '_alias',
    '_name',
    '_description',
    '_hidden',
    '_urlTemplate',
    '_method',
    '_urlNamespaces',
    '_urlParams',
    'alias',
    'name',
    'description',
    'hidden',
  ];
  return (
    !locateContainsCredentials(value) &&
    Array.isArray(value) &&
    value.every((engine) => {
      if (
        !object(engine) ||
        Object.keys(engine).some((key) => !allowed.includes(key)) ||
        typeof engine._urlTemplate !== 'string' ||
        !/^https?:\/\//u.test(engine._urlTemplate)
      )
        return false;
      try {
        const url = new URL(engine._urlTemplate);
        if (url.username || url.password) return false;
      } catch {
        return false;
      }
      for (const [key, item] of Object.entries(engine)) {
        if (key === '_urlNamespaces' && !textObject(item)) return false;
        if (
          key === '_urlParams' &&
          !textObject(item) &&
          !(Array.isArray(item) && item.length === 0)
        )
          return false;
        if (key === 'hidden' || key === '_hidden') {
          if (typeof item !== 'boolean') return false;
        } else if ((key === 'description' || key === '_description') && item === null) {
          continue;
        } else if (key !== '_urlNamespaces' && key !== '_urlParams' && typeof item !== 'string')
          return false;
      }
      return engine._method === undefined || engine._method === 'GET' || engine._method === 'POST';
    })
  );
}
function validLibrary(key: string, value: SettingsValue): boolean {
  if (key.endsWith(':attachmentRenameTemplate') || key.endsWith(':autoRenameFilesFileTypes'))
    return typeof value === 'string';
  if (key.endsWith(':autoRenameFiles')) return typeof value === 'boolean';
  if (key.endsWith(':tagColors'))
    return (
      Array.isArray(value) &&
      value.every(
        (tag) =>
          object(tag) &&
          Object.keys(tag).every((name) => ['name', 'color', 'position'].includes(name)) &&
          typeof tag.name === 'string' &&
          typeof tag.color === 'string' &&
          (tag.position === undefined || typeof tag.position === 'number'),
      )
    );
  return (
    Array.isArray(value) &&
    value.every(
      (theme) =>
        object(theme) &&
        Object.keys(theme).every((name) =>
          ['id', 'label', 'background', 'foreground'].includes(name),
        ) &&
        ['id', 'label', 'background', 'foreground'].every((key) => typeof theme[key] === 'string'),
    )
  );
}
export function validFieldState(field: TransferField, state: SettingState): boolean {
  if (state.kind === 'reset') return true;
  if (field.type && typeof state.value !== field.type) return false;
  if (
    field.type === 'number' &&
    (typeof state.value !== 'number' ||
      !Number.isInteger(state.value) ||
      state.value < -2_147_483_648 ||
      state.value > 2_147_483_647)
  )
    return false;
  if (!field.secret && typeof state.value === 'string' && CREDENTIAL_TEXT.test(state.value))
    return false;
  if (field.key.startsWith('secret:ai:')) {
    try {
      normalizeAIEndpoint(field.key.slice(10));
      if (typeof state.value !== 'string') return false;
      normalizeAICredential(state.value);
    } catch {
      return false;
    }
  }
  if (field.key === 'sync.storage.scheme' && state.value !== 'https' && state.value !== 'http')
    return false;
  if (field.key === 'sync.storage.protocol' && state.value !== 'webdav' && state.value !== 'zotero')
    return false;
  if (
    field.key === 'sync.storage.url' &&
    typeof state.value === 'string' &&
    /[@?#\r\n\0]/u.test(state.value)
  )
    return false;
  return !field.validate || field.validate(state.value);
}

/** Canonical data-only representation shared by capture and restore admission. */
export function normalizeTransferFieldState(
  field: TransferField,
  state: SettingState,
): SettingState {
  if (state.kind === 'reset') return state;
  if (field.key === 'locate:engines' && locateContainsCredentials(state.value))
    throw new SettingsSnapshotError(
      'sensitive-locate',
      'Locate engines containing credentials are not transferable.',
    );
  if (!validFieldState(field, state))
    throw new SettingsSnapshotError(
      'invalid-field',
      'Setting value does not match its field policy.',
    );
  if (field.normalize) return field.normalize(state);
  if (field.key.startsWith('secret:ai:')) {
    try {
      return { kind: 'set', value: normalizeAICredential(state.value as string) };
    } catch {
      throw new SettingsSnapshotError('invalid-field', 'AI credential is not transferable.');
    }
  }
  if (field.key === 'quickCopy:sites') {
    const rows = state.value as readonly { readonly domainPath: string; readonly format: string }[];
    return {
      kind: 'set',
      value: [...rows].sort((left, right) =>
        left.domainPath < right.domainPath ? -1 : left.domainPath > right.domainPath ? 1 : 0,
      ),
    };
  }
  if (field.key !== 'locate:engines') return state;
  return {
    kind: 'set',
    value: (state.value as readonly SettingsValue[]).map((engine) => {
      const normalized: Record<string, SettingsValue> = {
        _alias: 'Untitled',
        _name: 'Untitled',
        _description: null,
        _hidden: false,
        _urlParams: {},
      };
      for (const [key, value] of Object.entries(engine as Record<string, SettingsValue>)) {
        const name = ['alias', 'name', 'description', 'hidden'].includes(key) ? `_${key}` : key;
        normalized[name] = name === '_urlParams' && Array.isArray(value) ? {} : value;
      }
      return normalized;
    }),
  };
}

export function validLocalRules(value: SettingsValue): boolean {
  if (typeof value !== 'string') return false;
  try {
    parseLocalRuleProfile(value);
    return true;
  } catch {
    return false;
  }
}
