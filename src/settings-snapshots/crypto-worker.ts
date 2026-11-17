import { Encrypter, Decrypter, armor } from '../../vendor/age-encryption/index.js';
import { SettingsSnapshotError } from './contracts';
import { MAX_SETTINGS_BYTES, parseSettingsDocument, serializeSettingsDocument } from './document';

import {
  MAX_SETTINGS_ARMORED_BYTES,
  MAX_SETTINGS_BINARY_BYTES,
  type SettingsCryptoRequest,
  type SettingsCryptoResponse,
} from './crypto-protocol';
function requireEnvironment(): void {
  if (
    typeof globalThis.crypto?.getRandomValues !== 'function' ||
    typeof TextEncoder !== 'function' ||
    typeof TextDecoder !== 'function' ||
    typeof ReadableStream !== 'function' ||
    typeof TransformStream !== 'function' ||
    typeof Response !== 'function'
  ) {
    throw new SettingsSnapshotError(
      'crypto-unavailable',
      'Secure settings encryption is unavailable',
    );
  }
  // Fail closed if the worker's actual CSPRNG is unavailable. Never substitute one.
  globalThis.crypto.getRandomValues(new Uint8Array(1));
}

/** Bound public header parsing before the library can allocate one object per stanza. */
function assertBoundedHeader(ciphertext: Uint8Array): void {
  const limit = Math.min(ciphertext.length, 16 * 1024);
  for (let index = 1; index + 4 < limit; index++) {
    if (
      ciphertext[index - 1] !== 10 ||
      ciphertext[index] !== 45 ||
      ciphertext[index + 1] !== 45 ||
      ciphertext[index + 2] !== 45 ||
      ciphertext[index + 3] !== 32
    )
      continue;
    const end = ciphertext.indexOf(10, index + 4);
    if (end !== -1 && end < limit) return;
    break;
  }
  throw new SettingsSnapshotError(
    ciphertext.length >= 16 * 1024 ? 'resource-limit' : 'invalid-file',
    'The age header is invalid or exceeds the resource limit',
  );
}

async function processRequest(request: SettingsCryptoRequest): Promise<SettingsCryptoResponse> {
  requireEnvironment();
  if (typeof request.password !== 'string' || request.password.length === 0)
    throw new SettingsSnapshotError('invalid-password', 'A password is required');
  if (request.operation === 'seal') {
    const plaintext = new TextEncoder().encode(serializeSettingsDocument(request.document));
    try {
      if (plaintext.byteLength > MAX_SETTINGS_BYTES)
        throw new SettingsSnapshotError('resource-limit', 'Settings exceed the resource limit');
      const encrypter = new Encrypter();
      encrypter.setPassphrase(request.password);
      encrypter.setScryptWorkFactor(18);
      return {
        ok: true,
        operation: 'seal',
        ciphertext: armor.encode(await encrypter.encrypt(plaintext)),
      };
    } finally {
      plaintext.fill(0);
    }
  }
  if (request.operation !== 'open' || typeof request.ciphertext !== 'string')
    throw new SettingsSnapshotError('invalid-file', 'Invalid settings file');
  if (
    request.ciphertext.length > MAX_SETTINGS_ARMORED_BYTES ||
    /[^\x00-\x7f]/u.test(request.ciphertext)
  )
    throw new SettingsSnapshotError('resource-limit', 'Settings exceed the resource limit');
  const ciphertext = armor.decode(request.ciphertext);
  if (ciphertext.byteLength > MAX_SETTINGS_BINARY_BYTES)
    throw new SettingsSnapshotError('resource-limit', 'Settings exceed the resource limit');
  assertBoundedHeader(ciphertext);
  const decrypter = new Decrypter();
  // The supported Identity API sees the library-parsed stanzas before scrypt.
  // In pinned 0.3.1 identities are visited sequentially: this admission guard
  // must precede addPassphrase. Do not rely on the library's factor-20 ceiling
  // (~1 GiB); factor 18 already needs ~256 MiB. No file-supplied plugins run.
  decrypter.addIdentity({
    unwrapFileKey(stanzas) {
      if (stanzas.length !== 1 || stanzas[0]!.args[0] !== 'scrypt')
        throw new SettingsSnapshotError(
          'invalid-file',
          'Only passphrase-encrypted settings are supported',
        );
      const args = stanzas[0]!.args;
      if (args.length !== 3 || !/^[1-9][0-9]*$/u.test(args[2]!))
        throw new SettingsSnapshotError('invalid-file', 'Invalid settings file');
      if (Number(args[2]) > 18)
        throw new SettingsSnapshotError(
          'kdf-limit',
          'Settings encryption exceeds the resource limit',
        );
      return null;
    },
  });
  decrypter.addPassphrase(request.password);
  // Non-streaming API resolves only after header MAC AND every payload chunk,
  // including the final-chunk marker, authenticate. Never parse a prefix.
  const plaintext = await decrypter.decrypt(ciphertext);
  try {
    if (plaintext.byteLength > MAX_SETTINGS_BYTES)
      throw new SettingsSnapshotError('resource-limit', 'Settings exceed the resource limit');
    const document = parseSettingsDocument(
      new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
    );
    return { ok: true, operation: 'open', document };
  } finally {
    plaintext.fill(0);
  }
}

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SettingsCryptoRequest>) => void) | null;
  postMessage(response: SettingsCryptoResponse): void;
};
let started = false;
worker.onmessage = (event) => {
  if (started) return;
  started = true;
  void processRequest(event.data).then(
    (response) => worker.postMessage(response),
    (error: unknown) =>
      worker.postMessage({
        ok: false,
        // Do not forward library/engine errors: they may contain untrusted data.
        code: error instanceof SettingsSnapshotError ? error.code : 'crypto-failed',
      }),
  );
};
