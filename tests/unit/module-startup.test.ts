import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceReader } from '../../src/core/preferences';
import { BUILTIN_MODULES, isOptionalModule } from '../../src/modules';
import { moduleStartupFlags } from '../../src/platform/module-startup';

afterEach(() => vi.unstubAllGlobals());

describe('application module startup flags', () => {
  it('keeps pending requests unapplied across Neo reloads and applies them after Zotero restarts', () => {
    const legacy = Object.fromEntries(BUILTIN_MODULES.map(({ id }) => [id, false]));
    legacy.extensions = true;
    vi.stubGlobal('Zotero', {
      [Symbol.for('zotero-neo.startup-module-flags')]: JSON.stringify(legacy),
    });
    const values = new Map<string, boolean>([
      ...BUILTIN_MODULES.filter(({ id }) => !isOptionalModule(id)).map(
        ({ id }): [string, boolean] => [`modules.${id}.enabled`, false],
      ),
      [modulePreferenceKey('reader-hints'), true],
      [modulePreferenceKey('extensions'), false],
    ]);
    const preferences = {
      get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
    } as PreferenceReader;
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const first = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    const reloaded = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(first.applied).toEqual({ 'reader-hints': false, extensions: true });
    expect(reloaded.applied).toEqual(first.applied);
    expect(reloaded.requested()).toEqual({ 'reader-hints': true, extensions: false });
    const owner = {};
    const main = reloaded.createScope('main', owner, () => true);
    const reader = reloaded.createScope(
      'reader',
      {},
      () => true,
      () => owner,
    );
    for (const { id, hosts } of BUILTIN_MODULES.filter(({ id }) => !isOptionalModule(id))) {
      for (const host of hosts) {
        const scope = host === 'main' ? main : reader;
        expect(scope.activate(id, () => ({}))).not.toBeNull();
        expect(scope.state(id).status).toBe('enabled');
      }
    }
    expect(reader.activate('reader-hints', vi.fn())).toBeNull();
    expect(main.activate('extensions', () => ({}))).not.toBeNull();
    const inspected = reloaded.inspect(owner);
    expect(
      inspected.filter(({ id }) => isOptionalModule(id)).every((state) => state.pendingRestart),
    ).toBe(true);
    expect(
      inspected.filter(({ id }) => !isOptionalModule(id)).every((state) => !state.pendingRestart),
    ).toBe(true);
    main.dispose();
    reader.dispose();
    vi.stubGlobal('Zotero', {});
    const restarted = new BuiltinModuleRuntime(
      preferences,
      logger,
      moduleStartupFlags(preferences),
    );
    expect(restarted.applied).toEqual({ 'reader-hints': true, extensions: false });
    expect(restarted.inspect({}).every((state) => !state.pendingRestart)).toBe(true);
  });
});
