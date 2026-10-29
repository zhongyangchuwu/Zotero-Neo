import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceReader } from '../../src/core/preferences';
import { moduleStartupFlags } from '../../src/platform/module-startup';

afterEach(() => vi.unstubAllGlobals());

describe('application module startup flags', () => {
  it('keeps pending requests unapplied across Neo reloads and applies them after Zotero restarts', () => {
    vi.stubGlobal('Zotero', {});
    const values = new Map<string, boolean>();
    const preferences = {
      get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
    } as PreferenceReader;
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const first = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    values.set(modulePreferenceKey('notes'), false);
    const reloaded = new BuiltinModuleRuntime(preferences, logger, moduleStartupFlags(preferences));
    expect(first.applied.notes).toBe(true);
    expect(reloaded.applied.notes).toBe(true);
    expect(reloaded.requested().notes).toBe(false);
    vi.stubGlobal('Zotero', {});
    const restarted = new BuiltinModuleRuntime(
      preferences,
      logger,
      moduleStartupFlags(preferences),
    );
    expect(restarted.applied.notes).toBe(false);
  });
});
