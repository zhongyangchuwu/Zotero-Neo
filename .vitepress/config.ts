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

const guides = [
  {
    text: '开始使用',
    items: [
      { text: '3 分钟快速上手', link: '/docs/GETTING_STARTED' },
      { text: '文献库与工作区', link: '/docs/MAIN_GUIDE' },
      { text: 'PDF 阅读与批注', link: '/docs/READER_GUIDE' },
    ],
  },
  {
    text: '查阅',
    items: [
      { text: '设置与偏好', link: '/docs/SETTINGS_GUIDE' },
      { text: '命令与快捷键', link: '/docs/COMMAND_REFERENCE' },
      { text: '常见问题', link: '/docs/TROUBLESHOOTING' },
      { text: '路线图', link: '/docs/ROADMAP' },
    ],
  },
];

export default defineConfig({
  lang: 'zh-CN',
  title: 'Zotero Neo',
  description: 'Zotero 的模块化增强工具链：键盘优先的文献查找与 PDF 阅读，以及扩展管理与配置同步。',
  base: '/Zotero-Neo/',
  srcExclude: [
    'README.md',
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
    'prototypes/**',
    'src/**',
    'tests/**',
    'tools/**',
    'vendor/**',
  ],
  vite: {
    publicDir: fileURLToPath(new URL('../assets/docs/', import.meta.url)),
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
      { text: '使用指南', link: '/docs/MAIN_GUIDE' },
      {
        text: '项目',
        items: [
          { text: '更新记录', link: '/CHANGELOG' },
          { text: '开发与调试', link: '/docs/DEVELOPMENT' },
          { text: 'GitHub', link: 'https://github.com/zhongyangchuwu/Zotero-Neo' },
        ],
      },
    ],
    sidebar: {
      '/docs/internal/': [],
      '/docs/DEVELOPMENT': [],
      '/docs/': guides,
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
        _render(source, env, md) {
          if (env.relativePath.startsWith('docs/internal/')) return '';
          const html = md.render(source, env);
          return env.frontmatter?.search === false ? '' : html;
        },
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
