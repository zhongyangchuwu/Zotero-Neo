import { defineConfig } from 'vitepress';

/** VitePress serializes this function into the browser, so its patterns must be local. */
function tokenizeSearchText(text: string): string[] {
  const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const SEARCH_TOKENS =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu;
  const tokens: string[] = [];

  for (const match of text.toLowerCase().matchAll(SEARCH_TOKENS)) {
    const term = match[0];
    if (!CJK_RUN.test(term)) {
      tokens.push(term);
      continue;
    }

    const characters = Array.from(term);
    if (characters.length === 1) {
      tokens.push(term);
      continue;
    }

    // Overlapping CJK bigrams make Chinese substrings searchable without a remote segmenter.
    for (let index = 0; index < characters.length - 1; index += 1) {
      tokens.push(characters[index] + characters[index + 1]);
    }
  }

  return tokens;
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'Zotero Neo',
  description: '面向 Zotero 的键盘交互层：浏览文献、阅读 PDF、处理选区与笔记。',
  base: '/Zotero-Neo/',
  srcExclude: [
    '**/AGENTS.md',
    '**/.*/**',
    '.github/**',
    '.planning/**',
    '.sisyphus/**',
    '.vitepress/**',
    'assets/**',
    'build/**',
    'coverage/**',
    'dist/**',
    'node_modules/**',
    'src/**',
    'tests/**',
    'tools/**',
    'vendor/**',
  ],
  themeConfig: {
    siteTitle: 'Zotero Neo',
    nav: [
      { text: '开始使用', link: '/docs/GETTING_STARTED' },
      { text: '用户指南', link: '/docs/USER_GUIDE' },
      { text: '命令参考', link: '/docs/COMMAND_REFERENCE' },
      {
        text: '交互、标签与输入',
        items: [
          { text: '交互模型', link: '/docs/INTERACTION_MODEL' },
          { text: 'Selection 与标签', link: '/docs/TAGS' },
          { text: '输入法与文本输入', link: '/docs/INPUT_METHODS' },
        ],
      },
      {
        text: '开发与架构',
        items: [
          { text: '开发指南', link: '/docs/DEVELOPMENT' },
          { text: '架构', link: '/docs/ARCHITECTURE' },
        ],
      },
      {
        text: '设计与路线图',
        items: [
          { text: '导航历史设计', link: '/docs/NAVIGATION_HISTORY_DESIGN' },
          { text: '路线图', link: '/docs/ROADMAP' },
        ],
      },
      {
        text: '验收与录屏',
        items: [
          { text: 'v0.2 候选验收指南', link: '/docs/V0_2_ACCEPTANCE' },
          { text: '录屏与键盘操作指南', link: '/docs/RECORDING_GUIDE' },
        ],
      },
      {
        text: '项目资料',
        items: [
          { text: '项目介绍（README）', link: '/README' },
          { text: '变更日志', link: '/CHANGELOG' },
        ],
      },
    ],
    sidebar: [
      {
        text: '开始使用',
        items: [{ text: '开始使用', link: '/docs/GETTING_STARTED' }],
      },
      {
        text: '用户指南',
        items: [{ text: '用户指南', link: '/docs/USER_GUIDE' }],
      },
      {
        text: '命令参考',
        items: [{ text: '完整命令参考', link: '/docs/COMMAND_REFERENCE' }],
      },
      {
        text: '交互、标签与输入',
        items: [
          { text: '交互模型', link: '/docs/INTERACTION_MODEL' },
          { text: 'Selection 与标签', link: '/docs/TAGS' },
          { text: '输入法与文本输入', link: '/docs/INPUT_METHODS' },
        ],
      },
      {
        text: '开发与架构',
        items: [
          { text: '开发指南', link: '/docs/DEVELOPMENT' },
          { text: '架构', link: '/docs/ARCHITECTURE' },
        ],
      },
      {
        text: '设计、历史与路线图',
        items: [
          { text: '导航历史设计', link: '/docs/NAVIGATION_HISTORY_DESIGN' },
          { text: '路线图', link: '/docs/ROADMAP' },
        ],
      },
      {
        text: '验收与录屏',
        items: [
          { text: 'v0.2 候选验收指南', link: '/docs/V0_2_ACCEPTANCE' },
          { text: '录屏与键盘操作指南', link: '/docs/RECORDING_GUIDE' },
        ],
      },
      {
        text: '项目资料',
        items: [
          { text: '项目介绍（README）', link: '/README' },
          { text: '变更日志', link: '/CHANGELOG' },
        ],
      },
    ],
    outline: {
      label: '本页目录',
      level: [2, 3],
    },
    editLink: {
      pattern: 'https://github.com/zhongyangchuwu/Zotero-Neo/edit/main/:path',
      text: '在 GitHub 上编辑此页',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新于',
    },
    darkModeSwitchLabel: '切换深色模式',
    lightModeSwitchTitle: '切换浅色模式',
    darkModeSwitchTitle: '切换深色模式',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '返回顶部',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                displayDetails: '显示详细匹配',
                resetButtonTitle: '清除查询',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '移动',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc',
                },
              },
            },
          },
        },
        miniSearch: {
          options: {
            tokenize: tokenizeSearchText,
          },
        },
      },
    },
  },
});
