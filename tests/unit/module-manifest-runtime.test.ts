import { describe, expect, it, vi } from 'vitest';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceReader } from '../../src/core/preferences';
import { validateBuiltinModules, type BuiltinModuleDescriptor } from '../../src/modules';

function setup(initial: Record<string, boolean> = {}) {
  const values = new Map(Object.entries(initial));
  const preferences = {
    get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
  } as PreferenceReader;
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  return { values, logger, runtime: new BuiltinModuleRuntime(preferences, logger) };
}

function descriptor(
  id: BuiltinModuleDescriptor['id'],
  requires: BuiltinModuleDescriptor['requires'] = [],
): BuiltinModuleDescriptor {
  return {
    id,
    names: { en: id, 'zh-CN': id },
    hosts: ['main'],
    scopes: [],
    requires,
    optional: [],
    contributions: [],
    selectionActions: [],
    ui: [],
  };
}

describe('static module ownership', () => {
  it('rejects duplicate modules, missing hard and optional references, cycles and exact-context conflicts', () => {
    const library = descriptor('library');
    expect(() => validateBuiltinModules([library, library])).toThrow(/duplicate/i);
    expect(() => validateBuiltinModules([descriptor('library', ['notes'])])).toThrow(/missing/i);
    expect(() => validateBuiltinModules([{ ...library, optional: ['notes'] }])).toThrow(/missing/i);
    expect(() =>
      validateBuiltinModules([descriptor('library', ['notes']), descriptor('notes', ['library'])]),
    ).toThrow(/cycle/i);
    const contribution = {
      host: 'main' as const,
      context: 'main-normal' as const,
      actions: ['openSearch' as const],
    };
    expect(() =>
      validateBuiltinModules([
        { ...library, contributions: [contribution] },
        { ...descriptor('notes'), contributions: [contribution] },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      validateBuiltinModules([
        { ...library, contributions: [contribution] },
        { ...descriptor('notes'), contributions: [{ ...contribution, context: 'reader-normal' }] },
      ]),
    ).not.toThrow();
  });
});

describe('module runtime lifecycle', () => {
  it('does not call disabled factories and freezes applied flags', () => {
    const { runtime, values } = setup({ [modulePreferenceKey('notes')]: false });
    const main = runtime.createScope('main', {}, () => true);
    const factory = vi.fn();
    expect(main.activate('notes', factory)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    values.set(modulePreferenceKey('notes'), true);
    expect(runtime.requested().notes).toBe(true);
    expect(runtime.applied.notes).toBe(false);
    expect(main.canActivate('notes')).toBe(false);
    main.dispose();
  });

  it('isolates failures, rolls back real host resources and never retries a failed factory', () => {
    const { runtime } = setup();
    const first = runtime.createScope('main', {}, () => true);
    const second = runtime.createScope('main', {}, () => true);
    const cleanup = vi.fn();
    const failed = vi.fn(() =>
      first.host.activate('tags', (scope) => {
        scope.add(cleanup);
        first.host.bind(scope, 'main-normal', 'addTag', () => {});
        throw new Error('broken tags');
      }),
    );
    expect(first.activate('tags', failed)).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(first.host.hasAction('main-normal', 'addTag')).toBe(false);
    expect(first.state('tags').status).toBe('failed');
    expect(first.activate('tags', failed)).toBeNull();
    expect(failed).toHaveBeenCalledOnce();
    expect(
      second.activate('tags', () =>
        second.host.activate('tags', (scope) =>
          second.host.bind(scope, 'main-normal', 'addTag', () => {}),
        ),
      ),
    ).not.toBeNull();
    expect(second.available('main-normal', 'addTag')).toBe(true);
    expect(first.available('main-normal', 'addTag')).toBe(false);
    first.dispose();
    expect(second.available('main-normal', 'addTag')).toBe(true);
    second.dispose();
  });

  it('routes exact context through the associated host, never a different Main window', () => {
    const { runtime } = setup();
    const owner = {};
    const other = runtime.createScope('main', {}, () => true);
    const reader = runtime.createScope(
      'reader',
      {},
      () => true,
      () => owner,
    );
    other.activate('library', () =>
      other.host.activate('library', (scope) =>
        other.host.bind(scope, 'reader-normal', 'findAllItems', () => {}),
      ),
    );
    expect(reader.available('reader-normal', 'findAllItems')).toBe(false);
    const main = runtime.createScope('main', owner, () => true);
    main.activate('library', () =>
      main.host.activate('library', (scope) =>
        main.host.bind(scope, 'reader-normal', 'findAllItems', () => {}),
      ),
    );
    expect(reader.available('reader-normal', 'findAllItems')).toBe(true);
    expect(reader.available('reader-normal', 'mainYankCitekey')).toBe(false);
    main.dispose();
    expect(reader.available('reader-normal', 'findAllItems')).toBe(false);
    reader.dispose();
    other.dispose();
  });
});
