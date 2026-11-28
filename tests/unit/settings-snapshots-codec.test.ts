import { build } from 'esbuild';
import { Worker as NodeWorker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Encrypter, Decrypter, armor } from '../../vendor/age-encryption/index.js';
import { createSettingsFileCodec } from '../../src/settings-snapshots/codec';
import { MAX_SETTINGS_BYTES } from '../../src/settings-snapshots/document';
import { MAX_SETTINGS_ARMORED_BYTES } from '../../src/settings-snapshots/crypto-protocol';
import type {
  SettingsCryptoContext,
  SettingsDocument,
  SettingsFileCodec,
} from '../../src/settings-snapshots/contracts';

let workerSource: string;
const workers: ThreadWorker[] = [];
const codecs: SettingsFileCodec[] = [];
const terminated: Promise<number>[] = [];
const password = 'test-only-unicode-🔐-passphrase';
const document: SettingsDocument = {
  format: 'zotero-neo-settings',
  schemaVersion: 1,
  createdAt: '2026-11-17T00:00:00.000Z',
  producer: { name: 'Zotero Neo', version: 'test' },
  zoteroVersion: '8',
  sections: [
    {
      adapterID: 'zotero-neo',
      schemaVersion: 1,
      sourceVersion: 'test',
      entries: [
        { key: 'unicode', state: { kind: 'set', value: '中文 café 🦉' } },
        { key: 'false', state: { kind: 'set', value: false } },
        { key: 'zero', state: { kind: 'set', value: 0 } },
        { key: 'empty', state: { kind: 'set', value: '' } },
        { key: 'reset', state: { kind: 'reset' } },
      ],
    },
  ],
};

const publicExtension = {
  addonId: 'public@test',
  name: 'Public extension',
  version: '2',
  enabled: true,
  source: { kind: 'xpi' as const, url: 'https://downloads.example.org/public.xpi' },
};
const manualExtension = {
  addonId: 'manual@test',
  name: 'Manual extension',
  version: '1',
  enabled: false,
  source: null,
  sensitiveKeys: ['apiToken'],
};
const workspace: SettingsDocument = {
  ...document,
  extensions: {
    version: 1,
    addons: [
      publicExtension,
      {
        ...manualExtension,
        source: {
          kind: 'xpi',
          url: 'https://private.example.org/private.xpi?signature=url-secret',
        },
      },
    ],
  },
};
const portableWorkspace: SettingsDocument = {
  ...document,
  extensions: { version: 1, addons: [manualExtension, publicExtension] },
};

// Only the OS Worker boundary is adapted. Production classic worker code and
// the actual vendored age implementation run in a separate native Node thread.
class ThreadWorker {
  readonly native: NodeWorker;
  readonly started: Promise<void>;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: Event) => void) | null = null;
  retired = false;
  constructor(url: string, randomAvailable = true) {
    if (url.startsWith('jar:'))
      throw new DOMException('Direct archive workers are not permitted', 'SecurityError');
    this.native = new NodeWorker(
      `
      const { parentPort } = require('node:worker_threads');
      ${
        randomAvailable
          ? "globalThis.crypto ??= require('node:crypto').webcrypto;"
          : "Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });"
      }
      globalThis.postMessage = value => parentPort.postMessage(value);
      ${workerSource}
      parentPort.on('message', data => {
        parentPort.postMessage({ boundary: 'started' });
        globalThis.onmessage({ data });
      });
    `,
      { eval: true },
    );
    let markStarted!: () => void;
    this.started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    this.native.on('message', (data: unknown) => {
      if (data && typeof data === 'object' && 'boundary' in data) markStarted();
      else this.onmessage?.(new MessageEvent('message', { data }));
    });
    this.native.on('error', () => this.onerror?.(new Event('error', { cancelable: true })));
    this.native.on('messageerror', () => this.onmessageerror?.(new Event('messageerror')));
    workers.push(this);
  }
  postMessage(value: unknown): void {
    this.native.postMessage(value);
  }
  terminate(): void {
    this.retired = true;
    terminated.push(this.native.terminate());
  }
}
function operation() {
  const controller = new AbortController();
  const owner = Object.assign(new EventTarget(), {
    Worker: ThreadWorker,
    setInterval,
    clearInterval,
  });
  const context: SettingsCryptoContext = {
    window: owner as unknown as Window,
    signal: controller.signal,
    isCurrent: () => true,
  };
  return { context, controller, owner };
}
function codec() {
  const result = createSettingsFileCodec();
  codecs.push(result);
  return result;
}
async function encryptFixture(text: string): Promise<string> {
  const encrypter = new Encrypter();
  // Only input fixtures use a cheap factor. Consumer seal remains factor 18.
  encrypter.setScryptWorkFactor(1);
  encrypter.setPassphrase(password);
  return armor.encode(await encrypter.encrypt(text));
}

beforeAll(async () => {
  const result = await build({
    entryPoints: ['src/settings-snapshots/crypto-worker.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'firefox115',
  });
  workerSource = result.outputFiles[0]!.text;
});
afterEach(async () => {
  for (const instance of codecs.splice(0)) instance.dispose();
  expect(workers.every((worker) => worker.retired)).toBe(true);
  workers.length = 0;
  await Promise.all(terminated.splice(0));
});

it('round-trips plaintext snapshots without a password or DOM worker and still validates their schema', async () => {
  const files = codec();
  const context: SettingsCryptoContext = {
    window: {} as Window,
    signal: new AbortController().signal,
    isCurrent: () => true,
    container: 'json',
  };
  const text = await files.seal(document, '', context, 'json');
  expect(JSON.parse(text)).toEqual(document);
  expect(await files.open(text, '', context)).toEqual(document);
  await expect(
    files.open(JSON.stringify({ ...document, schemaVersion: 2 }), '', context),
  ).rejects.toMatchObject({ code: 'unsupported-schema' });
  await expect(files.open('not a snapshot', '', context)).rejects.toMatchObject({
    code: 'invalid-file',
  });
  files.dispose();
  await expect(files.open(text, '', context)).rejects.toMatchObject({ code: 'cancelled' });
  await expect(files.seal(document, '', context, 'json')).rejects.toMatchObject({
    code: 'cancelled',
  });
});

it.each(['json', 'age'] as const)(
  'opens old %s backups without carrying retired Neo settings into the workspace',
  async (container) => {
    const files = codec();
    const { context } = operation();
    const definitions = [
      JSON.stringify({
        version: 1,
        fields: [{ id: 'score', key: 'Research Score', label: 'Score', type: 'text' }],
      }),
      JSON.stringify({
        version: 2,
        fields: [
          {
            id: 'stage',
            key: 'Research Stage',
            label: 'Stage',
            type: 'single-select',
            options: [{ id: 'in-progress', label: 'In progress' }],
          },
        ],
      }),
    ];
    const open = async (fixture: unknown) => {
      const text = JSON.stringify(fixture);
      return container === 'age'
        ? files.open(await encryptFixture(text), password, context)
        : files.open(text, '', context);
    };
    const neo = portableWorkspace.sections[0]!;
    for (const value of definitions) {
      const legacy = {
        ...portableWorkspace,
        sections: [
          {
            ...neo,
            entries: [
              ...neo.entries,
              { key: 'itemAttributes.fields.v1', state: { kind: 'set', value } },
              { key: 'modules.item-attributes.enabled', state: { kind: 'set', value: true } },
            ],
          },
        ],
      };
      expect(await open(legacy)).toEqual(portableWorkspace);
    }

    const unsupported = {
      ...portableWorkspace,
      itemAttributes: { version: 99, definitions: null },
      sections: [
        { adapterID: 'itemAttributes', schemaVersion: 99, entries: null },
        { adapterID: 'reader-ai', schemaVersion: 99, entries: null },
        {
          ...neo,
          entries: [
            ...neo.entries,
            { key: 'itemAttributes.fields.v1', state: { kind: 'unknown-operation' } },
            { key: 'extensions.zotero-neo.modules.translation.enabled', state: null },
            { key: 'modules.reader-ai.enabled' },
            { key: 'pdf-translate.mode', state: null },
            { key: 'extensions.zotero-neo.reader-ai.provider', state: null },
            { key: 'ai.configuration', state: { kind: 'unknown-operation' } },
            { key: 'secret:ai:not-an-endpoint', state: { kind: 'unknown-operation' } },
          ],
        },
      ],
    };
    expect(await open(unsupported)).toEqual(portableWorkspace);
    await expect(
      open({
        ...unsupported,
        sections: [...unsupported.sections, { ...neo, adapterID: 'zotero', entries: null }],
      }),
    ).rejects.toMatchObject({ code: 'invalid-file' });
  },
);

it('round-trips a version 1 workspace, sanitizing unavailable sources without losing settings', async () => {
  const files = codec();
  const { context } = operation();
  const text = await files.seal(workspace, '', context, 'json');
  expect(text).not.toContain('url-secret');
  expect(await files.open(text, '', context)).toEqual(portableWorkspace);
  expect(await files.open(JSON.stringify(workspace), '', context)).toEqual(portableWorkspace);

  const invalidSources = [
    { kind: 'xpi', url: 'https://user:url-secret@downloads.example.org/add-on.xpi' },
    { kind: 'xpi', url: 'https://downloads.example.org/add-on.xpi#url-secret' },
    { kind: 'xpi', url: 'https://downloads.example.org/add-on.xpi?' },
    { kind: 'xpi', url: 'https://downloads.example.org/password/url-secret/add-on.xpi' },
    { kind: 'xpi', url: 'javascript:url-secret' },
    { kind: 'github', owner: 'https://bad-host.com/url-secret', repo: 'p' },
    { kind: 'unknown', token: 'url-secret' },
  ];
  const importText = JSON.stringify({
    ...document,
    extensions: {
      version: 1,
      addons: invalidSources.map((source, i) => ({
        ...manualExtension,
        addonId: `test${i}`,
        source,
      })),
    },
  });
  const imported = await files.open(importText, '', context);
  expect(imported.extensions?.addons.map(({ source }) => source)).toEqual(
    invalidSources.map(() => null),
  );
  expect(imported.sections).toEqual(document.sections);
  expect(await files.seal(imported, '', context, 'json')).not.toContain('url-secret');
});

it('rejects duplicate rows and oversized or unsupported inventory manifests', async () => {
  const files = codec();
  const { context } = operation();
  for (const extensions of [
    { version: 1, addons: [manualExtension, manualExtension] },
    { version: 2, addons: [] },
    {
      version: 1,
      addons: Array.from({ length: 1025 }, (_, i) => ({ ...manualExtension, addonId: `test${i}` })),
    },
    {
      version: 1,
      addons: [{ ...manualExtension, sensitiveKeys: [{ key: 'apiToken', value: 'secret' }] }],
    },
  ]) {
    await expect(
      files.open(JSON.stringify({ ...document, extensions }), '', context),
    ).rejects.toMatchObject({ code: 'invalid-file' });
  }
});

describe('password-encrypted settings files', () => {
  it('round-trips settings and scrubs signed provenance from the encrypted plaintext', async () => {
    const files = codec();
    const sealed = await files.seal(workspace, password, operation().context);
    expect(sealed).toMatch(/^-----BEGIN AGE ENCRYPTED FILE-----\n/u);
    expect(sealed).not.toContain('中文');
    const binary = armor.decode(sealed);
    expect(new TextDecoder().decode(binary.subarray(0, 100))).toMatch(/-> scrypt \S+ 18\n/u);
    const independent = new Decrypter();
    independent.addPassphrase(password);
    const plaintext = new TextDecoder().decode(await independent.decrypt(binary));
    expect(plaintext).not.toContain('url-secret');
    expect(JSON.parse(plaintext)).toEqual(portableWorkspace);
    expect(await files.open(sealed, password, operation().context)).toEqual(portableWorkspace);
  }, 60_000);

  it('reads official armored age produced outside the codec, including CRLF', async () => {
    const sealed = await encryptFixture(JSON.stringify(document));
    expect(
      await codec().open(sealed.replaceAll('\n', '\r\n'), password, operation().context),
    ).toEqual(document);
  });

  it('rejects wrong passwords, header or payload tampering and truncation without delivering data or secrets', async () => {
    const files = codec();
    const sealed = await encryptFixture(JSON.stringify(document));
    const binary = armor.decode(sealed);
    const tampered = binary.slice();
    tampered[tampered.length - 1]! ^= 1;
    const headerTampered = binary.slice();
    const mac = new TextDecoder().decode(binary.subarray(0, 160)).indexOf('--- ');
    headerTampered[mac + 4] = headerTampered[mac + 4] === 65 ? 66 : 65;
    for (const [ciphertext, secret] of [
      [sealed, 'wrong-private-password'],
      [armor.encode(tampered), password],
      [armor.encode(headerTampered), password],
      [armor.encode(binary.subarray(0, binary.length - 1)), password],
      [sealed.slice(0, -20), password],
    ]) {
      const failure = await files
        .open(ciphertext!, secret!, operation().context)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: 'crypto-failed' });
      expect(String(failure)).not.toContain(secret);
      expect(String(failure)).not.toContain('中文');
    }
  });

  it('authenticates the entire multi-chunk file before schema parsing or result delivery', async () => {
    const unsupported = JSON.stringify({
      ...document,
      schemaVersion: 2,
      padding: 'x'.repeat(150_000),
    });
    const sealed = await encryptFixture(unsupported);
    const files = codec();
    await expect(files.open(sealed, password, operation().context)).rejects.toMatchObject({
      code: 'unsupported-schema',
    });
    const binary = armor.decode(sealed);
    binary[binary.length - 1]! ^= 1;
    await expect(
      files.open(armor.encode(binary), password, operation().context),
    ).rejects.toMatchObject({ code: 'crypto-failed' });
    const intact = armor.decode(sealed);
    // Removing a complete final STREAM chunk must not release earlier JSON.
    await expect(
      files.open(
        armor.encode(intact.subarray(0, intact.length - 20_000)),
        password,
        operation().context,
      ),
    ).rejects.toMatchObject({ code: 'crypto-failed' });
  });

  it('rejects authenticated invalid JSON and non-UTF8 plaintext', async () => {
    await expect(
      codec().open(await encryptFixture('not JSON'), password, operation().context),
    ).rejects.toMatchObject({ code: 'invalid-file' });
    const encrypter = new Encrypter();
    encrypter.setScryptWorkFactor(1);
    encrypter.setPassphrase(password);
    const invalidUTF8 = armor.encode(await encrypter.encrypt(new Uint8Array([0xc0, 0xaf])));
    await expect(codec().open(invalidUTF8, password, operation().context)).rejects.toMatchObject({
      code: 'crypto-failed',
    });
  });

  it.each(['19', '20', '99', '9999999999999999999999999999999'])(
    'refuses hostile scrypt factor %s before allocating its KDF',
    async (factor) => {
      // Only the public header is forged. Real armor and the real age header
      // parser run; a wrong password must not turn this into a KDF attempt.
      const header = `age-encryption.org/v1\n-> scrypt AAAAAAAAAAAAAAAAAAAAAA ${factor}\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n`;
      await expect(
        codec().open(armor.encode(new TextEncoder().encode(header)), password, operation().context),
      ).rejects.toMatchObject({ code: 'kdf-limit' });
    },
  );

  it('does not enable arbitrary recipients, passkeys or file-supplied plugins', async () => {
    const header =
      'age-encryption.org/v1\n-> plugin arbitrary-code\nAA\n--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n';
    await expect(
      codec().open(armor.encode(new TextEncoder().encode(header)), password, operation().context),
    ).rejects.toMatchObject({ code: 'invalid-file' });
  });
  it('rejects oversized unauthenticated headers before expanding their stanza list', async () => {
    const header = `age-encryption.org/v1\n${'-> plugin\nAA\n'.repeat(4000)}--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n`;
    await expect(
      codec().open(armor.encode(new TextEncoder().encode(header)), password, operation().context),
    ).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('bounds armored input before dispatch and UTF-8 JSON before encryption', async () => {
    const files = codec();
    await expect(
      files.open('x'.repeat(MAX_SETTINGS_ARMORED_BYTES + 1), password, operation().context),
    ).rejects.toMatchObject({ code: 'resource-limit' });
    expect(workers).toHaveLength(0);
    const large: SettingsDocument = {
      ...document,
      sections: [
        {
          adapterID: 'zotero-neo',
          schemaVersion: 1,
          sourceVersion: 'test',
          entries: Array.from({ length: 17 }, (_, index) => ({
            key: String(index),
            state: { kind: 'set' as const, value: 'é'.repeat(1024 * 1024) },
          })),
        },
      ],
    };
    // Code-unit count is below the 32MiB limit, UTF-8 byte count is above it.
    expect(JSON.stringify(large).length).toBeLessThan(MAX_SETTINGS_BYTES);
    await expect(files.seal(large, password, operation().context)).rejects.toMatchObject({
      code: 'resource-limit',
    });
    await expect(files.seal(large, '', operation().context, 'json')).rejects.toMatchObject({
      code: 'resource-limit',
    });
  });

  it('rejects oversized authenticated plaintext before JSON parsing', async () => {
    const sealed = await encryptFixture(' '.repeat(MAX_SETTINGS_BYTES + 1));
    await expect(codec().open(sealed, password, operation().context)).rejects.toMatchObject({
      code: 'resource-limit',
    });
  }, 30_000);

  it('fails closed when the owner has no worker constructor or the password is empty', async () => {
    const context = operation().context;
    const withoutWorker = {
      ...context,
      window: Object.assign(new EventTarget(), { setInterval, clearInterval }) as unknown as Window,
    };
    await expect(codec().seal(document, password, withoutWorker)).rejects.toMatchObject({
      code: 'crypto-unavailable',
    });
    await expect(codec().seal(document, '', context)).rejects.toMatchObject({
      code: 'invalid-password',
    });
    expect(workers).toHaveLength(0);
  });

  it('never falls back to insecure randomness when the worker has no CSPRNG', async () => {
    class NoRandomWorker extends ThreadWorker {
      constructor(url: string) {
        super(url, false);
      }
    }
    const { context, owner } = operation();
    owner.Worker = NoRandomWorker;
    await expect(codec().seal(document, password, context)).rejects.toMatchObject({
      code: 'crypto-unavailable',
    });
  });

  it('rejects pre-cancelled jobs without worker dispatch', async () => {
    const { context, controller } = operation();
    controller.abort();
    await expect(codec().seal(document, password, context)).rejects.toMatchObject({
      code: 'cancelled',
    });
    await expect(
      codec().seal(document, password, { ...operation().context, isCurrent: () => false }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers).toHaveLength(0);
  });

  it.each(['abort', 'stale', 'dispose', 'unload'] as const)(
    'terminates a running real crypto job on %s',
    async (reason) => {
      const files = codec();
      const { context, controller, owner } = operation();
      let current = true;
      const pending = files.seal(document, password, { ...context, isCurrent: () => current });
      const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      const worker = workers.at(-1)!;
      await worker.started;
      if (reason === 'abort') controller.abort();
      else if (reason === 'stale') current = false;
      else if (reason === 'dispose') files.dispose();
      else owner.dispatchEvent(new Event('unload'));
      await rejected;
      expect(worker.retired).toBe(true);
      // A late delivery cannot resurrect an aborted job.
      await delay(1);
      expect(worker.onmessage).toBeNull();
      if (reason === 'dispose') {
        await expect(files.seal(document, password, operation().context)).rejects.toMatchObject({
          code: 'cancelled',
        });
      }
    },
  );

  it('retires a superseded operation before admitting the next expensive job', async () => {
    const files = codec();
    const first = files.seal(document, password, operation().context);
    const rejected = expect(first).rejects.toMatchObject({ code: 'cancelled' });
    await workers.at(-1)!.started;
    const replacement = operation();
    const next = files.seal(document, password, replacement.context);
    const nextRejected = expect(next).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers[0]!.retired).toBe(true);
    replacement.controller.abort();
    await Promise.all([rejected, nextRejected]);
  });
});
