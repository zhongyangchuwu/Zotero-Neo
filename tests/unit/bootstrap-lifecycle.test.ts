import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(new URL('../../src/bootstrap.ts', import.meta.url), 'utf8');

async function bootstrap(reason: number) {
  const init = vi.fn();
  const writes: string[] = [];
  const sandbox: Record<string, unknown> = {
    APP_STARTUP: 1,
    ADDON_INSTALL: 5,
    Zotero: {
      version: '10.0.3',
      initializationPromise: Promise.resolve(),
      getMainWindows: () => [],
      getProfileDirectory: () => ({ clone: () => ({ append: () => {} }) }),
      debug: () => {},
    },
    Services: {
      scriptloader: {
        loadSubScript: () => {
          sandbox.ZoteroNeo = { init, addToWindow: () => {} };
        },
      },
    },
    Components: {
      classes: {
        '@mozilla.org/network/file-output-stream;1': {
          createInstance: () => ({
            init: () => {},
            write: (text: string) => writes.push(text),
            close: () => {},
          }),
        },
      },
      interfaces: { nsIFileOutputStream: {} },
    },
  };
  const source = await transform(SOURCE, { loader: 'ts', format: 'esm' });
  runInNewContext(source.code, sandbox);
  const hostContext = { id: 'neo', version: '0.1.0', rootURI: 'file:///addon/' };
  await (sandbox.startup as (context: typeof hostContext, reason: number) => Promise<void>)(
    hostContext,
    reason,
  );
  return { init, writes, hostContext };
}

describe('Bootstrap focus-claim lifecycle', () => {
  it.each([
    ['APP_STARTUP', 1, true],
    ['ADDON_INSTALL', 5, false],
    ['ADDON_ENABLE', 3, false],
    ['ADDON_UPGRADE', 7, false],
    ['other reason', 8, false],
  ] as const)(
    'passes %s reason %i to both runtime init paths with claim=%s',
    async (_name, reason, claim) => {
      const { init, writes, hostContext } = await bootstrap(reason);
      expect(init).toHaveBeenCalledTimes(2);
      expect(init).toHaveBeenNthCalledWith(1, {
        ...hostContext,
        mayClaimInitialLibraryFocus: claim,
      });
      expect(init).toHaveBeenNthCalledWith(2, {
        ...hostContext,
        mayClaimInitialLibraryFocus: claim,
      });
      expect(hostContext).toEqual({ id: 'neo', version: '0.1.0', rootURI: 'file:///addon/' });
      expect(writes.join('')).toContain(
        `startupReason=${reason} claimInitialLibraryFocus=${claim}`,
      );
    },
  );
});
