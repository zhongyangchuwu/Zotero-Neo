import { createSettingsCryptoRunner } from '../platform/settings-snapshots-crypto';
import { SettingsSnapshotError, type SettingsContainer, type SettingsFileCodec } from './contracts';
import {
  assertSettingsCurrent,
  parseSettingsDocument,
  serializeSettingsDocument,
  validateSettingsDocument,
} from './document';
import { MAX_SETTINGS_ARMORED_BYTES } from './crypto-protocol';

/** Container policy is shared by manual operations and managed publication. */
export const SETTINGS_CONTAINERS = {
  json: {
    id: 'json',
    extension: 'json',
    encrypted: false,
    requiresPassword: false,
    allowsAutoUpdate: true,
  },
  age: {
    id: 'age',
    extension: 'age',
    encrypted: true,
    requiresPassword: true,
    allowsAutoUpdate: false,
  },
} as const;

/** Detect the actual content, not its filename or untrusted document metadata. */
export function settingsContainerFor(contents: string): SettingsContainer {
  if (typeof contents !== 'string')
    throw new SettingsSnapshotError('invalid-file', 'This settings file is invalid');
  if (contents.length > MAX_SETTINGS_ARMORED_BYTES)
    throw new SettingsSnapshotError(
      'resource-limit',
      'The settings file exceeds the resource limit',
    );
  if (contents.startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) return 'age';
  if (/^\s*\{/u.test(contents)) return 'json';
  throw new SettingsSnapshotError('invalid-file', 'This file is not a Zotero Neo backup');
}

/** JSON and standard age containers decode to the same versioned semantic document. */
export function createSettingsFileCodec(): SettingsFileCodec {
  const runner = createSettingsCryptoRunner();
  let disposed = false;
  return {
    async seal(document, password, context, container = 'age') {
      assertSettingsCurrent(context);
      if (disposed)
        throw new SettingsSnapshotError('cancelled', 'The settings operation was cancelled');
      validateSettingsDocument(document);
      if (container === 'json') return serializeSettingsDocument(document);
      if (container !== 'age')
        throw new SettingsSnapshotError('invalid-container', 'Unknown settings container');
      if (typeof password !== 'string' || password.length === 0)
        throw new SettingsSnapshotError('invalid-password', 'A non-empty password is required');
      const result = await runner.run({ operation: 'seal', document, password }, context);
      assertSettingsCurrent(context);
      if (!result.ok || result.operation !== 'seal' || typeof result.ciphertext !== 'string')
        throw new SettingsSnapshotError('crypto-failed', 'Settings encryption failed');
      return result.ciphertext;
    },
    async open(ciphertext, password, context) {
      assertSettingsCurrent(context);
      if (disposed)
        throw new SettingsSnapshotError('cancelled', 'The settings operation was cancelled');
      if (settingsContainerFor(ciphertext) === 'json') return parseSettingsDocument(ciphertext);
      if (typeof password !== 'string' || password.length === 0)
        throw new SettingsSnapshotError('invalid-password', 'A non-empty password is required');
      const result = await runner.run({ operation: 'open', ciphertext, password }, context);
      assertSettingsCurrent(context);
      if (!result.ok || result.operation !== 'open')
        throw new SettingsSnapshotError('crypto-failed', 'Settings decryption failed');
      validateSettingsDocument(result.document);
      return result.document;
    },
    dispose() {
      disposed = true;
      runner.dispose();
    },
  };
}
