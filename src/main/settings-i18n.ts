import { neoCommandLanguage, type PreferenceReader } from '../core/preferences';
import { t } from '../i18n';
import enUS from '../i18n/locales/en-US.json';
import type { KeyGuideLanguage } from '../input/key-guide-config';

export type SettingsLanguage = KeyGuideLanguage;

type SettingsTranslationKey = Extract<keyof typeof enUS, `settings.${string}`>;
export type SettingsMessage = SettingsTranslationKey extends `settings.${infer Message}`
  ? Message
  : never;

export function settingsLanguage(
  preferences: PreferenceReader,
  hostLocale: string,
): SettingsLanguage {
  return neoCommandLanguage(preferences, hostLocale);
}

export function settingsText(language: SettingsLanguage, message: SettingsMessage): string {
  return t(`settings.${message}`, language);
}

export function settingsToggleLabels(language: SettingsLanguage): {
  readonly on: string;
  readonly off: string;
} {
  return {
    on: settingsText(language, 'On'),
    off: settingsText(language, 'Off'),
  };
}

const SCOPE_MESSAGES: Readonly<Record<string, SettingsMessage>> = {
  'Main window': 'Main window',
  'Reader session': 'Reader session',
  'Tag picker': 'Tag picker',
  'Collection picker': 'Collection picker',
  'Reader view': 'Reader view',
  'Native sidebar': 'Native sidebar',
  'Selection action': 'Selection action',
  'Comment editor': 'Comment editor',
  'Hint overlay': 'Hint overlay',
  'Note editor': 'Note editor',
  'Note picker': 'Note picker',
  'Capture chooser': 'Capture chooser',
  'Tab picker': 'Tab picker',
  'Plugin manager': 'Plugin manager',
};

/** Translates static module-scope labels while preserving unknown future labels. */
export function settingsScopeText(language: SettingsLanguage, scope: string): string {
  const message = SCOPE_MESSAGES[scope];
  return message ? settingsText(language, message) : scope;
}
