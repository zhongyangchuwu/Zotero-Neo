import { describe, expect, it, vi } from 'vitest';
import { ModuleHost, type ModuleScope } from '../../src/core/module-host';

function logger() {
  return { debug: vi.fn(), diagnostic: vi.fn() };
}

describe('module contribution lifetimes', () => {
  it('rejects a conflicting context/action without stealing a live contribution', () => {
    const host = new ModuleHost(logger(), () => true);
    const selected = { main: '', reader: '' };
    const main = host.activate('library', (scope) =>
      host.bind<string>(scope, 'main-normal', 'openSearch', (query) => {
        selected.main = query;
      }),
    );
    expect(() =>
      host.activate('conflict', (scope) =>
        host.bind<string>(scope, 'main-normal', 'openSearch', () => {
          selected.main = 'wrong';
        }),
      ),
    ).toThrow();
    const reader = host.activate('reader', (scope) =>
      host.bind<string>(scope, 'reader-normal', 'openSearch', (query) => {
        selected.reader = query;
      }),
    );
    main('library query');
    reader('PDF query');
    expect(selected).toEqual({ main: 'library query', reader: 'PDF query' });
  });

  it('rolls back failed activation and fences its callbacks after the same ID is reused', () => {
    const host = new ModuleHost(logger(), () => true);
    const original = new Error('activation failed');
    let stale!: (value: string) => boolean;
    let oldScope!: ModuleScope;
    const selection = { value: '' };
    const resources = new Set(['old overlay']);
    expect(() =>
      host.activate('tags', (scope) => {
        oldScope = scope;
        scope.add(() => resources.delete('old overlay'));
        stale = host.bind<string>(scope, 'main-normal', 'addTag', (value) => {
          selection.value = value;
        });
        throw original;
      }),
    ).toThrow(original);
    const active = host.activate('tags', (scope) =>
      host.bind<string>(scope, 'main-normal', 'addTag', (value) => {
        selection.value = value;
      }),
    );
    expect(resources.size).toBe(0);
    expect(stale('stale target')).toBe(false);
    expect(active('current target')).toBe(true);
    expect(selection.value).toBe('current target');
    expect(() => host.bind(oldScope, 'reader-normal', 'addTag', () => undefined)).toThrow();
  });

  it('preserves the activation error while releasing every partially acquired resource', () => {
    const log = logger();
    const host = new ModuleHost(log, () => true);
    const original = new Error('cannot attach');
    const releaseError = new Error('cannot restore patch');
    const resources = new Set(['listener', 'overlay']);
    expect(() =>
      host.activate('broken', (scope) => {
        scope.add(() => resources.delete('listener'));
        scope.add(() => {
          throw releaseError;
        });
        scope.add(() => resources.delete('overlay'));
        throw original;
      }),
    ).toThrow(original);
    expect(resources.size).toBe(0);
    expect(log.diagnostic.mock.calls.flat().join('\n')).toContain('cannot restore patch');
  });

  it('retires all modules before cleanup re-enters another module and still finishes releases', () => {
    const host = new ModuleHost(logger(), () => true);
    let invokeOther!: (value: string) => boolean;
    const state = { filter: 'original' };
    const resources = new Set(['first', 'second']);
    const original = new Error('cleanup failed');
    host.activate('first', (scope) => {
      scope.add(() => resources.delete('first'));
      scope.add(() => {
        invokeOther('retired write');
        throw original;
      });
    });
    host.activate('second', (scope) => {
      scope.add(() => resources.delete('second'));
      invokeOther = host.bind<string>(scope, 'main-normal', 'toggleTagFilter', (value) => {
        state.filter = value;
      });
    });
    expect(() => host.dispose()).toThrow(original);
    expect(state.filter).toBe('original');
    expect(resources.size).toBe(0);
    expect(invokeOther('later write')).toBe(false);
    host.dispose();
    expect(() => host.activate('late', () => undefined)).toThrow();
  });

  it('keeps identical contributions isolated between physical host lifetimes', () => {
    let firstCurrent = true;
    const first = new ModuleHost(logger(), () => firstCurrent);
    const second = new ModuleHost(logger(), () => true);
    const values = { first: '', second: '' };
    const setFirst = first.activate('tags', (scope) =>
      first.bind<string>(scope, 'main-normal', 'addTag', (value) => {
        values.first = value;
      }),
    );
    const setSecond = second.activate('tags', (scope) =>
      second.bind<string>(scope, 'main-normal', 'addTag', (value) => {
        values.second = value;
      }),
    );
    firstCurrent = false;
    expect(setFirst('closed window')).toBe(false);
    first.dispose();
    expect(setSecond('live window')).toBe(true);
    expect(values).toEqual({ first: '', second: 'live window' });
  });

  it('releases acquisitions once, including resources acquired after retirement', () => {
    const host = new ModuleHost(logger(), () => true);
    const resources = new Set(['owned']);
    let scope!: ModuleScope;
    let releases = 0;
    const release = host.activate('tags', (attached) => {
      scope = attached;
      return attached.add(() => {
        releases += 1;
        resources.delete('owned');
      });
    });
    release();
    host.dispose();
    release();
    resources.add('late');
    scope.add(() => resources.delete('late'));
    expect(resources.size).toBe(0);
    expect(releases).toBe(1);
  });
});
