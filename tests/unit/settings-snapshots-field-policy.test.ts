import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeResourceField,
  normalizeTransferFieldState,
  validFieldState,
  type TransferField,
} from '../../src/settings-snapshots/adapters/fields';
import { NATIVE_PREFERENCE_FIELDS } from '../../src/settings-snapshots/templates/zotero';
import { NEO_PREFERENCE_FIELDS } from '../../src/settings-snapshots/templates/zotero-neo';
import {
  normalizeAIConfiguration,
  normalizeAICredential,
  normalizeAIEndpoint,
  parseAIConfiguration,
} from '../../src/ai/configuration-policy';
import type { SettingState, SettingsValue } from '../../src/settings-snapshots/contracts';
import { SettingsSnapshotError } from '../../src/settings-snapshots/contracts';
import { READER_SCROLL_NUMBER_SPECS, KEY_GUIDE_NUMBER_SPECS } from '../../src/core/preferences';
import { createSettingsAdapters } from '../../src/settings-snapshots/registry';
import { ITEM_ATTRIBUTE_PREFERENCE } from '../../src/item-attributes/types';
import { settingsSnapshotHostFixture } from './settings-snapshots-host-fixture';

const set = (value: SettingsValue): SettingState => ({ kind: 'set', value });
function preference(key: string, fields = NATIVE_PREFERENCE_FIELDS): TransferField {
  const field = fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Missing test field: ${key}`);
  return field;
}
const locate = nativeResourceField('locate:engines')!;
const ai = preference('ai.configuration', NEO_PREFERENCE_FIELDS);
const config = {
  api: 'openai-chat-completions' as const,
  endpoint: 'https://example.test/v1',
  model: 'model-one',
  maxOutputTokens: 2048,
  sendImages: false,
};
const credential = (endpoint: string): TransferField => ({
  key: `secret:ai:${endpoint}`,
  label: 'AI endpoint API key',
  category: 'API credentials',
  type: 'string',
  secret: true,
});

function normalizedValue(field: TransferField, value: SettingsValue): SettingsValue {
  const result = normalizeTransferFieldState(field, set(value));
  if (result.kind !== 'set') throw new Error('Normalization lost an explicit setting');
  return result.value;
}

describe('Locate transfer policy', () => {
  it.each<Record<string, SettingsValue>>([
    { _urlTemplate: 'https://example.test/search?api_key=private-query' },
    { _urlTemplate: 'https://example.test/search?%74oken=private-encoded-query' },
    { _urlTemplate: 'https://example.test/search#access_token=private-fragment' },
    { _urlTemplate: 'https://user:private-password@example.test/search' },
    { _urlTemplate: 'https://example.test/search', _urlParams: { token: 'private-post' } },
    { _urlTemplate: 'https://example.test/search', _urlParams: { 'API-Key': 'private-post' } },
    { _urlTemplate: 'https://example.test/search', _urlParams: { authorization: 'private-post' } },
    {
      _urlTemplate: 'https://example.test/search',
      _urlParams: { redirect: 'https://other.test/?password=private-nested' },
    },
    {
      _urlTemplate: 'https://example.test/search',
      _urlParams: { redirect: 'https://private-user@other.test/search' },
    },
    {
      _urlTemplate: 'https://example.test/search',
      _urlParams: { redirect: 'https://other.test/?%74oken=private-encoded' },
    },
  ])('rejects structured credentials before a nonsecret value can be admitted: %j', (engine) => {
    const state = set([engine]);
    expect(validFieldState(locate, state)).toBe(false);
    let error: unknown;
    try {
      normalizeTransferFieldState(locate, state);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SettingsSnapshotError);
    expect(error).toMatchObject({
      code: 'sensitive-locate',
      message: 'Locate engines containing credentials are not transferable.',
    });
    expect(String(error)).not.toContain('private-');
  });

  it('canonicalizes native defaults, aliases, nullable description and empty POST parameters', () => {
    const source = Object.freeze([
      Object.freeze({
        alias: 'Search',
        name: 'Safe engine',
        hidden: false,
        _urlTemplate: 'https://example.test/search?q={searchTerms}',
        _urlParams: Object.freeze([]),
      }),
    ]);
    const canonical = normalizedValue(locate, source);
    expect(canonical).toEqual([
      {
        _alias: 'Search',
        _name: 'Safe engine',
        _description: null,
        _hidden: false,
        _urlTemplate: 'https://example.test/search?q={searchTerms}',
        _urlParams: {},
      },
    ]);
    expect(validFieldState(locate, set(canonical))).toBe(true);
    expect(normalizedValue(locate, canonical)).toEqual(canonical);
    expect(source[0]._urlParams).toEqual([]);
  });

  it('stays equal after constructor-equivalent native reload and portable capture', () => {
    const canonical = normalizedValue(locate, [
      {
        _urlTemplate: 'https://example.test/search',
        _method: 'POST',
        _urlParams: { q: '{searchTerms}' },
      },
      { _urlTemplate: 'https://example.test/lookup', _description: null },
    ]) as readonly Record<string, SettingsValue>[];
    // LocateEngine supplies these defaults; portable capture omits its device icon.
    const reloaded = canonical.map((engine) => ({
      _alias: 'Untitled',
      _name: 'Untitled',
      _description: null,
      _hidden: false,
      ...engine,
      _urlParams: Object.fromEntries(Object.entries(engine._urlParams as object)),
    }));
    expect(normalizedValue(locate, reloaded)).toEqual(canonical);
  });

  it.each<Record<string, SettingsValue>>([
    { _urlTemplate: 'javascript:alert(1)' },
    { _urlTemplate: 'https://example.test/', _iconSourceURI: 'https://example.test/icon.png' },
    { _urlTemplate: 'https://example.test/', initWithXML: 'execute()' },
    { _urlTemplate: 'https://example.test/', _method: 'DELETE' },
    { _urlTemplate: 'https://example.test/', _urlParams: ['not-an-object'] },
  ])('admits only data-only portable engines: %j', (engine) => {
    expect(validFieldState(locate, set([engine]))).toBe(false);
    expect(() => normalizeTransferFieldState(locate, set([engine]))).toThrow(SettingsSnapshotError);
  });
});

describe('AI transfer canonical policy', () => {
  it('uses generation configuration normalization and the identical credential endpoint identity', () => {
    const incoming = {
      ...config,
      endpoint: 'HTTPS://EXAMPLE.TEST:443/v1/../v1/',
      model: ' model-one ',
    };
    const encoded = normalizedValue(ai, JSON.stringify(incoming));
    expect(typeof encoded).toBe('string');
    const imported = JSON.parse(encoded as string);
    expect(imported).toEqual(normalizeAIConfiguration(incoming));
    expect(imported).toEqual(config);
    expect(parseAIConfiguration(JSON.parse(encoded as string))).toEqual(imported);
    expect(normalizeAIEndpoint(incoming.endpoint)).toBe(imported.endpoint);
    expect(credential(normalizeAIEndpoint(incoming.endpoint)).key).toBe(
      `secret:ai:${imported.endpoint}`,
    );
    expect(normalizedValue(ai, encoded)).toBe(encoded);
  });

  it('migrates the persisted implicit chat API without changing AI business settings', () => {
    const { api: _api, ...legacy } = config;
    expect(JSON.parse(normalizedValue(ai, JSON.stringify(legacy)) as string)).toEqual(config);
    expect(parseAIConfiguration(legacy)).toEqual(config);
  });

  it.each([
    'http://remote.test/v1',
    'https://user:private-password@example.test/v1',
    'https://example.test/v1?',
    'https://example.test/v1#',
    'not-a-url',
  ])('rejects endpoints rejected by generation: %s', (endpoint) => {
    expect(() => normalizeAIEndpoint(endpoint)).toThrow();
    expect(validFieldState(ai, set(JSON.stringify({ ...config, endpoint })))).toBe(false);
    expect(validFieldState(credential(endpoint), set('private-key'))).toBe(false);
  });

  it.each(['http://localhost:8080/v1/', 'http://127.0.0.1/v1/', 'http://[::1]/v1/'])(
    'retains the generation service loopback exception: %s',
    (endpoint) => {
      const value = normalizedValue(ai, JSON.stringify({ ...config, endpoint }));
      expect(JSON.parse(value as string).endpoint).toBe(normalizeAIEndpoint(endpoint));
    },
  );

  it.each(['', '   ', 'private-key\n', '\rprivate-key', 'p'.repeat(8193), ` ${'p'.repeat(8192)}`])(
    'rejects invalid credentials before admission without disclosing them',
    (value) => {
      const field = credential(config.endpoint);
      expect(() => normalizeAICredential(value)).toThrow();
      expect(validFieldState(field, set(value))).toBe(false);
      expect(() => normalizeTransferFieldState(field, set(value))).toThrow(
        'Setting value does not match its field policy.',
      );
    },
  );

  it('preserves the raw credential limit and applies the same trim as configure()', () => {
    const field = credential(config.endpoint);
    expect(normalizedValue(field, '  private-key  ')).toBe(
      normalizeAICredential('  private-key  '),
    );
    expect(normalizedValue(field, 'p'.repeat(8192))).toBe('p'.repeat(8192));
    expect(validFieldState(field, set(false))).toBe(false);
  });

  it('rejects unsupported API and extra configuration properties instead of silently dropping data', () => {
    for (const value of [
      { ...config, api: 'unknown' },
      { ...config, apiKey: 'private-key' },
      { ...config, maxOutputTokens: 0 },
      { ...config, model: ' ' },
    ]) {
      expect(validFieldState(ai, set(JSON.stringify(value)))).toBe(false);
    }
  });
});

describe('numeric preference policy', () => {
  it('admits only integers representable by the native signed32 preference API', () => {
    const field = preference('backup.interval');
    for (const value of [-2_147_483_648, 0, 2_147_483_647]) {
      expect(validFieldState(field, set(value))).toBe(true);
    }
    for (const value of [-2_147_483_649, 2_147_483_648, 4_294_967_296, 0.5, NaN, Infinity]) {
      expect(validFieldState(field, set(value))).toBe(false);
      expect(() => normalizeTransferFieldState(field, set(value))).toThrow(SettingsSnapshotError);
    }
  });

  it.each(['browserRequest.onLoadTimeout', 'browserRequest.timeout'])(
    'includes %s with nonnegative signed32 millisecond validation',
    (key) => {
      const field = preference(key);
      expect(NATIVE_PREFERENCE_FIELDS.filter((candidate) => candidate.key === key)).toHaveLength(1);
      for (const value of [0, 3000, 60000, 2_147_483_647]) {
        expect(validFieldState(field, set(value))).toBe(true);
      }
      for (const value of [-1, 0.5, 2_147_483_648, '3000']) {
        expect(validFieldState(field, set(value))).toBe(false);
      }
    },
  );

  it('retains field semantic bounds as well as storage bounds', () => {
    for (const spec of [
      ...Object.values(READER_SCROLL_NUMBER_SPECS),
      ...Object.values(KEY_GUIDE_NUMBER_SPECS),
    ]) {
      const field = preference(spec.key, NEO_PREFERENCE_FIELDS);
      expect(validFieldState(field, set(spec.minimum))).toBe(true);
      expect(validFieldState(field, set(spec.maximum))).toBe(true);
      expect(validFieldState(field, set(spec.minimum - 1))).toBe(false);
      expect(validFieldState(field, set(spec.maximum + 1))).toBe(false);
    }
    const theme = preference('pref:browser.theme.toolbar-theme');
    expect(validFieldState(theme, set(2))).toBe(true);
    expect(validFieldState(theme, set(3))).toBe(false);
  });
});

describe('Quick Copy site canonical representation', () => {
  const sites = nativeResourceField('quickCopy:sites')!;
  it('normalizes row order without mutating the imported data', () => {
    const rows = Object.freeze([
      Object.freeze({ domainPath: 'z.example/', format: 'bibliography=z-style' }),
      Object.freeze({ domainPath: 'a.example/', format: 'bibliography=a-style' }),
    ]);
    const canonical = normalizedValue(sites, rows);
    expect(canonical).toEqual([rows[1], rows[0]]);
    expect(rows[0].domainPath).toBe('z.example/');
    expect(normalizedValue(sites, canonical)).toEqual(canonical);
  });
  it('rejects duplicate domain paths rather than changing an upserted format implicitly', () => {
    const rows = [
      { domainPath: 'example/', format: 'bibliography=one' },
      { domainPath: 'example/', format: 'bibliography=two' },
    ];
    expect(validFieldState(sites, set(rows))).toBe(false);
    expect(() => normalizeTransferFieldState(sites, set(rows))).toThrow(SettingsSnapshotError);
  });
});

it('preserves reset as reset rather than materializing defaults or a credential', () => {
  const reset: SettingState = Object.freeze({ kind: 'reset' });
  for (const field of [
    locate,
    ai,
    credential(config.endpoint),
    preference('browserRequest.timeout'),
  ]) {
    expect(normalizeTransferFieldState(field, reset)).toBe(reset);
    expect(validFieldState(field, reset)).toBe(true);
  }
});

describe('item attribute schema transfer admission', () => {
  const preferenceKey = `extensions.zotero-neo.${ITEM_ATTRIBUTE_PREFERENCE}`;
  const schema = (...keys: string[]) =>
    JSON.stringify({
      version: 1,
      fields: keys.map((key, index) => ({
        id: `attribute${index}`,
        key,
        label: `Attribute ${index}`,
        type: 'text',
      })),
    });
  const context = () => ({
    signal: new AbortController().signal,
    isCurrent: () => true,
  });
  const section = (value: string) => ({
    adapterID: 'zotero-neo',
    schemaVersion: 1,
    sourceVersion: 'source',
    entries: [{ key: ITEM_ATTRIBUTE_PREFERENCE, state: set(value) }],
  });

  afterEach(() => vi.unstubAllGlobals());

  it('classifies every transferred definition through the native host before preference writes', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'target')[1]!;
    const incoming = schema('Research Score', '\u00c5 Score');
    const plan = await adapter.plan(section(incoming), context());
    expect(plan.issues).toEqual([]);
    expect(plan.changes).toHaveLength(1);
    expect(t.native.Utilities.Internal.extractExtraFields).toHaveBeenCalledWith(
      'Research Score: x',
    );
    expect(t.native.Utilities.Internal.extractExtraFields).toHaveBeenCalledWith('\u00c5 Score: x');
    expect(t.mutations).toEqual([]);
    const receipts = await adapter.apply(
      plan.changes.map((change) => ({ ...change, selected: true })),
      context(),
    );
    expect(receipts).toMatchObject([{ key: ITEM_ATTRIBUTE_PREFERENCE, status: 'applied' }]);
    expect(t.user.get(preferenceKey)).toBe(incoming);
  });

  it.each([
    'Title',
    'DOI',
    'Author',
    'Container Title',
    'D O I',
    'Ti_tle',
    'Cont ainer Title',
    '\u212b Score',
  ])(
    'rejects a schema containing %j without replacing the prior working definitions',
    async (key) => {
      const t = settingsSnapshotHostFixture();
      const previous = schema('Research Score');
      t.user.set(preferenceKey, previous);
      t.user.set('extensions.zotero-neo.modules.item-attributes.enabled', true);
      const adapter = createSettingsAdapters(() => 'target')[1]!;
      const plan = await adapter.plan(section(schema('Research Score', key)), context());
      expect(plan.changes).toEqual([]);
      expect(plan.issues).toMatchObject([{ code: 'invalid-field' }]);
      expect(await adapter.apply(plan.changes, context())).toEqual([]);
      expect(t.mutations).toEqual([]);
      expect(t.user.get(preferenceKey)).toBe(previous);
      expect(t.user.get('extensions.zotero-neo.modules.item-attributes.enabled')).toBe(true);
      const captured = await adapter.capture({
        ...context(),
        includeSecrets: false,
        includeLibrarySettings: false,
      });
      expect(captured.section.entries).toContainEqual({
        key: ITEM_ATTRIBUTE_PREFERENCE,
        state: set(previous),
      });
    },
  );

  it.each(['extractor', 'inventory'])(
    'fails closed before any preference mutation when the native %s is unavailable',
    async (capability) => {
      const t = settingsSnapshotHostFixture();
      const previous = schema('Research Score');
      t.user.set(preferenceKey, previous);
      if (capability === 'extractor')
        Reflect.deleteProperty(t.native.Utilities.Internal, 'extractExtraFields');
      else Reflect.deleteProperty(t.native.ItemFields, 'getAll');
      const adapter = createSettingsAdapters(() => 'target')[1]!;
      const plan = await adapter.plan(section(schema('Research Score', 'Custom Label')), context());
      expect(plan.changes).toEqual([]);
      expect(plan.issues).toMatchObject([{ code: 'invalid-field' }]);
      expect(await adapter.apply(plan.changes, context())).toEqual([]);
      expect(t.user.get(preferenceKey)).toBe(previous);
      expect(t.mutations).toEqual([]);
    },
  );
});
