import { fileURLToPath } from 'node:url';
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

const userSidebar = [
  {
    text: '开始使用',
    items: [
      { text: '功能介绍', link: '/docs/FEATURES' },
      { text: '安装与入门', link: '/docs/GETTING_STARTED' },
    ],
  },
  {
    text: '使用指南',
    items: [
      { text: '概览与工作流', link: '/docs/USER_GUIDE' },
      { text: '基本概念', link: '/docs/CONCEPTS' },
      { text: '文本输入与输入法', link: '/docs/INPUT_METHODS' },
      { text: '文献库与阅读清单', link: '/docs/MAIN_GUIDE' },
      { text: '阅读与导航 PDF', link: '/docs/READER_GUIDE' },
      { text: '文本选择与批注', link: '/docs/SELECTION_GUIDE' },
      { text: '摘录到笔记', link: '/docs/CAPTURE_GUIDE' },
      { text: '查找与编辑笔记', link: '/docs/NOTE_GUIDE' },
      { text: '标签整理', link: '/docs/TAGS' },
      { text: '搜索与导航', link: '/docs/SEARCH_GUIDE' },
      { text: '快捷键与设置', link: '/docs/SETTINGS_GUIDE' },
    ],
  },
  {
    text: '参考手册',
    items: [
      { text: '命令与快捷键', link: '/docs/COMMAND_REFERENCE' },
      { text: '设置参考', link: '/docs/SETTINGS_REFERENCE' },
    ],
  },
  {
    text: '帮助',
    items: [{ text: '故障排查', link: '/docs/TROUBLESHOOTING' }],
  },
];

const developerSidebar = [
  {
    text: '开发指南',
    items: [
      { text: '开发与调试', link: '/docs/DEVELOPMENT' },
      { text: '文档编写规范', link: '/docs/DOCUMENTATION_AUTHORING' },
    ],
  },
  {
    text: '设计与架构',
    items: [
      { text: '架构', link: '/docs/ARCHITECTURE' },
      { text: '模块拆分与基座设计', link: '/docs/MODULE_DESIGN' },
      { text: '交互模型', link: '/docs/INTERACTION_MODEL' },
      { text: '导航历史设计', link: '/docs/NAVIGATION_HISTORY_DESIGN' },
    ],
  },
  {
    text: '项目资料',
    items: [
      { text: 'v0.2 候选版本验收', link: '/docs/V0_2_ACCEPTANCE' },
      { text: '录制指南', link: '/docs/RECORDING_GUIDE' },
    ],
  },
];

export default defineConfig({
  lang: 'zh-CN',
  title: 'Zotero Neo',
  description: '通过键盘浏览 Zotero 文献库、阅读 PDF 并处理笔记。',
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
  vite: {
    resolve: {
      alias: [
        {
          find: './VPFeature.vue',
          replacement: fileURLToPath(new URL('./theme/AccessibleFeature.vue', import.meta.url)),
        },
      ],
    },
  },
  themeConfig: {
    siteTitle: 'Zotero Neo',
    nav: [
      { text: '功能介绍', link: '/docs/FEATURES' },
      { text: '安装与入门', link: '/docs/GETTING_STARTED' },
      { text: '使用指南', link: '/docs/USER_GUIDE' },
      {
        text: '参考手册',
        items: [
          { text: '命令与快捷键', link: '/docs/COMMAND_REFERENCE' },
          { text: '设置参考', link: '/docs/SETTINGS_REFERENCE' },
        ],
      },
      {
        text: '项目',
        items: [
          { text: '更新记录', link: '/CHANGELOG' },
          { text: '路线图', link: '/docs/ROADMAP' },
          { text: '开发与调试', link: '/docs/DEVELOPMENT' },
          { text: 'GitHub', link: 'https://github.com/zhongyangchuwu/Zotero-Neo' },
        ],
      },
    ],
    sidebar: {
      '/': userSidebar,
      '/docs/DEVELOPMENT': developerSidebar,
      '/docs/DOCUMENTATION_AUTHORING': developerSidebar,
      '/docs/ARCHITECTURE': developerSidebar,
      '/docs/MODULE_DESIGN': developerSidebar,
      '/docs/INTERACTION_MODEL': developerSidebar,
      '/docs/NAVIGATION_HISTORY_DESIGN': developerSidebar,
      '/docs/V0_2_ACCEPTANCE': developerSidebar,
      '/docs/RECORDING_GUIDE': developerSidebar,
    },
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
      text: '最后更新',
    },
    skipToContentLabel: '跳转到正文',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色主题',
    darkModeSwitchTitle: '切换到深色主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索',
              },
              modal: {
                displayDetails: '显示详细结果',
                resetButtonTitle: '清空搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '未找到结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换结果',
                  navigateUpKeyAriaLabel: '向上箭头键',
                  navigateDownKeyAriaLabel: '向下箭头键',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Escape 键',
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
