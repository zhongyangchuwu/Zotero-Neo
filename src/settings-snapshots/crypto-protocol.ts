import type { SettingsDocument } from './contracts';
import { MAX_SETTINGS_BYTES } from './document';

// age STREAM adds 16 bytes per 64 KiB, plus a small single-scrypt header.
export const MAX_SETTINGS_BINARY_BYTES =
  MAX_SETTINGS_BYTES + Math.ceil(MAX_SETTINGS_BYTES / 65536) * 16 + 1024;
// Official armor accepts CRLF as well as LF. This bound admits both.
export const MAX_SETTINGS_ARMORED_BYTES =
  Math.ceil(MAX_SETTINGS_BINARY_BYTES / 3) * 4 +
  Math.ceil(MAX_SETTINGS_BINARY_BYTES / 48) * 2 +
  128;

export type SettingsCryptoRequest =
  | { readonly operation: 'seal'; readonly document: SettingsDocument; readonly password: string }
  | { readonly operation: 'open'; readonly ciphertext: string; readonly password: string };
export type SettingsCryptoResponse =
  | { readonly ok: true; readonly operation: 'seal'; readonly ciphertext: string }
  | { readonly ok: true; readonly operation: 'open'; readonly document: SettingsDocument }
  | { readonly ok: false; readonly code: string };
