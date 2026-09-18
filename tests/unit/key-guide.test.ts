import { describe, expect, it } from 'vitest';

import { KEY_GUIDE_CONFIG, keyGuideLanguage } from '../../src/input/key-guide-config';
import { DEFAULT_BINDINGS, type BindingMap } from '../../src/input/bindings';
import {
  formatGuideKey,
  formatGuidePrefix,
  isLeaderPrefix,
  leaderGuideEntries,
} from '../../src/input/key-guide';

const bindings: BindingMap = {
  'reader-normal: e': 'toggleReaderSidebarOutline',
  'reader-normal: ff': 'findAllItems',
  'reader-normal: fc': 'findCollectionItems',
  'reader-normal: ,': 'switchTab',
  'reader-normal: yy': 'mainYankCitekey',
};

describe('leader guide projection', () => {
  it('projects only executable Space-leader continuations and group metadata', () => {
    expect(leaderGuideEntries(bindings, 'reader-normal', ' ', 'en')).toEqual([
      { key: ',', label: KEY_GUIDE_CONFIG.actionLabels.switchTab!.en, isGroup: false },
      {
        key: 'e',
        label: KEY_GUIDE_CONFIG.actionLabels.toggleReaderSidebarOutline!.en,
        isGroup: false,
      },
      { key: 'f', label: KEY_GUIDE_CONFIG.groupLabels.f.en, isGroup: true },
      { key: 'y', label: KEY_GUIDE_CONFIG.groupLabels.y.en, isGroup: true },
    ]);
  });

  it('updates the valid subtree for nested prefixes and resolves labels in Chinese', () => {
    expect(leaderGuideEntries(bindings, 'reader-normal', ' f', 'zh-CN')).toEqual([
      {
        key: 'c',
        label: KEY_GUIDE_CONFIG.actionLabels.findCollectionItems!['zh-CN'],
        isGroup: false,
      },
      {
        key: 'f',
        label: KEY_GUIDE_CONFIG.actionLabels.findAllItems!['zh-CN'],
        isGroup: false,
      },
    ]);
  });

  it('uses custom bindings as its only command source and hides non-leader prefixes', () => {
    const custom: BindingMap = {
      'main-normal: xx': 'switchTab',
      'main-normal: xy': 'findAllItems',
    };

    expect(leaderGuideEntries(custom, 'main-normal', ' ', 'en')).toEqual([
      { key: 'x', label: KEY_GUIDE_CONFIG.genericGroupLabel.en, isGroup: true },
    ]);
    expect(leaderGuideEntries(custom, 'main-normal', ' x', 'en')).toEqual([
      { key: 'x', label: KEY_GUIDE_CONFIG.actionLabels.switchTab!.en, isGroup: false },
      { key: 'y', label: KEY_GUIDE_CONFIG.actionLabels.findAllItems!.en, isGroup: false },
    ]);
    expect(leaderGuideEntries(custom, 'main-normal', 'g', 'en')).toEqual([]);
  });

  it('keeps the runtime defaults alongside the display metadata', () => {
    expect(KEY_GUIDE_CONFIG.defaultDelayMs).toBe(200);
    expect(KEY_GUIDE_CONFIG.maxDelayMs).toBe(1000);
    expect(KEY_GUIDE_CONFIG.idleTimeoutMs).toBe(5000);
    expect(KEY_GUIDE_CONFIG.defaultFontSizePx).toBe(15);
  });

  it('projects the explicit Tag action defaults without reviving retired picker aliases', () => {
    expect(DEFAULT_BINDINGS['reader-normal: ta']).toBe('addTag');
    expect(DEFAULT_BINDINGS['reader-normal: tr']).toBe('removeTag');
    expect(DEFAULT_BINDINGS['main-normal: ta']).toBe('addTag');
    expect(DEFAULT_BINDINGS['main-normal: tr']).toBe('removeTag');
    expect(DEFAULT_BINDINGS['main-normal: tf']).toBe('toggleTagFilter');
    expect(DEFAULT_BINDINGS['main-normal: tc']).toBe('clearTagFilters');
    expect('main-normal: fT' in DEFAULT_BINDINGS).toBe(false);
    expect(KEY_GUIDE_CONFIG.groupLabels.t.en).toBe('Tags');
  });

  it('uses an explicit language first and otherwise follows the host locale', () => {
    expect(keyGuideLanguage('', 'zh-TW')).toBe('zh-CN');
    expect(keyGuideLanguage('en', 'zh-CN')).toBe('en');
    expect(keyGuideLanguage('en', 'en-US')).toBe('en');
  });

  it('formats leader breadcrumbs without changing the persisted key syntax', () => {
    expect(isLeaderPrefix(' ')).toBe(true);
    expect(isLeaderPrefix(' f')).toBe(true);
    expect(isLeaderPrefix('f')).toBe(false);
    expect(formatGuideKey(' ')).toBe('SPC');
    expect(formatGuideKey('b')).toBe('b');
    expect(formatGuideKey('B')).toBe('B');
    expect(formatGuidePrefix(' f')).toBe('SPC › f');
  });
});
