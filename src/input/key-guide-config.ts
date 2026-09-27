export type KeyGuideLanguage = 'en' | 'zh-CN';

export function keyGuideLanguage(configured: string, hostLocale: string): KeyGuideLanguage {
  if (configured === 'en' || configured === 'zh-CN') return configured;
  return /^zh/i.test(hostLocale) ? 'zh-CN' : 'en';
}

/** Presentation and timing settings; namespace labels live in the keymap. */
export const KEY_GUIDE_CONFIG = {
  defaultDelayMs: 200,
  maxDelayMs: 1_000,
  idleTimeoutMs: 5_000,
  defaultFontSizePx: 15,
  minFontSizePx: 12,
  maxFontSizePx: 24,
} as const;
