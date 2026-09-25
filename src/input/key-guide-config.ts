export type KeyGuideLanguage = 'en' | 'zh-CN';
export type LocalizedGuideText = Readonly<Record<KeyGuideLanguage, string>>;

export function keyGuideLanguage(configured: string, hostLocale: string): KeyGuideLanguage {
  if (configured === 'en' || configured === 'zh-CN') return configured;
  return /^zh/i.test(hostLocale) ? 'zh-CN' : 'en';
}

/**
 * The only configurable presentation data for the pending-prefix guide. Commands remain
 * exclusively in the resolved binding map; action labels come from the shared i18n catalog.
 */
export const KEY_GUIDE_CONFIG = {
  defaultDelayMs: 200,
  maxDelayMs: 1_000,
  idleTimeoutMs: 5_000,
  defaultFontSizePx: 15,
  minFontSizePx: 12,
  maxFontSizePx: 24,
  genericGroupLabel: {
    en: 'More commands',
    'zh-CN': '更多命令',
  },
  groupLabels: {
    t: { en: 'Tags', 'zh-CN': '标签' },
    c: { en: 'Collections', 'zh-CN': '分类' },
    f: { en: 'Find', 'zh-CN': '查找' },
    g: { en: 'Navigation', 'zh-CN': '导航' },
    w: { en: 'Panes', 'zh-CN': '窗格' },
    y: { en: 'Citations', 'zh-CN': '引用' },
    p: { en: 'Neo', 'zh-CN': 'Neo' },
  },
} as const;
