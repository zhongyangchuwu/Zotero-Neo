import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../../src/bootstrap.ts', import.meta.url), 'utf8');

async function bootstrap() {
  const database = Promise.withResolvers<void>();
  const migration = Promise.withResolvers<void>();
  const attached = new Set<object>();
  const window = {};
  let active = false;
  const sandbox: Record<string, unknown> = {
    APP_STARTUP: 1,
    Zotero: {
      version: '10.0.3',
      initializationPromise: database.promise,
      getMainWindows: () => [window],
      getProfileDirectory: () => ({ clone: () => ({ append: () => {} }) }),
      debug: () => {},
    },
    Services: {
      scriptloader: {
        loadSubScript: () => {
          sandbox.ZoteroNeo = {
            init: async () => {
              active = true;
              await migration.promise;
            },
            addToWindow: (window: object) => {
              if (active) attached.add(window);
            },
            shutdown: () => {
              active = false;
              attached.clear();
            },
          };
        },
      },
    },
    Components: {
      classes: {
        '@mozilla.org/network/file-output-stream;1': {
          createInstance: () => ({ init: () => {}, write: () => {}, close: () => {} }),
        },
      },
      interfaces: { nsIFileOutputStream: {} },
    },
  };
  const source = await transform(SOURCE, { loader: 'ts', format: 'esm' });
  runInNewContext(source.code, sandbox);
  const hostContext = { id: 'neo', version: '0.1.0', rootURI: 'file:///addon/' };
  const startup = (
    sandbox.startup as (context: typeof hostContext, reason: number) => Promise<void>
  )(hostContext, 1);
  return {
    database,
    migration,
    attached,
    window,
    startup,
    shutdown: sandbox.shutdown as () => void,
  };
}

describe('Bootstrap with asynchronous data migration', () => {
  it('attaches the early Main window before database readiness without finishing startup before migration', async () => {
    const h = await bootstrap();
    expect(h.attached.has(h.window)).toBe(true);
    let ready = false;
    void h.startup.then(() => {
      ready = true;
    });
    h.database.resolve();
    await Promise.resolve();
    expect(ready).toBe(false);
    h.migration.resolve();
    await h.startup;
    expect(ready).toBe(true);
    expect(h.attached.has(h.window)).toBe(true);
  });

  it('does not revive a shut-down controller when its migration finishes late', async () => {
    const h = await bootstrap();
    h.database.resolve();
    h.shutdown();
    h.migration.resolve();
    await h.startup;
    expect(h.attached.has(h.window)).toBe(false);
  });
});
