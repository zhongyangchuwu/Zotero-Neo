/// <reference path="../env.d.ts" />

import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import SourceVersionNotice from './SourceVersionNotice.vue';
import bannerUrl from '../../assets/branding/zotero-neo-banner.png';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-before': () => h(SourceVersionNotice),
      'home-hero-before': () => h(SourceVersionNotice),
      'home-hero-image': () =>
        h('img', {
          src: bannerUrl,
          alt: 'Zotero Neo — Neovim-inspired keyboard layer for Zotero',
          class: 'VPImage image-src',
        }),
    }),
};
