/// <reference path="../env.d.ts" />

import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import FeatureMedia from './FeatureMedia.vue';
import bannerUrl from '../../assets/branding/zotero-neo-banner.png';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('FeatureMedia', FeatureMedia);
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () =>
        h('img', {
          src: bannerUrl,
          alt: 'Zotero Neo — Neovim-inspired keyboard layer for Zotero',
          class: 'VPImage image-src',
        }),
    }),
} satisfies Theme;
