import { describe, expect, it } from 'vitest';
import { ACTION_IDS } from '../../src/input/actions';
import {
  BINDING_CONTEXTS,
  DEFAULT_BINDINGS,
  DEFAULT_PREFIX_BINDINGS,
  bindingNodesFromActions,
  parseBindingKey,
  resolveBindings,
} from '../../src/input/bindings';
import { actionsForBindingMode } from '../../src/input/binding-capabilities';
import {
  shortcutCatalog,
  nativeShortcutCatalog,
  nativeReservation,
} from '../../src/input/shortcut-catalog';
import { guideEntries } from '../../src/input/key-guide';
import { inspectShortcut } from '../../src/input/binding-editor';
import {
  PICKER_INPUT_ACTIONS,
  PICKER_LIST_ACTIONS,
} from '../../src/main/picker/action-capabilities';
import {
  PLUGINS_INPUT_ACTIONS,
  PLUGINS_LIST_ACTIONS,
} from '../../src/modules/extensions/capabilities';
import {
  READER_OUTLINE_ACTIONS,
  READER_MARKS_ACTIONS,
  READER_ANNOTATIONS_ACTIONS,
  READER_THUMBNAILS_ACTIONS,
  isReaderActionForMode,
} from '../../src/reader/action-capabilities';

describe('unified shortcut catalog consumers', () => {
  it('projects owner capabilities for every context without creating Reader surface modes', () => {
    const owners = {
      'reader-outline': READER_OUTLINE_ACTIONS,
      'reader-marks': READER_MARKS_ACTIONS,
      'reader-annotations': READER_ANNOTATIONS_ACTIONS,
      'reader-thumbnails': READER_THUMBNAILS_ACTIONS,
      'picker-input': PICKER_INPUT_ACTIONS,
      'picker-list': PICKER_LIST_ACTIONS,
      'plugins-input': PLUGINS_INPUT_ACTIONS,
      'plugins-list': PLUGINS_LIST_ACTIONS,
    } as const;
    for (const [context, actions] of Object.entries(owners)) {
      const parsed = parseBindingKey(`${context}:x`);
      if (!parsed) throw new Error(`Missing binding context ${context}`);
      expect(actionsForBindingMode(parsed.mode)).toEqual(actions);
      expect(isReaderActionForMode('normal', 'uiNext')).toBe(false);
    }
    const catalog = shortcutCatalog(DEFAULT_BINDINGS, 'en');
    for (const context of BINDING_CONTEXTS) {
      const actions = catalog
        .filter((entry) => entry.context === context)
        .map((entry) => entry.action);
      expect(new Set(actions)).toEqual(new Set(actionsForBindingMode(context)));
      expect(actions.every((action) => ACTION_IDS.includes(action))).toBe(true);
    }
    for (const [key, action] of Object.entries(DEFAULT_BINDINGS)) {
      const binding = parseBindingKey(key);
      if (!binding) throw new Error(`Invalid default ${key}`);
      expect(actionsForBindingMode(binding.mode)).toContain(action);
    }
  });

  it('has no default exact-prefix collision and supplies an explicit namespace for every prefix', () => {
    const nodes = bindingNodesFromActions(DEFAULT_BINDINGS);
    for (const [key, node] of Object.entries(nodes)) {
      if (node.kind === 'prefix') expect(key in DEFAULT_PREFIX_BINDINGS).toBe(true);
    }
    expect('reader-normal:[' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal:]' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal:<Space>e' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal:<Space>m' in DEFAULT_BINDINGS).toBe(false);
  });

  it('projects default, custom and available unbound origins from the actual effective map', () => {
    const bindings = resolveBindings(
      JSON.stringify({
        'reader-normal:<Space>ro': null,
        'reader-normal:x': 'focusReaderOutline',
        'reader-normal:]a': null,
      }),
    );
    const catalog = shortcutCatalog(bindings, 'zh-CN');
    expect(
      catalog.find(
        (entry) => entry.context === 'reader-normal' && entry.action === 'focusReaderOutline',
      ),
    ).toMatchObject({ keys: ['x'], defaultKeys: ['<Space>ro'], source: 'custom' });
    expect(
      catalog.find(
        (entry) => entry.context === 'reader-normal' && entry.action === 'nextAnnotation',
      ),
    ).toMatchObject({ keys: [], defaultKeys: [']a'], source: 'unbound' });
    expect(
      catalog.find((entry) => entry.context === 'reader-normal' && entry.action === 'nextHeading'),
    ).toMatchObject({ keys: [']s'], source: 'default' });
    expect(
      catalog.find((entry) => entry.context === 'picker-input' && entry.action === 'uiNextPane'),
    ).toMatchObject({ keys: [], defaultKeys: [], source: 'unbound' });
    expect(
      catalog.find((entry) => entry.context === 'reader-normal' && entry.action === 'copyTarget'),
    ).toMatchObject({ group: 'reader', keys: ['y'], defaultKeys: ['y'], source: 'default' });
  });

  it('drives local guides from saved shortcut overrides', () => {
    const modified = resolveBindings('{"reader-marks:gg":null,"reader-marks:zx":"uiFirst"}');
    const entry = shortcutCatalog(modified, 'en').find(
      (candidate) => candidate.context === 'reader-marks' && candidate.action === 'uiFirst',
    );
    expect(guideEntries(modified, 'reader-marks', 'z', 'en')).toEqual([
      { key: 'x', label: entry?.label, isGroup: false },
    ]);
    expect(guideEntries(modified, 'reader-marks', 'g', 'en')).toEqual([]);
  });

  it('keeps native read-only controls outside the editable map', () => {
    expect(nativeShortcutCatalog('reader-outline', 'en')).toContainEqual(
      expect.objectContaining({ key: '<Down>', reservation: 'exclusive' }),
    );
    expect(nativeShortcutCatalog('reader-outline', 'en')).toContainEqual(
      expect.objectContaining({ key: '<Enter>', reservation: 'exclusive' }),
    );
    expect('reader-outline:<Down>' in DEFAULT_BINDINGS).toBe(false);
    expect(nativeReservation('reader-outline', '<Down>x')).toBe('exclusive');
    expect(nativeReservation('reader-outline', '<C-S-Down>')).toBe('exclusive');
    expect(nativeReservation('reader-marks', '<C-Tab>')).toBe('exclusive');
    expect(nativeReservation('picker-input', 'xy')).toBe('exclusive');
    expect(nativeReservation('picker-input', '<C-v>')).toBe('exclusive');
    expect(nativeReservation('picker-input', '<Down>')).toBeNull();
    expect(nativeReservation('picker-list', 'xy')).toBeNull();
  });
  it('rejects native continuation tokens while accepting configurable multi-key controls', () => {
    for (const key of [
      '<F1>j',
      '<F1><Tab>',
      '<F1><C-v>',
      '<F1><Left>',
      '<C-Insert>',
      '<S-Insert>',
      '<F1><C-Insert>',
      '<F1><S-Insert>',
    ]) {
      expect(
        inspectShortcut({}, { context: 'picker-input', action: 'uiConfirm', previous: null }, key),
      ).toEqual({ problem: 'native' });
      expect(
        inspectShortcut(
          {},
          { context: 'plugins-input', action: 'uiFocusList', previous: null },
          key,
        ),
      ).toEqual({ problem: 'native' });
    }
    expect(
      inspectShortcut(
        {},
        { context: 'picker-input', action: 'uiConfirm', previous: null },
        '<F1><F2>',
      ),
    ).toMatchObject({ sequence: '<F1><F2>' });
  });
  it('rejects native Outline Enter overrides and prefixes while keeping alternate confirmation keys available', () => {
    for (const key of ['<Enter>', '<Enter>x', '<F1><Enter>', '<C-Enter>']) {
      expect(
        inspectShortcut({}, { context: 'reader-outline', action: 'uiCancel', previous: null }, key),
      ).toEqual({ problem: 'native' });
    }
    expect(
      inspectShortcut(
        {},
        { context: 'reader-outline', action: 'uiConfirm', previous: null },
        '<F2>',
      ),
    ).toMatchObject({ sequence: '<F2>' });
    expect(
      shortcutCatalog(DEFAULT_BINDINGS, 'en').find(
        (entry) => entry.context === 'reader-outline' && entry.action === 'uiConfirm',
      ),
    ).toMatchObject({ keys: [], defaultKeys: [], source: 'unbound' });
  });
});
