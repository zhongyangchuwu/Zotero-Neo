import { createSettingsCryptoRunner } from '../platform/settings-transfer-crypto';
import { SettingsTransferError, type SettingsFileCodec } from './contracts';
import { assertSettingsCurrent, validateSettingsDocument } from './document';
import { MAX_SETTINGS_ARMORED_BYTES } from './crypto-protocol';

/** Password-only, standard age files through the add-on's registered native resources. */
export function createSettingsFileCodec(): SettingsFileCodec {
  const runner = createSettingsCryptoRunner();
  return {
    async seal(document, password, context) {
      assertSettingsCurrent(context);
      validateSettingsDocument(document);
      if (typeof password !== 'string' || password.length === 0)
        throw new SettingsTransferError('invalid-password', 'A non-empty password is required');
      const result = await runner.run({ operation: 'seal', document, password }, context);
      assertSettingsCurrent(context);
      if (!result.ok || result.operation !== 'seal' || typeof result.ciphertext !== 'string')
        throw new SettingsTransferError('crypto-failed', 'Settings encryption failed');
      return result.ciphertext;
    },
    async open(ciphertext, password, context) {
      assertSettingsCurrent(context);
      if (typeof ciphertext !== 'string')
        throw new SettingsTransferError('invalid-file', 'This settings file is invalid');
      if (ciphertext.length > MAX_SETTINGS_ARMORED_BYTES)
        throw new SettingsTransferError(
          'resource-limit',
          'The settings file exceeds the resource limit',
        );
      if (typeof password !== 'string' || password.length === 0)
        throw new SettingsTransferError('invalid-password', 'A non-empty password is required');
      const result = await runner.run({ operation: 'open', ciphertext, password }, context);
      assertSettingsCurrent(context);
      if (!result.ok || result.operation !== 'open')
        throw new SettingsTransferError('crypto-failed', 'Settings decryption failed');
      validateSettingsDocument(result.document);
      return result.document;
    },
    dispose() {
      runner.dispose();
    },
  };
}
