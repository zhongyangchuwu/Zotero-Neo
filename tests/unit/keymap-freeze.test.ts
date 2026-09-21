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

  it('does not confuse named keys with printable prefixes', () => {
    const bindings: BindingMap = {
      'main-normal:e': 'mainFocusTree',
      'main-normal:enter': 'mainActivate',
      'main-normal:escape': 'mainSelectCancel',
      'main-normal:d': 'mainNavDown',
      'main-normal:delete': 'mainTrashItems',
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
