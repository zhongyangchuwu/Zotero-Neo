import type { ActionId } from './actions';

export type KeyGuideLanguage = 'en' | 'zh-CN';
export type LocalizedGuideText = Readonly<Record<KeyGuideLanguage, string>>;

export function keyGuideLanguage(configured: string, hostLocale: string): KeyGuideLanguage {
  if (configured === 'en' || configured === 'zh-CN') return configured;
  return /^zh/i.test(hostLocale) ? 'zh-CN' : 'en';
}

const ACTION_GUIDE_LABELS: Partial<Record<ActionId, LocalizedGuideText>> = {
  closeCurrentTab: { en: 'Close current tab', 'zh-CN': '关闭当前标签页' },
  addTag: { en: 'Add tag', 'zh-CN': '添加标签' },
  removeTag: { en: 'Remove tag', 'zh-CN': '移除标签' },
  toggleTagFilter: { en: 'Toggle tag filter', 'zh-CN': '切换标签筛选' },
  clearTagFilters: { en: 'Clear tag filters', 'zh-CN': '清空标签筛选' },
  mainFocusTree: { en: 'Focus collection tree', 'zh-CN': '聚焦分类树' },
  findAllItems: { en: 'Find all papers/items', 'zh-CN': '查找所有论文/条目' },
  findCollectionItems: { en: 'Find current collection', 'zh-CN': '查找当前分类' },
  findNotes: { en: 'Find note', 'zh-CN': '查找笔记' },
  mainQuickSearch: { en: 'Quick Search', 'zh-CN': '快速搜索' },
  mainAdvancedSearch: { en: 'Advanced Search', 'zh-CN': '高级搜索' },
  mainReturnContext: { en: 'Return context', 'zh-CN': '返回上下文' },
  addToCollection: { en: 'Add to collection', 'zh-CN': '添加到分类' },
  removeFromCollection: { en: 'Remove from collection', 'zh-CN': '移出分类' },
  managePlugins: { en: 'Manage plugins', 'zh-CN': '管理插件' },
  mainOpenPDF: { en: 'Open selected PDF', 'zh-CN': '打开所选 PDF' },
  switchTab: { en: 'Switch tab', 'zh-CN': '切换标签页' },
  mainYankCitekey: { en: 'Copy citekey', 'zh-CN': '复制 citekey' },
  toggleMarksExplorer: { en: 'Open marks explorer', 'zh-CN': '打开标记浏览器' },
  toggleReaderSidebarOutline: { en: 'Toggle reader outline', 'zh-CN': '切换阅读器大纲' },
  toggleReaderSplitHorizontal: { en: 'Split reader horizontally', 'zh-CN': '水平拆分阅读器' },
  toggleReaderSplitVertical: { en: 'Split reader vertically', 'zh-CN': '垂直拆分阅读器' },
};

/**
 * The only configurable presentation data for the pending-prefix guide. Commands remain
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
    t: { en: 'Tags', 'zh-CN': '标签' },
    c: { en: 'Collections', 'zh-CN': '分类' },
    f: { en: 'Find', 'zh-CN': '查找' },
    g: { en: 'Navigation', 'zh-CN': '导航' },
    w: { en: 'Panes', 'zh-CN': '窗格' },
    y: { en: 'Citations', 'zh-CN': '引用' },
    p: { en: 'Plugins', 'zh-CN': '插件' },
  },
  actionLabels: ACTION_GUIDE_LABELS,
} as const;
