import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINDINGS,
  bindingsForMode,
  migrateLegacyBindingOverrides,
  parseBindingKey,
  resolveBindings,
  type BindingMap,
  type Mode,
} from '../../src/input/bindings';
import { advanceInput } from '../../src/input/engine';
import { bindingSequenceIsStrictPrefix } from '../../src/input/key-sequence';

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

    const mainSelect = bindingsForMode(DEFAULT_BINDINGS, 'main-select', ['main-normal']);
    expect(strictPrefixPairs(mainSelect)).toEqual([]);
  });

  it('keeps Main native View search actions under the shared Space Find group', () => {
    expect(DEFAULT_BINDINGS['main-normal:<Space>fq']).toBe('mainQuickSearch');
    expect(DEFAULT_BINDINGS['main-normal:<Space>fa']).toBe('mainAdvancedSearch');
    expect(press('main-normal', ' ')).toMatchObject({ kind: 'pending' });
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
    expect(press('main-normal', ' ')).toMatchObject({ kind: 'pending' });

    const visualBindings = bindingsForMode(DEFAULT_BINDINGS, 'main-select', ['main-normal']);
    expect(press('main-select', 's', visualBindings)).toMatchObject({
      kind: 'execute',
      action: 'mainSelectFinish',
    });
    expect(press('main-select', ' ', visualBindings)).toMatchObject({ kind: 'pending' });
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
