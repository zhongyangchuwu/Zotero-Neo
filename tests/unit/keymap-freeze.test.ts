import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINDINGS,
  DEFAULT_PREFIX_BINDINGS,
  bindingNodesFromActions,
  bindingsForMode,
  migrateLegacyBindingOverrides,
  parseBindingKey,
  resolveBindings,
  type BindingMap,
  type Mode,
} from '../../src/input/bindings';
import { advanceInput, resolveInputTimeout } from '../../src/input/engine';
import {
  bindingSequenceIsStrictPrefix,
  bindingSequenceTokens,
  serializeBindingTokens,
} from '../../src/input/key-sequence';

function strictPrefixPairs(bindings: BindingMap): string[] {
  const byMode = new Map<Mode, string[]>();
  for (const key of Object.keys(bindings)) {
    const parsed = parseBindingKey(key);
    if (!parsed) continue;
    const sequences = byMode.get(parsed.mode) ?? [];
    sequences.push(parsed.sequence);
    byMode.set(parsed.mode, sequences);
  }

  const pairs: string[] = [];
  for (const [mode, sequences] of byMode) {
    for (const exact of sequences) {
      for (const longer of sequences) {
        if (bindingSequenceIsStrictPrefix(exact, longer))
          pairs.push(`${mode}:${exact} -> ${longer}`);
      }
    }
  }
  return pairs.sort();
}

function press(mode: Mode, key: string, bindings: BindingMap = resolveBindings('')) {
  return advanceInput(
    {
      mode,
      keyBuffer: '',
      countBuffer: '',
      bindings,
      allowCountPrefix:
        mode === 'reader-normal' || mode === 'main-normal' || mode === 'note-normal',
    },
    key,
  );
}

describe('0.1.0 default keymap freeze', () => {
  it('contains no exact default binding that is also a longer-command prefix', () => {
    expect(strictPrefixPairs(DEFAULT_BINDINGS)).toEqual([]);

    const mainSelect = bindingsForMode(DEFAULT_BINDINGS, 'main-select');
    expect(strictPrefixPairs(mainSelect)).toEqual([]);
  });

  it('keeps non-Normal mode keymaps exact with no sibling-mode inheritance', () => {
    const mainVisual = bindingsForMode(DEFAULT_BINDINGS, 'main-select');
    const readerVisual = bindingsForMode(DEFAULT_BINDINGS, 'reader-select');
    const readerInsert = bindingsForMode(DEFAULT_BINDINGS, 'reader-insert');
    const noteInsert = bindingsForMode(DEFAULT_BINDINGS, 'note-insert');

    expect(press('main-select', ' ', mainVisual)).toMatchObject({ kind: 'pass' });
    expect(press('main-select', 'd', mainVisual)).toMatchObject({ kind: 'pass' });
    expect(press('reader-select', ':', readerVisual)).toMatchObject({ kind: 'pass' });
    expect(press('reader-insert', ' ', readerInsert)).toMatchObject({ kind: 'pass' });
    expect(press('note-insert', ':', noteInsert)).toMatchObject({ kind: 'pass' });
    expect(press('note-insert', 'escape', noteInsert)).toMatchObject({
      kind: 'execute',
      action: 'exitMode',
    });
  });

  it('keeps Main native View search actions under the shared Space Find group', () => {
    expect(DEFAULT_BINDINGS['main-normal:<Space>fq']).toBe('mainQuickSearch');
    expect(DEFAULT_BINDINGS['main-normal:<Space>fa']).toBe('mainAdvancedSearch');
    expect(press('main-normal', ' ')).toMatchObject({ kind: 'pending' });
  });

  it('resolves Space p s to Neo Settings in Main, Reader, and Note without a strict-prefix collision', () => {
    expect(DEFAULT_BINDINGS['main-normal:<Space>pp']).toBe('managePlugins');
    expect(DEFAULT_BINDINGS['main-normal:<Space>ps']).toBe('openNeoSettings');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>pp']).toBe('managePlugins');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>ps']).toBe('openNeoSettings');
    expect(DEFAULT_BINDINGS['note-normal:<Space>pp']).toBe('managePlugins');
    expect(DEFAULT_BINDINGS['note-normal:<Space>ps']).toBe('openNeoSettings');
    const bindings = resolveBindings('');
    for (const mode of ['main-normal', 'reader-normal', 'note-normal'] as const) {
      const start = advanceInput(
        { mode, keyBuffer: '', countBuffer: '', bindings, allowCountPrefix: true },
        ' ',
      );
      const prefix = advanceInput({ ...start.state, mode, bindings, allowCountPrefix: true }, 'p');
      expect(prefix.kind).toBe('pending');
      expect(
        advanceInput({ ...prefix.state, mode, bindings, allowCountPrefix: true }, 's'),
      ).toMatchObject({ kind: 'execute', action: 'openNeoSettings' });
    }
  });

  it('keeps newly added defaults on first resolution with existing compact overrides', () => {
    const bindings = resolveBindings('{"main-normal:q":"openCommandPalette"}');
    expect(bindings['main-normal:<Space>ps']).toBe('openNeoSettings');
    expect(bindings['reader-normal:<Space>ps']).toBe('openNeoSettings');
    expect(bindings['note-normal:<Space>ps']).toBe('openNeoSettings');
  });

  it('shares collection membership keys with Reader item context', () => {
    expect(DEFAULT_BINDINGS['reader-normal:<Space>ca']).toBe('addToCollection');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>cr']).toBe('removeFromCollection');
  });

  it('shares collection membership under the Space c group', () => {
    expect(DEFAULT_BINDINGS['main-normal:<Space>ca']).toBe('addToCollection');
    expect(DEFAULT_BINDINGS['main-normal:<Space>cr']).toBe('removeFromCollection');
    expect(press('main-normal', ' ')).toMatchObject({ kind: 'pending' });
  });

  it('shares gr return-context navigation with Reader', () => {
    expect(DEFAULT_BINDINGS['reader-normal:gr']).toBe('mainReturnContext');
    const bindings = resolveBindings('');
    const pending = press('reader-normal', 'g', bindings);
    expect(pending).toMatchObject({ kind: 'pending' });
    const next = advanceInput(
      {
        ...pending.state,
        bindings,
        allowCountPrefix: true,
      },
      'r',
    );
    expect(next).toMatchObject({
      kind: 'execute',
      action: 'mainReturnContext',
    });
  });

  it('keeps Main return context under the g prefix', () => {
    expect(DEFAULT_BINDINGS['main-normal:gr']).toBe('mainReturnContext');
    const bindings = resolveBindings('');
    const pending = press('main-normal', 'g', bindings);
    expect(pending).toMatchObject({ kind: 'pending' });
    const next = advanceInput(
      {
        ...pending.state,
        bindings,
        allowCountPrefix: true,
      },
      'r',
    );
    expect(next).toMatchObject({
      kind: 'execute',
      action: 'mainReturnContext',
    });
  });

  it('reserves Vim-style Main local find keys without colliding with direct prefixes', () => {
    expect(DEFAULT_BINDINGS['main-normal:/']).toBe('openSearch');
    expect(DEFAULT_BINDINGS['main-normal:n']).toBe('findNext');
    expect(DEFAULT_BINDINGS['main-normal:N']).toBe('findPrevious');
    expect(press('main-normal', '/')).toMatchObject({ kind: 'execute', action: 'openSearch' });
    expect(press('main-normal', 'n')).toMatchObject({ kind: 'execute', action: 'findNext' });
    expect(press('main-normal', 'N')).toMatchObject({ kind: 'execute', action: 'findPrevious' });
  });

  it('uses Space only as Main leader and s as the persistent-set operation', () => {
    expect(DEFAULT_BINDINGS['main-normal:s']).toBe('mainToggleSelection');
    expect(DEFAULT_BINDINGS['main-select:s']).toBe('mainSelectFinish');
    expect(DEFAULT_BINDINGS['main-normal:<Space>ss']).toBe('manageSelection');
    expect(DEFAULT_BINDINGS['main-normal:<Space>sc']).toBe('mainClearSelection');
    expect(DEFAULT_BINDINGS['main-normal:<Esc>']).toBe('mainCancelTarget');
    expect('main-normal:<Space>' in DEFAULT_BINDINGS).toBe(false);
    expect('main-select:<Space>' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['main-normal:<Space>ta']).toBe('addTag');
    expect(DEFAULT_BINDINGS['main-normal:<Space>ff']).toBe('findAllItems');
    expect(DEFAULT_BINDINGS['main-select:v']).toBe('mainSelectCancel');
    expect(DEFAULT_BINDINGS['main-select:<Esc>']).toBe('mainSelectCancel');
    expect(press('main-normal', 's')).toMatchObject({
      kind: 'execute',
      action: 'mainToggleSelection',
    });
    expect(press('main-normal', 'escape')).toMatchObject({
      kind: 'execute',
      action: 'mainCancelTarget',
    });
    expect(press('main-normal', ' ')).toMatchObject({ kind: 'pending' });

    const visualBindings = bindingsForMode(DEFAULT_BINDINGS, 'main-select');
    expect(press('main-select', 's', visualBindings)).toMatchObject({
      kind: 'execute',
      action: 'mainSelectFinish',
    });
    expect(press('main-select', ' ', visualBindings)).toMatchObject({ kind: 'pass' });
  });

  it('does not confuse named keys with printable prefixes', () => {
    const bindings: BindingMap = {
      'main-normal:e': 'mainFocusTree',
      'main-normal:<Enter>': 'mainActivate',
      'main-normal:<Esc>': 'mainSelectCancel',
      'main-normal:d': 'mainNavDown',
      'main-normal:<Del>': 'mainTrashItems',
    };

    expect(strictPrefixPairs(bindings)).toEqual([]);
    expect(press('main-normal', 'e', bindings)).toMatchObject({
      kind: 'execute',
      action: 'mainFocusTree',
    });
    expect(press('main-normal', 'enter', bindings)).toMatchObject({
      kind: 'execute',
      action: 'mainActivate',
    });
    expect(press('main-normal', 'd', bindings)).toMatchObject({
      kind: 'execute',
      action: 'mainNavDown',
    });
    expect(press('main-normal', 'delete', bindings)).toMatchObject({
      kind: 'execute',
      action: 'mainTrashItems',
    });
  });

  it('keeps primary Reader yank/copy keys immediate', () => {
    expect(press('reader-normal', 'y')).toMatchObject({
      kind: 'execute',
      action: 'yankAnnotation',
      count: 0,
    });
    expect(press('reader-normal', 'Y')).toMatchObject({
      kind: 'execute',
      action: 'yankAnnotationComment',
      count: 0,
    });
    expect(press('reader-select', 'y')).toMatchObject({
      kind: 'execute',
      action: 'copySelection',
      count: 0,
    });
  });

  it('retires development-era yy defaults instead of preserving them as overrides', () => {
    const migrated = migrateLegacyBindingOverrides(
      JSON.stringify({
        'reader-normal:yy': 'yankAnnotationComment',
        'reader-select:yy': 'yankParagraph',
      }),
    );

    expect(migrated).toBe('');
    const bindings = resolveBindings(migrated);
    expect(bindings['reader-normal:Y']).toBe('yankAnnotationComment');
    expect(bindings['reader-normal:yy']).toBeUndefined();
    expect(bindings['reader-select:yy']).toBeUndefined();
  });
});

describe('first-class binding nodes', () => {
  it('represents every built-in strict prefix as a named, non-executing node', () => {
    const nodes = bindingNodesFromActions(DEFAULT_BINDINGS);
    for (const [key, action] of Object.entries(DEFAULT_BINDINGS)) {
      expect(nodes[key]).toEqual({ kind: 'action', action });
      const parsed = parseBindingKey(key);
      if (!parsed) throw new Error(`Invalid default binding: ${key}`);
      const tokens = bindingSequenceTokens(parsed.sequence);
      if (!tokens) throw new Error(`Invalid default sequence: ${key}`);
      for (let length = 1; length < tokens.length; length += 1) {
        const prefix = `${parsed.mode}:${serializeBindingTokens(tokens.slice(0, length))}`;
        expect(
          Object.hasOwn(DEFAULT_PREFIX_BINDINGS, prefix),
          `Missing explicit label: ${prefix}`,
        ).toBe(true);
        expect(nodes[prefix], `Missing namespace for ${key}`).toMatchObject({ kind: 'prefix' });
      }
    }
    for (const [key, node] of Object.entries(DEFAULT_PREFIX_BINDINGS)) {
      expect(nodes[key]).toBe(node);
      expect(node.label.en).not.toBe('');
      const parsed = parseBindingKey(key);
      if (!parsed) throw new Error(`Invalid default prefix: ${key}`);
      expect(
        Object.keys(DEFAULT_BINDINGS).some((childKey) => {
          const child = parseBindingKey(childKey);
          return (
            child?.mode === parsed?.mode &&
            bindingSequenceIsStrictPrefix(parsed.sequence, child.sequence)
          );
        }),
      ).toBe(true);
    }
  });

  it('waits on a PrefixBinding without executing, then executes its child ActionBinding', () => {
    const bindings = resolveBindings('');
    const nodes = bindingNodesFromActions(bindings);
    expect(nodes['main-normal:<Space>f']).toEqual({
      kind: 'prefix',
      label: { en: 'Find', 'zh-CN': '查找' },
    });
    let pending = press('main-normal', ' ', bindings);
    expect(pending).toMatchObject({ kind: 'pending', timeoutAction: null });
    if (pending.kind !== 'pending') throw new Error('Expected Space prefix');
    expect(resolveInputTimeout(pending)).toMatchObject({ kind: 'pass' });
    pending = advanceInput({ ...pending.state, bindings, allowCountPrefix: true }, 'f');
    expect(pending).toMatchObject({ kind: 'pending', timeoutAction: null });
    if (pending.kind !== 'pending') throw new Error('Expected Find prefix');
    expect(resolveInputTimeout(pending)).toMatchObject({ kind: 'pass' });
    expect(advanceInput({ ...pending.state, bindings, allowCountPrefix: true }, 'q')).toMatchObject(
      {
        kind: 'execute',
        action: 'mainQuickSearch',
      },
    );
    expect(nodes['main-normal:<Space>fq']).toEqual({ kind: 'action', action: 'mainQuickSearch' });
  });

  it('keeps mode ownership and override unbindings in the adapted nodes', () => {
    const bindings = resolveBindings(
      JSON.stringify({
        'main-select:gg': null,
        'reader-normal:<Space>fq': 'scrollDown',
      }),
    );
    const nodes = bindingNodesFromActions(bindings);
    expect(nodes['main-select:g']).toBeUndefined();
    expect(nodes['main-normal:g']).toMatchObject({ kind: 'prefix' });
    expect(nodes['reader-normal:<Space>fq']).toEqual({ kind: 'action', action: 'scrollDown' });
    expect(nodes['main-normal:<Space>fq']).toEqual({ kind: 'action', action: 'mainQuickSearch' });
    expect(press('main-select', 'g', bindings)).toMatchObject({ kind: 'pass' });
    expect(press('main-normal', 'g', bindings)).toMatchObject({ kind: 'pending' });
  });

  it('names every custom strict prefix without borrowing another mode namespace', () => {
    const bindings = resolveBindings(
      JSON.stringify({ 'main-select:<Space>xy': 'mainSelectFinish' }),
    );
    const nodes = bindingNodesFromActions(bindings);
    expect(nodes['main-select:<Space>']).toEqual({
      kind: 'prefix',
      label: { en: 'Prefix <Space>', 'zh-CN': '前缀 <Space>' },
    });
    expect(nodes['main-select:<Space>x']).toEqual({
      kind: 'prefix',
      label: { en: 'Prefix <Space>x', 'zh-CN': '前缀 <Space>x' },
    });
    expect(nodes['main-select:<Space>xy']).toEqual({
      kind: 'action',
      action: 'mainSelectFinish',
    });
    expect(nodes['main-normal:<Space>']).toBe(DEFAULT_PREFIX_BINDINGS['main-normal:<Space>']);
    expect(nodes['reader-select:<Space>']).toBeUndefined();

    const start = press('main-select', ' ', bindings);
    expect(start).toMatchObject({ kind: 'pending', timeoutAction: null });
    const next = advanceInput({ ...start.state, bindings, allowCountPrefix: false }, 'x');
    expect(next).toMatchObject({ kind: 'pending', timeoutAction: null });
    expect(advanceInput({ ...next.state, bindings, allowCountPrefix: false }, 'y')).toMatchObject({
      kind: 'execute',
      action: 'mainSelectFinish',
    });
    expect(press('reader-select', ' ', bindings)).toMatchObject({ kind: 'pass' });
  });

  it('rejects action leaves with children without changing legacy ambiguous overrides', () => {
    const bindings = resolveBindings(JSON.stringify({ 'main-normal:g': 'mainNavFirst' }));
    expect(() => bindingNodesFromActions(bindings)).toThrow(
      'Action binding cannot be a prefix: main-normal:g',
    );
    expect(press('main-normal', 'g', bindings)).toMatchObject({
      kind: 'pending',
      timeoutAction: 'mainNavFirst',
    });
  });
});
