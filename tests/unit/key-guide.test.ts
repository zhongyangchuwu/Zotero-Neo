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
  'normal: e': 'toggleReaderSidebarOutline',
  'normal: ff': 'mainFuzzyAll',
  'normal: fc': 'mainFuzzyCollection',
  'normal: ft': 'mainTabPick',
  'normal: yy': 'mainYankCitekey',
};

describe('leader guide projection', () => {
  it('projects only executable Space-leader continuations and group metadata', () => {
    expect(leaderGuideEntries(bindings, 'normal', ' ', 'en')).toEqual([
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
    expect(leaderGuideEntries(bindings, 'normal', ' f', 'zh-CN')).toEqual([
      {
        key: 'c',
        label: KEY_GUIDE_CONFIG.actionLabels.mainFuzzyCollection!['zh-CN'],
        isGroup: false,
      },
      {
        key: 'f',
        label: KEY_GUIDE_CONFIG.actionLabels.mainFuzzyAll!['zh-CN'],
        isGroup: false,
      },
      {
        key: 't',
        label: KEY_GUIDE_CONFIG.actionLabels.mainTabPick!['zh-CN'],
        isGroup: false,
      },
    ]);
  });

  it('uses custom bindings as its only command source and hides non-leader prefixes', () => {
    const custom: BindingMap = {
      'main: xx': 'mainTabPick',
      'main: xy': 'mainFuzzyAll',
    };

    expect(leaderGuideEntries(custom, 'main', ' ', 'en')).toEqual([
      { key: 'x', label: KEY_GUIDE_CONFIG.genericGroupLabel.en, isGroup: true },
    ]);
    expect(leaderGuideEntries(custom, 'main', ' x', 'en')).toEqual([
      { key: 'x', label: KEY_GUIDE_CONFIG.actionLabels.mainTabPick!.en, isGroup: false },
      { key: 'y', label: KEY_GUIDE_CONFIG.actionLabels.mainFuzzyAll!.en, isGroup: false },
    ]);
    expect(leaderGuideEntries(custom, 'main', 'g', 'en')).toEqual([]);
  });

  it('keeps the runtime defaults alongside the display metadata', () => {
    expect(KEY_GUIDE_CONFIG.defaultDelayMs).toBe(200);
    expect(KEY_GUIDE_CONFIG.maxDelayMs).toBe(1000);
    expect(KEY_GUIDE_CONFIG.idleTimeoutMs).toBe(5000);
    expect(KEY_GUIDE_CONFIG.defaultFontSizePx).toBe(15);
  });

  it('keeps tab and picker groups without removed native-main search leaves', () => {
    expect(DEFAULT_BINDINGS['normal: ft']).toBe('mainTabPick');
    expect(DEFAULT_BINDINGS['normal: td']).toBe('mainClosePDF');
    expect('normal: tp' in DEFAULT_BINDINGS).toBe(false);
    expect('normal: o' in DEFAULT_BINDINGS).toBe(false);
    expect('normal: q' in DEFAULT_BINDINGS).toBe(false);
    expect('main: fa' in DEFAULT_BINDINGS).toBe(false);
    expect('main: fs' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['main: ft']).toBe('mainTabPick');
    expect(DEFAULT_BINDINGS['main: fT']).toBe('mainTagPicker');
    expect('main: tp' in DEFAULT_BINDINGS).toBe(false);
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
