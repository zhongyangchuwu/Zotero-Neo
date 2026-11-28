import { describe, expect, it } from 'vitest';
import {
  nativeResourceField,
  normalizeTransferFieldState,
  validFieldState,
  type TransferField,
} from '../../src/settings-snapshots/adapters/fields';
import { NATIVE_PREFERENCE_FIELDS } from '../../src/settings-snapshots/templates/zotero';
import { NEO_PREFERENCE_FIELDS } from '../../src/settings-snapshots/templates/zotero-neo';
import type { SettingState, SettingsValue } from '../../src/settings-snapshots/contracts';
import { SettingsSnapshotError } from '../../src/settings-snapshots/contracts';
import { READER_SCROLL_NUMBER_SPECS, KEY_GUIDE_NUMBER_SPECS } from '../../src/core/preferences';

const set = (value: SettingsValue): SettingState => ({ kind: 'set', value });
function preference(key: string, fields = NATIVE_PREFERENCE_FIELDS): TransferField {
  const field = fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Missing test field: ${key}`);
  return field;
}
const locate = nativeResourceField('locate:engines')!;

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

it('preserves reset as reset rather than materializing defaults', () => {
  const reset: SettingState = Object.freeze({ kind: 'reset' });
  for (const field of [locate, preference('browserRequest.timeout')]) {
    expect(normalizeTransferFieldState(field, reset)).toBe(reset);
    expect(validFieldState(field, reset)).toBe(true);
  }
});
