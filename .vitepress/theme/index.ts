/// <reference path="../env.d.ts" />

import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import FeatureMedia from './FeatureMedia.vue';
import iconUrl from '../../assets/package/icons/icon-256x256.png';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('FeatureMedia', FeatureMedia);
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () =>
        h('img', {
          src: iconUrl,
          alt: 'Zotero Neo',
          class: 'VPImage image-src',
        }),
    }),
} satisfies Theme;
