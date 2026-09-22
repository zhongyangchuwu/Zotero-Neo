import { NOTE_ACTION_LABELS, type NoteActionId } from './note-actions';

const BASE_ACTION_LABELS = {
  scrollDown: {
    en: 'Scroll down',
    'zh-CN': '向下滚动',
  },
  scrollUp: {
    en: 'Scroll up',
    'zh-CN': '向上滚动',
  },
  scrollLeft: {
    en: 'Scroll left',
    'zh-CN': '向左滚动',
  },
  scrollRight: {
    en: 'Scroll right',
    'zh-CN': '向右滚动',
  },
  prevPage: {
    en: 'Previous page',
    'zh-CN': '上一页',
  },
  nextPage: {
    en: 'Next page',
    'zh-CN': '下一页',
  },
  historyBack: {
    en: 'Go back in reading history',
    'zh-CN': '返回阅读历史上一位置',
  },
  historyForward: {
    en: 'Go forward in reading history',
    'zh-CN': '前进到阅读历史下一位置',
  },
  followLink: {
    en: 'Follow visible PDF link',
    'zh-CN': '跟随可见 PDF 链接',
  },
  flashText: {
    en: 'Flash to visible PDF text',
    'zh-CN': 'Flash 跳转到可见 PDF 文本',
  },
  firstPage: {
    en: 'First page',
    'zh-CN': '第一页',
  },
  lastPage: {
    en: 'Last page',
    'zh-CN': '最后一页',
  },
  halfPageDown: {
    en: 'Half-page down',
    'zh-CN': '向下半页',
  },
  halfPageUp: {
    en: 'Half-page up',
    'zh-CN': '向上半页',
  },
  fullPageDown: {
    en: 'Full-page down',
    'zh-CN': '向下整页',
  },
  fullPageUp: {
    en: 'Full-page up',
    'zh-CN': '向上整页',
  },
  zoomIn: {
    en: 'Zoom in',
    'zh-CN': '放大',
  },
  zoomOut: {
    en: 'Zoom out',
    'zh-CN': '缩小',
  },
  zoomReset: {
    en: 'Reset zoom / Fit page width',
    'zh-CN': '重置缩放 / 适合页面宽度',
  },
  scrollTop: {
    en: 'Scroll — current page to top of view',
    'zh-CN': '滚动 — 当前页面到视图顶部',
  },
  scrollCenter: {
    en: 'Scroll — current page to center of view',
    'zh-CN': '滚动 — 当前页面到视图中央',
  },
  scrollBottom: {
    en: 'Scroll — current page to bottom of view',
    'zh-CN': '滚动 — 当前页面到视图底部',
  },
  openSearch: {
    en: 'Open find bar',
    'zh-CN': '打开查找栏',
  },
  findNext: {
    en: 'Jump to next search match',
    'zh-CN': '跳转到下一个搜索结果',
  },
  findPrevious: {
    en: 'Jump to previous search match',
    'zh-CN': '跳转到上一个搜索结果',
  },
  prevAnnotation: {
    en: 'Jump to previous annotation',
    'zh-CN': '跳到上一个标注',
  },
  nextAnnotation: {
    en: 'Jump to next annotation',
    'zh-CN': '跳到下一个标注',
  },
  clearSearch: {
    en: 'Clear / close search',
    'zh-CN': '清除 / 关闭搜索',
  },
  enterVisual: {
    en: 'Enter Visual mode',
    'zh-CN': '进入可视模式',
  },
  openSelectionActions: {
    en: 'Open actions for selected text',
    'zh-CN': '打开所选文本操作',
  },
  enterInsert: {
    en: 'Enter Insert mode (focuses annotation comment if selected)',
    'zh-CN': '进入插入模式（选中标注时聚焦其注释）',
  },
  exitMode: {
    en: 'Exit to Normal mode',
    'zh-CN': '退出到普通模式',
  },
  extendDown: {
    en: 'Extend selection — down (line)',
    'zh-CN': '扩展选择 — 向下（行）',
  },
  extendUp: {
    en: 'Extend selection — up (line)',
    'zh-CN': '扩展选择 — 向上（行）',
  },
  extendLeft: {
    en: 'Extend selection — left (char)',
    'zh-CN': '扩展选择 — 向左（字符）',
  },
  extendRight: {
    en: 'Extend selection — right (char)',
    'zh-CN': '扩展选择 — 向右（字符）',
  },
  extendSentenceForward: {
    en: 'Extend selection — next sentence start',
    'zh-CN': '扩展选择 — 下一个句首',
  },
  extendSentenceBackward: {
    en: 'Extend selection — previous sentence start',
    'zh-CN': '扩展选择 — 上一个句首',
  },
  extendParagraphForward: {
    en: 'Extend selection — paragraph end',
    'zh-CN': '扩展选择 — 段落结尾',
  },
  extendParagraphBackward: {
    en: 'Extend selection — paragraph start',
    'zh-CN': '扩展选择 — 段落开头',
  },
  extendWordForward: {
    en: 'Extend selection — next word',
    'zh-CN': '扩展选择 — 下一个单词',
  },
  extendWordBackward: {
    en: 'Extend selection — previous word',
    'zh-CN': '扩展选择 — 上一个单词',
  },
  extendLineStart: {
    en: 'Extend selection — start of current line',
    'zh-CN': '扩展选择 — 当前行行首',
  },
  extendLineEnd: {
    en: 'Extend selection — end of current line',
    'zh-CN': '扩展选择 — 当前行行尾',
  },
  highlightYellow: {
    en: 'Highlight — Yellow',
    'zh-CN': '高亮 — 黄色',
  },
  highlightRed: {
    en: 'Highlight — Red',
    'zh-CN': '高亮 — 红色',
  },
  highlightGreen: {
    en: 'Highlight — Green',
    'zh-CN': '高亮 — 绿色',
  },
  highlightBlue: {
    en: 'Highlight — Blue',
    'zh-CN': '高亮 — 蓝色',
  },
  highlightPurple: {
    en: 'Highlight — Purple',
    'zh-CN': '高亮 — 紫色',
  },
  underlineSelection: {
    en: 'Underline selection',
    'zh-CN': '为选区添加下划线',
  },
  addNote: {
    en: 'Add note / comment',
    'zh-CN': '添加笔记 / 注释',
  },
  copySelection: {
    en: 'Copy selection to clipboard',
    'zh-CN': '将选区复制到剪贴板',
  },
  searchSelection: {
    en: 'Open find bar and search for selection',
    'zh-CN': '打开查找栏并搜索选区',
  },
  swapVisualEnds: {
    en: 'Swap selection anchor/focus — jump to other end',
    'zh-CN': '交换选区锚点 / 焦点 — 跳到另一端',
  },
  editAnnotation: {
    en: 'Open annotation comment for editing',
    'zh-CN': '打开标注注释进行编辑',
  },
  deleteAnnotation: {
    en: 'Delete selected annotation',
    'zh-CN': '删除所选标注',
  },
  filterYellow: {
    en: 'Filter sidebar → Yellow annotations',
    'zh-CN': '筛选侧边栏 → 黄色标注',
  },
  filterRed: {
    en: 'Filter sidebar → Red annotations',
    'zh-CN': '筛选侧边栏 → 红色标注',
  },
  filterGreen: {
    en: 'Filter sidebar → Green annotations',
    'zh-CN': '筛选侧边栏 → 绿色标注',
  },
  filterBlue: {
    en: 'Filter sidebar → Blue annotations',
    'zh-CN': '筛选侧边栏 → 蓝色标注',
  },
  filterPurple: {
    en: 'Filter sidebar → Purple annotations',
    'zh-CN': '筛选侧边栏 → 紫色标注',
  },
  filterClear: {
    en: 'Clear annotation colour filter',
    'zh-CN': '清除标注颜色筛选',
  },
  recolorYellow: {
    en: 'Change annotation colour → Yellow',
    'zh-CN': '将标注颜色改为黄色',
  },
  recolorRed: {
    en: 'Change annotation colour → Red',
    'zh-CN': '将标注颜色改为红色',
  },
  recolorGreen: {
    en: 'Change annotation colour → Green',
    'zh-CN': '将标注颜色改为绿色',
  },
  recolorBlue: {
    en: 'Change annotation colour → Blue',
    'zh-CN': '将标注颜色改为蓝色',
  },
  recolorPurple: {
    en: 'Change annotation colour → Purple',
    'zh-CN': '将标注颜色改为紫色',
  },
  yankAnnotation: {
    en: 'Copy annotation highlighted text',
    'zh-CN': '复制标注高亮文本',
  },
  yankAnnotationComment: {
    en: 'Copy annotation comment text',
    'zh-CN': '复制标注注释文本',
  },
  openCommandPalette: {
    en: 'Open command palette',
    'zh-CN': '打开命令面板',
  },
  findAllItems: {
    en: 'Find an item in the library',
    'zh-CN': '在文库中查找条目',
  },
  findCollectionItems: {
    en: 'Find an item in the current collection',
    'zh-CN': '在当前分类中查找条目',
  },
  findNotes: {
    en: 'Find and open a note',
    'zh-CN': '查找并打开笔记',
  },
  mainQuickSearch: {
    en: 'Main window: focus Zotero Quick Search',
    'zh-CN': '主窗口：聚焦 Zotero 快速搜索',
  },
  mainAdvancedSearch: {
    en: 'Main window: open Zotero Advanced Search',
    'zh-CN': '主窗口：打开 Zotero 高级搜索',
  },
  managePlugins: {
    en: 'Manage installed Zotero plugins',
    'zh-CN': '管理已安装的 Zotero 插件',
  },
  manageSelection: {
    en: 'Inspect Main Selection workset',
    'zh-CN': '检查主窗口 Selection 集合',
  },
  mainReturnContext: {
    en: 'Main window: return to saved work context',
    'zh-CN': '主窗口：返回已保存的工作上下文',
  },
  mainTrashItems: {
    en: 'Main window: move selected items to trash',
    'zh-CN': '主窗口：将所选条目移到回收站',
  },
  mainRestoreTrashedItems: {
    en: 'Main window: restore the last trashed items',
    'zh-CN': '主窗口：恢复最近移到回收站的条目',
  },
  mainFocusTree: {
    en: 'Main window: focus collection tree',
    'zh-CN': '主窗口：聚焦分类树',
  },
  mainFocusLeft: {
    en: 'Main window: focus collection tree',
    'zh-CN': '主窗口：聚焦分类树',
  },
  mainFocusRight: {
    en: 'Main window: focus detail pane',
    'zh-CN': '主窗口：聚焦详情面板',
  },
  mainFocusItems: {
    en: 'Main window: focus items list',
    'zh-CN': '主窗口：聚焦条目列表',
  },
  mainYankCitekey: {
    en: 'Main window: copy BetterBibTeX citekey',
    'zh-CN': '主窗口：复制 BetterBibTeX citekey',
  },
  mainOpenPDF: {
    en: 'Main window: open PDF of selected item',
    'zh-CN': '主窗口：打开所选条目的 PDF',
  },
  closeCurrentTab: {
    en: 'Close current tab',
    'zh-CN': '关闭当前标签页',
  },
  addTag: {
    en: 'Add tag to current target(s)',
    'zh-CN': '为当前目标添加标签',
  },
  removeTag: {
    en: 'Remove tag from current target(s)',
    'zh-CN': '从当前目标移除标签',
  },
  toggleTagFilter: {
    en: 'Toggle one tag filter',
    'zh-CN': '切换一个标签筛选条件',
  },
  clearTagFilters: {
    en: 'Clear tag filters',
    'zh-CN': '清空标签筛选条件',
  },
  addToCollection: {
    en: 'Add current item target(s) to collection',
    'zh-CN': '将当前条目目标添加到分类',
  },
  removeFromCollection: {
    en: 'Remove current item target(s) from collection',
    'zh-CN': '将当前条目目标移出分类',
  },
  mainEnterSelect: {
    en: 'Main window: enter Visual range',
    'zh-CN': '主窗口：进入可视范围',
  },
  mainToggleSelection: {
    en: 'Main window: toggle item Selection / collection ScopeSet',
    'zh-CN': '主窗口：切换条目 Selection / 分类 ScopeSet',
  },
  mainSelectDown: {
    en: 'Visual: move head down',
    'zh-CN': '可视范围：向下移动端点',
  },
  mainSelectUp: {
    en: 'Visual: move head up',
    'zh-CN': '可视范围：向上移动端点',
  },
  mainSelectFirst: {
    en: 'Visual: move head to first item',
    'zh-CN': '可视范围：端点移到首项',
  },
  mainSelectLast: {
    en: 'Visual: move head to last item',
    'zh-CN': '可视范围：端点移到末项',
  },
  mainSelectSwapEnds: {
    en: 'Visual: swap anchor and head',
    'zh-CN': '可视范围：交换锚点与端点',
  },
  mainSelectFinish: {
    en: 'Item Select: finish and preserve selection',
    'zh-CN': '条目选择：完成并保留选择',
  },
  mainSelectCancel: {
    en: 'Visual: cancel without changing Selection',
    'zh-CN': '可视范围：取消且不修改选择集合',
  },
  mainNavDown: {
    en: 'Main window: navigate down',
    'zh-CN': '主窗口：向下导航',
  },
  mainNavUp: {
    en: 'Main window: navigate up',
    'zh-CN': '主窗口：向上导航',
  },
  mainNavFirst: {
    en: 'Main window: go to first item',
    'zh-CN': '主窗口：跳到第一个条目',
  },
  mainNavLast: {
    en: 'Main window: go to last item',
    'zh-CN': '主窗口：跳到最后一个条目',
  },
  mainActivate: {
    en: 'Main window: open PDF of selected item',
    'zh-CN': '主窗口：打开所选条目的 PDF',
  },
  switchTab: {
    en: 'Switch to an open tab',
    'zh-CN': '切换到已打开的标签页',
  },
  previousTab: {
    en: 'Switch to previous tab',
    'zh-CN': '切换到上一个标签页',
  },
  nextTab: {
    en: 'Switch to next tab',
    'zh-CN': '切换到下一个标签页',
  },
  mainTreeToggle: {
    en: 'Main window: toggle expand/collapse collection',
    'zh-CN': '主窗口：切换分类展开 / 折叠',
  },
  mainTreeOpenOnly: {
    en: 'Main window: expand collection only',
    'zh-CN': '主窗口：仅展开分类',
  },
  mainTreeCloseOnly: {
    en: 'Main window: collapse collection only',
    'zh-CN': '主窗口：仅折叠分类',
  },
  mainTreeExpand: {
    en: 'Main window: expand collection or enter item list',
    'zh-CN': '主窗口：展开分类或进入条目列表',
  },
  mainTreeCollapse: {
    en: 'Main window: collapse collection or move to parent',
    'zh-CN': '主窗口：折叠分类或移到父级',
  },
  mainTreeParent: {
    en: 'Main window: jump to parent collection',
    'zh-CN': '主窗口：跳到父分类',
  },
  mainTreeExpandAll: {
    en: 'Main window: expand all collections',
    'zh-CN': '主窗口：展开所有分类',
  },
  mainTreeCollapseAll: {
    en: 'Main window: collapse all collections',
    'zh-CN': '主窗口：折叠所有分类',
  },
  focusReaderSplitLeft: {
    en: 'Focus the visible pane to the left',
    'zh-CN': '聚焦左侧可见面板',
  },
  focusReaderSplitDown: {
    en: 'Focus the visible pane below',
    'zh-CN': '聚焦下方可见面板',
  },
  focusReaderSplitUp: {
    en: 'Focus the visible pane above',
    'zh-CN': '聚焦上方可见面板',
  },
  focusReaderSplitRight: {
    en: 'Focus the visible pane to the right',
    'zh-CN': '聚焦右侧可见面板',
  },
  toggleReaderSplitHorizontal: {
    en: 'Reader: toggle horizontal split',
    'zh-CN': '阅读器：切换水平分栏',
  },
  toggleReaderSplitVertical: {
    en: 'Reader: toggle vertical split',
    'zh-CN': '阅读器：切换垂直分栏',
  },
  toggleReaderSidebarOutline: {
    en: 'Reader: toggle outline explorer overlay',
    'zh-CN': '阅读器：切换目录浏览浮层',
  },
  focusReaderSidebar: {
    en: 'Reader: focus or reopen outline explorer overlay',
    'zh-CN': '阅读器：聚焦或重新打开目录浏览浮层',
  },
  toggleMarksExplorer: {
    en: 'Reader: toggle marks explorer overlay',
    'zh-CN': '阅读器：切换标记浏览浮层',
  },
} as const;

type ActionLabel = { readonly en: string; readonly 'zh-CN': string };
export type BaseActionId = keyof typeof BASE_ACTION_LABELS;
export type ActionId = BaseActionId | NoteActionId;
export const ACTION_LABELS: Readonly<Record<ActionId, ActionLabel>> = Object.freeze({
  ...BASE_ACTION_LABELS,
  ...NOTE_ACTION_LABELS,
});

export type FocusDirection = 'left' | 'down' | 'up' | 'right';

const FOCUS_DIRECTION_BY_ACTION: Partial<Record<ActionId, FocusDirection>> = {
  focusReaderSplitLeft: 'left',
  focusReaderSplitDown: 'down',
  focusReaderSplitUp: 'up',
  focusReaderSplitRight: 'right',
};

export function focusDirectionForAction(action: ActionId | undefined): FocusDirection | null {
  return action ? (FOCUS_DIRECTION_BY_ACTION[action] ?? null) : null;
}

export const ACTION_IDS = Object.freeze(Object.keys(ACTION_LABELS) as ActionId[]);

export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && value in ACTION_LABELS;
}
