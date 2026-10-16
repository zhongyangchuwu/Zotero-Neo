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
    text: 'Start here',
    items: [
      { text: 'Features', link: '/docs/FEATURES' },
      { text: 'Get started', link: '/docs/GETTING_STARTED' },
    ],
  },
  {
    text: 'User guide',
    items: [
      { text: 'Overview and workflows', link: '/docs/USER_GUIDE' },
      { text: 'How Neo works', link: '/docs/CONCEPTS' },
      { text: 'Library and reading lists', link: '/docs/MAIN_GUIDE' },
      { text: 'Read and navigate a PDF', link: '/docs/READER_GUIDE' },
      { text: 'Select text and annotate', link: '/docs/SELECTION_GUIDE' },
      { text: 'Capture passages to notes', link: '/docs/CAPTURE_GUIDE' },
      { text: 'Find and edit notes', link: '/docs/NOTE_GUIDE' },
      { text: 'Organize with tags', link: '/docs/TAGS' },
      { text: 'Search and navigation', link: '/docs/SEARCH_GUIDE' },
      { text: 'Shortcuts and settings', link: '/docs/SETTINGS_GUIDE' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Commands and shortcuts', link: '/docs/COMMAND_REFERENCE' },
      { text: 'Settings reference', link: '/docs/SETTINGS_REFERENCE' },
    ],
  },
  {
    text: 'Help',
    items: [{ text: 'Troubleshooting', link: '/docs/TROUBLESHOOTING' }],
  },
];

const developerSidebar = [
  {
    text: 'Developer guide',
    items: [
      { text: 'Development', link: '/docs/DEVELOPMENT' },
      { text: 'Documentation authoring', link: '/docs/DOCUMENTATION_AUTHORING' },
    ],
  },
  {
    text: 'Design and architecture',
    items: [
      { text: 'Architecture', link: '/docs/ARCHITECTURE' },
      { text: 'Interaction model', link: '/docs/INTERACTION_MODEL' },
      { text: 'Input methods and text entry', link: '/docs/INPUT_METHODS' },
      { text: 'Navigation history design', link: '/docs/NAVIGATION_HISTORY_DESIGN' },
    ],
  },
  {
    text: 'Project material (Chinese source)',
    items: [
      { text: 'v0.2 candidate acceptance (Chinese source)', link: '/docs/V0_2_ACCEPTANCE' },
      { text: 'Recording guide (Chinese source)', link: '/docs/RECORDING_GUIDE' },
    ],
  },
];

export default defineConfig({
  lang: 'en',
  title: 'Zotero Neo',
  description:
    'Keyboard-friendly tools for browsing your Zotero library, reading PDFs, and working with notes.',
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
      { text: 'Features', link: '/docs/FEATURES' },
      { text: 'Get started', link: '/docs/GETTING_STARTED' },
      { text: 'User guide', link: '/docs/USER_GUIDE' },
      {
        text: 'Reference',
        items: [
          { text: 'Commands and shortcuts', link: '/docs/COMMAND_REFERENCE' },
          { text: 'Settings reference', link: '/docs/SETTINGS_REFERENCE' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Changelog', link: '/CHANGELOG' },
          { text: 'Roadmap', link: '/docs/ROADMAP' },
          { text: 'Development', link: '/docs/DEVELOPMENT' },
          { text: 'GitHub', link: 'https://github.com/zhongyangchuwu/Zotero-Neo' },
        ],
      },
    ],
    sidebar: {
      '/': userSidebar,
      '/docs/DEVELOPMENT': developerSidebar,
      '/docs/DOCUMENTATION_AUTHORING': developerSidebar,
      '/docs/ARCHITECTURE': developerSidebar,
      '/docs/INTERACTION_MODEL': developerSidebar,
      '/docs/INPUT_METHODS': developerSidebar,
      '/docs/NAVIGATION_HISTORY_DESIGN': developerSidebar,
      '/docs/V0_2_ACCEPTANCE': developerSidebar,
      '/docs/RECORDING_GUIDE': developerSidebar,
    },
    outline: {
      label: 'On this page',
      level: [2, 3],
    },
    editLink: {
      pattern: 'https://github.com/zhongyangchuwu/Zotero-Neo/edit/main/:path',
      text: 'Edit this page on GitHub',
    },
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
    lastUpdated: {
      text: 'Last updated',
    },
    darkModeSwitchLabel: 'Appearance',
    lightModeSwitchTitle: 'Switch to light theme',
    darkModeSwitchTitle: 'Switch to dark theme',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Return to top',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search',
              },
              modal: {
                displayDetails: 'Show detailed results',
                resetButtonTitle: 'Clear search',
                backButtonTitle: 'Close search',
                noResultsText: 'No results found',
                footer: {
                  selectText: 'Select',
                  selectKeyAriaLabel: 'Enter',
                  navigateText: 'Navigate',
                  navigateUpKeyAriaLabel: 'Up arrow',
                  navigateDownKeyAriaLabel: 'Down arrow',
                  closeText: 'Close',
                  closeKeyAriaLabel: 'Escape',
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
