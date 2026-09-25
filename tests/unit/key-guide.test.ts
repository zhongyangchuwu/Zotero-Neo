import { describe, expect, it } from 'vitest';

import { ACTION_LABELS } from '../../src/input/actions';
import { KEY_GUIDE_CONFIG, keyGuideLanguage } from '../../src/input/key-guide-config';
import { DEFAULT_BINDINGS, type BindingMap } from '../../src/input/bindings';
import {
  formatGuideKey,
  formatGuidePrefix,
  guideEntries,
  isGuidePrefix,
  isLeaderPrefix,
  leaderGuideEntries,
} from '../../src/input/key-guide';

const bindings: BindingMap = {
  'reader-normal:<Space>e': 'toggleReaderSidebarOutline',
  'reader-normal:<Space>ff': 'findAllItems',
  'reader-normal:<Space>fc': 'findCollectionItems',
  'reader-normal:<Space>,': 'switchTab',
  'reader-normal:<Space>yy': 'mainYankCitekey',
};

describe('leader guide projection', () => {
  it('projects only executable Space-leader continuations and group metadata', () => {
    expect(leaderGuideEntries(bindings, 'reader-normal', ' ', 'en')).toEqual([
      { key: ',', label: ACTION_LABELS.switchTab.en, isGroup: false },
      {
        key: 'e',
        label: ACTION_LABELS.toggleReaderSidebarOutline.en,
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
        label: ACTION_LABELS.findCollectionItems['zh-CN'],
        isGroup: false,
      },
      {
        key: 'f',
        label: ACTION_LABELS.findAllItems['zh-CN'],
        isGroup: false,
      },
    ]);
  });

  it('uses resolved bindings as its only source for ordinary pending prefixes', () => {
    const custom: BindingMap = {
      'main-normal:xx': 'switchTab',
      'main-normal:xy': 'findAllItems',
    };

    expect(isGuidePrefix(custom, 'main-normal', 'x')).toBe(true);
    expect(guideEntries(custom, 'main-normal', 'x', 'en')).toEqual([
      { key: 'x', label: ACTION_LABELS.switchTab.en, isGroup: false },
      { key: 'y', label: ACTION_LABELS.findAllItems.en, isGroup: false },
    ]);
    expect(guideEntries(custom, 'main-normal', 'g', 'en')).toEqual([]);
    expect(leaderGuideEntries(custom, 'main-normal', 'x', 'en')).toEqual([]);
  });

  it('treats exact named keys as distinct from printable prefixes', () => {
    const named: BindingMap = {
      'main-normal:e': 'mainFocusTree',
      'main-normal:<Enter>': 'mainActivate',
      'main-normal:yy': 'mainYankCitekey',
      'main-normal:y': 'switchTab',
    };

    expect(isGuidePrefix(named, 'main-normal', 'e')).toBe(false);
    expect(guideEntries(named, 'main-normal', 'e', 'en')).toEqual([]);

    expect(isGuidePrefix(named, 'main-normal', 'y')).toBe(true);
    expect(guideEntries(named, 'main-normal', 'y', 'en')).toEqual([
      {
        key: 'y',
        label: ACTION_LABELS.mainYankCitekey.en,
        isGroup: false,
      },
    ]);
  });

  it('keeps the runtime defaults alongside the display metadata', () => {
    expect(KEY_GUIDE_CONFIG.defaultDelayMs).toBe(200);
    expect(KEY_GUIDE_CONFIG.maxDelayMs).toBe(1000);
    expect(KEY_GUIDE_CONFIG.idleTimeoutMs).toBe(5000);
    expect(KEY_GUIDE_CONFIG.defaultFontSizePx).toBe(15);
  });

  it('projects the explicit Tag action defaults without reviving retired picker aliases', () => {
    expect(DEFAULT_BINDINGS['reader-normal:<Space>ta']).toBe('addTag');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>tr']).toBe('removeTag');
    expect(DEFAULT_BINDINGS['main-normal:<Space>ta']).toBe('addTag');
    expect(DEFAULT_BINDINGS['main-normal:<Space>tr']).toBe('removeTag');
    expect(DEFAULT_BINDINGS['main-normal:<Space>tf']).toBe('toggleTagFilter');
    expect(DEFAULT_BINDINGS['main-normal:<Space>tc']).toBe('clearTagFilters');
    expect('main-normal: fT' in DEFAULT_BINDINGS).toBe(false);
    expect(KEY_GUIDE_CONFIG.groupLabels.t.en).toBe('Tags');
  });

  it('uses an explicit language first and otherwise follows the host locale', () => {
    expect(keyGuideLanguage('', 'zh-TW')).toBe('zh-CN');
    expect(keyGuideLanguage('en', 'zh-CN')).toBe('en');
    expect(keyGuideLanguage('en', 'en-US')).toBe('en');
  });

  it('formats both leader and direct-prefix breadcrumbs without changing persisted syntax', () => {
    expect(isLeaderPrefix(' ')).toBe(true);
    expect(isLeaderPrefix(' f')).toBe(true);
    expect(isLeaderPrefix('f')).toBe(false);
    expect(formatGuideKey(' ')).toBe('SPC');
    expect(formatGuideKey('b')).toBe('b');
    expect(formatGuideKey('B')).toBe('B');
    expect(formatGuideKey('ctrl+d')).toBe('<C-d>');
    expect(formatGuideKey('enter')).toBe('<Enter>');
    expect(formatGuidePrefix(' f')).toBe('SPC › f');
    expect(formatGuidePrefix(' tf')).toBe('SPC › t › f');
  });
});
