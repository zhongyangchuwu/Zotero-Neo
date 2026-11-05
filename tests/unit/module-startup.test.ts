import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceReader } from '../../src/core/preferences';
import { BUILTIN_MODULES, isOptionalModule } from '../../src/modules';
import { moduleStartupFlags } from '../../src/platform/module-startup';

afterEach(() => vi.unstubAllGlobals());

describe('application module startup flags', () => {
  it('keeps pending requests unapplied across Neo reloads and applies them after Zotero restarts', () => {
    const legacy = Object.fromEntries(BUILTIN_MODULES.map(({ id }) => [id, false]));
    delete legacy.references;
    legacy.extensions = true;
    legacy['reader-ai'] = true;
    vi.stubGlobal('Zotero', {
      [Symbol.for('zotero-neo.startup-module-flags')]: JSON.stringify(legacy),
    });
    const values = new Map<string, boolean>([
      ...BUILTIN_MODULES.filter(({ id }) => !isOptionalModule(id)).map(
        ({ id }): [string, boolean] => [`modules.${id}.enabled`, false],
      ),
      [modulePreferenceKey('reader-hints'), true],
      [modulePreferenceKey('extensions'), false],
      [modulePreferenceKey('ai-qa'), true],
    ]);
    const preferences = {
      get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
    } as PreferenceReader;
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const first = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    const reloaded = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(first.applied).toEqual({
      'reader-hints': false,
      extensions: true,
      'ai-qa': false,
      references: false,
    });
    expect(reloaded.applied).toEqual(first.applied);
    expect(reloaded.requested()).toEqual({
      'reader-hints': true,
      extensions: false,
      'ai-qa': true,
      references: true,
    });
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
    expect(reader.activate('ai-qa', vi.fn())).toBeNull();
    expect(reader.activate('references', vi.fn())).toBeNull();
    expect(reader.available('reader-normal', 'openReferences')).toBe(false);
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
    expect(restarted.applied).toEqual({
      'reader-hints': true,
      extensions: false,
      'ai-qa': true,
      references: true,
    });
    expect(restarted.inspect({}).every((state) => !state.pendingRestart)).toBe(true);
  });

  it('defaults the experiment off even when the old preference was enabled', () => {
    vi.stubGlobal('Zotero', {});
    const values: Record<string, boolean> = { 'modules.reader-ai.enabled': true };
    const preferences = {
      get: (key: string, fallback: boolean | number | string) => values[key] ?? fallback,
    } as PreferenceReader;
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const runtime = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(runtime.applied).toEqual({
      'reader-hints': true,
      extensions: true,
      'ai-qa': false,
      references: true,
    });
    expect(runtime.requested()['ai-qa']).toBe(false);
    const activate = vi.fn();
    const reader = runtime.createScope('reader', {}, () => true);
    expect(reader.activate('ai-qa', activate)).toBeNull();
    expect(reader.available('reader-normal', 'openAIQA')).toBe(false);
    expect(reader.host.hasAction('reader-normal', 'openAIQA')).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    reader.dispose();
  });

  it('applies an opt-in only after a full application restart', () => {
    vi.stubGlobal('Zotero', {});
    const values = new Map<string, boolean>();
    const preferences = {
      get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
    } as PreferenceReader;
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const first = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    values.set(modulePreferenceKey('ai-qa'), true);
    const reload = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(first.applied['ai-qa']).toBe(false);
    expect(reload.applied['ai-qa']).toBe(false);
    expect(reload.requested()['ai-qa']).toBe(true);
    vi.stubGlobal('Zotero', {});
    const restart = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(restart.applied['ai-qa']).toBe(true);
  });
});
