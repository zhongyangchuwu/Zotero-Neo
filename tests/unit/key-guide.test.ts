import { describe, expect, it } from 'vitest';

import { ACTION_LABELS } from '../../src/input/actions';
import { KEY_GUIDE_CONFIG, keyGuideLanguage } from '../../src/input/key-guide-config';
import {
  DEFAULT_BINDINGS,
  DEFAULT_PREFIX_BINDINGS,
  parseBindingKey,
  resolveBindings,
  type BindingMap,
} from '../../src/input/bindings';
import { advanceInput, resolveInputTimeout } from '../../src/input/engine';
import {
  formatGuideKey,
  formatGuidePrefix,
  guideEntries,
  isGuidePrefix,
  isLeaderPrefix,
  leaderGuideEntries,
} from '../../src/input/key-guide';
import { appendInputKey, bindingSequenceTokens } from '../../src/input/key-sequence';

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
      {
        key: 'f',
        label: DEFAULT_PREFIX_BINDINGS['reader-normal:<Space>f'].label.en,
        isGroup: true,
      },
      {
        key: 'y',
        label: DEFAULT_PREFIX_BINDINGS['reader-normal:<Space>y'].label.en,
        isGroup: true,
      },
    ]);
  });

  it('uses every visible built-in PrefixBinding label from resolved bindings', () => {
    const resolved = resolveBindings('');
    const entries = guideEntries(resolved, 'main-normal', ' ', 'en');
    expect(entries).toContainEqual({ key: 's', label: 'Selection', isGroup: true });
    expect(entries).toContainEqual({
      key: ',',
      label: ACTION_LABELS.switchTab.en,
      isGroup: false,
    });

    for (const [key, node] of Object.entries(DEFAULT_PREFIX_BINDINGS)) {
      const binding = parseBindingKey(key);
      if (!binding) throw new Error(`Invalid built-in prefix: ${key}`);
      const tokens = bindingSequenceTokens(binding.sequence);
      if (!tokens) throw new Error(`Invalid built-in sequence: ${key}`);
      if (tokens.length < 2) continue; // No guide exists before the first key.
      const parent = tokens.slice(0, -1).reduce(appendInputKey, '');
      const next = tokens[tokens.length - 1];
      for (const language of ['en', 'zh-CN'] as const) {
        const group = guideEntries(resolved, binding.mode, parent, language).find(
          (entry) => entry.key === next,
        );
        expect(group, `Missing ${language} guide group: ${key}`).toEqual({
          key: next,
          label: node.label[language],
          isGroup: true,
        });
        expect(group?.label).not.toMatch(/More commands|更多命令|^Prefix /);
      }
    }
  });

  it('shows generated labels for custom mode-owned prefixes and leaves other modes intact', () => {
    const resolved = resolveBindings(
      JSON.stringify({ 'main-select:<Space>xy': 'mainSelectFinish' }),
    );
    expect(guideEntries(resolved, 'main-select', ' ', 'en')).toEqual([
      { key: 'x', label: 'Prefix <Space>x', isGroup: true },
    ]);
    expect(guideEntries(resolved, 'main-select', ' x', 'zh-CN')).toEqual([
      { key: 'y', label: ACTION_LABELS.mainSelectFinish['zh-CN'], isGroup: false },
    ]);
    expect(isGuidePrefix(resolved, 'reader-select', ' ')).toBe(false);
    expect(guideEntries(resolved, 'reader-select', ' ', 'en')).toEqual([]);
    expect(guideEntries(resolved, 'main-normal', ' ', 'en')).not.toContainEqual({
      key: 'x',
      label: 'Prefix <Space>x',
      isGroup: true,
    });
  });

  it('drops unbound mode-local namespaces without borrowing another mode', () => {
    const resolved = resolveBindings('{"main-select:gg":null}');
    expect(isGuidePrefix(resolved, 'main-select', 'g')).toBe(false);
    expect(guideEntries(resolved, 'main-select', 'g', 'en')).toEqual([]);
    expect(guideEntries(resolved, 'main-normal', 'g', 'en')).toContainEqual({
      key: 'g',
      label: ACTION_LABELS.mainNavFirst.en,
      isGroup: false,
    });
  });

  it('keeps ambiguous override timeout while presenting a namespace and its child actions', () => {
    const resolved = resolveBindings(JSON.stringify({ 'main-normal:<Space>f': 'switchTab' }));
    expect(guideEntries(resolved, 'main-normal', ' ', 'en')).toContainEqual({
      key: 'f',
      label: DEFAULT_PREFIX_BINDINGS['main-normal:<Space>f'].label.en,
      isGroup: true,
    });
    expect(guideEntries(resolved, 'main-normal', ' f', 'en')).toContainEqual({
      key: 'f',
      label: ACTION_LABELS.findAllItems.en,
      isGroup: false,
    });

    const start = advanceInput(
      {
        mode: 'main-normal',
        keyBuffer: '',
        countBuffer: '',
        bindings: resolved,
        allowCountPrefix: true,
      },
      ' ',
    );
    const pending = advanceInput(
      { ...start.state, bindings: resolved, allowCountPrefix: true },
      'f',
    );
    expect(pending).toMatchObject({ kind: 'pending', timeoutMs: 800, timeoutAction: 'switchTab' });
    if (pending.kind !== 'pending') throw new Error('Expected ambiguous prefix');
    expect(resolveInputTimeout(pending)).toMatchObject({ kind: 'execute', action: 'switchTab' });
    expect(
      advanceInput({ ...pending.state, bindings: resolved, allowCountPrefix: true }, 'f'),
    ).toMatchObject({ kind: 'execute', action: 'findAllItems' });
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
    expect(DEFAULT_PREFIX_BINDINGS['main-normal:<Space>t'].label.en).toBe('Tags');
    expect(DEFAULT_PREFIX_BINDINGS['main-normal:<Space>p'].label.en).toBe('Neo');
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
