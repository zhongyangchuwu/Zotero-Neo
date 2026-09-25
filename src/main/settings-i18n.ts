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
