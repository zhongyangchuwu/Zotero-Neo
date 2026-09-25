import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import type { AppLanguage, LocaleCode, TranslationCatalog } from './types';

export type { AppLanguage, LocaleCode, TranslationCatalog } from './types';

export const LOCALE_CATALOGS: Readonly<Record<LocaleCode, TranslationCatalog>> = Object.freeze({
  'en-US': enUS,
  'zh-CN': zhCN,
});

export type TranslationKey = keyof typeof enUS;

export function localeForLanguage(language: AppLanguage | string): LocaleCode {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function translateCatalog(
  catalog: TranslationCatalog,
  fallbackCatalog: TranslationCatalog,
  key: string,
): string {
  return catalog[key] ?? fallbackCatalog[key] ?? key;
}

export function t(key: TranslationKey | string, language: AppLanguage | string): string {
  const locale = localeForLanguage(language);
  return translateCatalog(LOCALE_CATALOGS[locale], LOCALE_CATALOGS['en-US'], key);
}

export function actionText(actionId: string, language: AppLanguage | string): string {
  return t(`action.${actionId}`, language);
}
