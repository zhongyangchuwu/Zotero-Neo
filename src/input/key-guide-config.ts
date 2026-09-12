import type { ActionId } from './actions';

export type KeyGuideLanguage = 'en' | 'zh-CN';
export type LocalizedGuideText = Readonly<Record<KeyGuideLanguage, string>>;

export function keyGuideLanguage(configured: string, hostLocale: string): KeyGuideLanguage {
  if (configured === 'en' || configured === 'zh-CN') return configured;
  return /^zh/i.test(hostLocale) ? 'zh-CN' : 'en';
}

const ACTION_GUIDE_LABELS: Partial<Record<ActionId, LocalizedGuideText>> = {
  mainClosePDF: { en: 'Close active tab', 'zh-CN': '关闭活动标签页' },
  mainTagPicker: { en: 'Open tag picker', 'zh-CN': '打开标签选择器' },
  mainFocusTree: { en: 'Focus collection tree', 'zh-CN': '聚焦分类树' },
  mainFuzzyAll: { en: 'Find all papers/items', 'zh-CN': '查找所有论文/条目' },
  mainFuzzyCollection: { en: 'Find current collection', 'zh-CN': '查找当前分类' },
  mainNotesLayout: { en: 'Search notes', 'zh-CN': '搜索笔记' },
  mainOpenPDF: { en: 'Open selected PDF', 'zh-CN': '打开所选 PDF' },
  mainTabPick: { en: 'Open tab picker', 'zh-CN': '打开标签选择器' },
  mainYankCitekey: { en: 'Copy citekey', 'zh-CN': '复制 citekey' },
  toggleMarksExplorer: { en: 'Open marks explorer', 'zh-CN': '打开标记浏览器' },
  toggleReaderSidebarOutline: { en: 'Toggle reader outline', 'zh-CN': '切换阅读器大纲' },
  toggleReaderSplitHorizontal: { en: 'Split reader horizontally', 'zh-CN': '水平拆分阅读器' },
  toggleReaderSplitVertical: { en: 'Split reader vertically', 'zh-CN': '垂直拆分阅读器' },
};

/**
 * The only configurable presentation data for the Space-leader guide. Commands remain
 * exclusively in the resolved binding map; unlisted actions fall back to ACTION_LABELS.
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
    t: { en: 'Tabs', 'zh-CN': '标签页' },
    f: { en: 'Find', 'zh-CN': '查找' },
    w: { en: 'Panes', 'zh-CN': '窗格' },
    y: { en: 'Citations', 'zh-CN': '引用' },
  },
  actionLabels: ACTION_GUIDE_LABELS,
} as const;
