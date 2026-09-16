import { describe, expect, it } from 'vitest';
import { ACTION_IDS, ACTION_LABELS, type ActionId } from '../../src/input/actions';

import {
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  migrateLegacyBindingOverrides,
  parseBindingKey,
  parseBindingOverrides,
  parseCustomBindings,
  resolveBindings,
  type BindingMap,
} from '../../src/input/bindings';
import {
  advanceInput,
  backspaceLeaderInput,
  cancelLeaderInput,
  inputWouldConsume,
  resolveInputTimeout,
  type InputContext,
  type InputDecision,
  type InputState,
} from '../../src/input/engine';
import { keyString } from '../../src/input/keys';

const normalState = (overrides: Partial<InputState> = {}): InputState => ({
  mode: 'normal',
  keyBuffer: '',
  countBuffer: '',
  ...overrides,
});

const context = (
  state: InputState = normalState(),
  bindings: BindingMap = {},
  allowCountPrefix = true,
): InputContext => ({ ...state, bindings, allowCountPrefix });

function expectPending(decision: InputDecision): Extract<InputDecision, { kind: 'pending' }> {
  expect(decision.kind).toBe('pending');
  if (decision.kind !== 'pending') {
    throw new Error('Expected input to remain pending');
  }
  return decision;
}

describe('keyString', () => {
  it('normalizes platform and modifier chords into binding syntax', () => {
    expect(keyString({ key: 'd', metaKey: true })).toBe('ctrl+d');
    expect(keyString({ key: 'f', ctrlKey: true, altKey: true })).toBe('ctrl+alt+f');
    expect(keyString({ key: 'ArrowDown' })).toBe('arrowdown');
  });

  it('preserves printable key case and ignores modifier-only or unusable events', () => {
    expect(keyString({ key: 'G' })).toBe('G');
    expect(keyString({ key: 'Control', ctrlKey: true })).toBe('');
    expect(keyString({ key: 'Dead' })).toBe('');
    expect(keyString({ key: 'Unidentified' })).toBe('');
    expect(keyString({})).toBe('');
  });
});

describe('binding parsing and overrides', () => {
  it('parses known modes and retains complete key sequences', () => {
    expect(parseBindingKey('normal:ctrl+d')).toEqual({ mode: 'normal', sequence: 'ctrl+d' });
    expect(parseBindingKey('main: gg')).toEqual({ mode: 'main', sequence: ' gg' });
  });

  it('parses colon command bindings without widening their mode', () => {
    expect(parseBindingKey('normal::')).toEqual({ mode: 'normal', sequence: ':' });
    expect(parseBindingKey('main::')).toEqual({ mode: 'main', sequence: ':' });
  });

  it('rejects malformed binding keys', () => {
    expect(parseBindingKey('normal')).toBeNull();
    expect(parseBindingKey(':j')).toBeNull();
    expect(parseBindingKey('reader:j')).toBeNull();
    expect(parseBindingKey('normal:')).toBeNull();
  });
  it('accepts action and null overrides while rejecting invalid payload entries', () => {
    expect(
      parseBindingOverrides(
        JSON.stringify({
          'normal:j': 'scrollUp',
          'normal:x': null,
          normal: 'scrollDown',
          'reader:j': 'scrollUp',
          'normal:': 'scrollDown',
          'normal:q': 'notAnAction',
          'normal:y': ['scrollDown'],
          'normal:z': 42,
          'normal:Z': false,
          'normal:custom': { action: 'scrollDown' },
        }),
      ),
    ).toEqual({
      'normal:j': 'scrollUp',
      'normal:x': null,
    });

    expect(parseBindingOverrides(JSON.stringify(['normal:j', 'scrollUp']))).toEqual({});
    expect(parseBindingOverrides(JSON.stringify(42))).toEqual({});
    expect(parseBindingOverrides({ 'normal:j': 'scrollUp' })).toEqual({});
    expect(parseBindingOverrides(['normal:j', 'scrollUp'])).toEqual({});
    expect(parseBindingOverrides(null)).toEqual({});
    expect(parseBindingOverrides(undefined)).toEqual({});
  });

  it('accepts only valid binding-action pairs from a custom mapping', () => {
    const custom = parseCustomBindings(
      JSON.stringify({
        'normal:x': 'scrollDown',
        'normal:': 'scrollUp',
        'reader:j': 'scrollUp',
        'normal:q': 'notAnAction',
      }),
    );

    expect(custom).toEqual({ 'normal:x': 'scrollDown' });
  });

  it('rejects malformed custom binding payloads and leaves defaults available', () => {
    expect(parseCustomBindings('{')).toEqual({});
    expect(parseCustomBindings('["normal:j"]')).toEqual({});
    expect(parseCustomBindings({ 'normal:j': 'scrollUp' })).toEqual({});

    const bindings = resolveBindings(
      JSON.stringify({
        'normal:j': 'scrollUp',
        'normal:': 'scrollDown',
        'normal:x': 'notAnAction',
      }),
    );
    expect(bindings['normal:j']).toBe('scrollUp');
    expect(bindings['normal:k']).toBe('scrollUp');
    expect(bindings['normal:']).toBeUndefined();
    expect(bindings['normal:x']).toBeUndefined();
  });
  it('applies overrides and treats null as an authoritative unbind', () => {
    const bindings = resolveBindings(
      JSON.stringify({
        'normal:j': null,
        'normal:x': 'scrollDown',
        'main:enter': null,
      }),
    );

    expect(bindings['normal:j']).toBeUndefined();
    expect(bindings['normal:x']).toBe('scrollDown');
    expect(bindings['normal:k']).toBe('scrollUp');
    expect(bindings['normal:h']).toBe('prevPage');
    expect(bindings['main:enter']).toBeUndefined();
    expect(bindings['main:return']).toBe('mainActivate');
  });

  it('provides native history, Follow Link, and Select-first Flash defaults that remain remappable', () => {
    expect(DEFAULT_BINDINGS['normal:ctrl+o']).toBe('historyBack');
    expect(DEFAULT_BINDINGS['normal:ctrl+i']).toBe('historyForward');
    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');
    expect(DEFAULT_BINDINGS['normal:v']).toBe('enterVisual');
    expect('normal:s' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['visual:s']).toBe('flashText');
    expect(DEFAULT_BINDINGS['visual:enter']).toBe('openSelectionActions');
    expect(Object.keys(DEFAULT_BINDINGS).some((key) => key.startsWith('cursor:'))).toBe(false);
    expect('insert:ctrl+o' in DEFAULT_BINDINGS).toBe(false);
    expect('main:ctrl+o' in DEFAULT_BINDINGS).toBe(false);
    expect('insert:f' in DEFAULT_BINDINGS).toBe(false);
    expect('main:f' in DEFAULT_BINDINGS).toBe(false);

    const bindings = resolveBindings('{"normal:ctrl+o":"scrollDown","normal:f":"scrollUp"}');
    expect(bindings['normal:ctrl+o']).toBe('scrollDown');
    expect(bindings['normal:ctrl+i']).toBe('historyForward');
    expect(bindings['normal:f']).toBe('scrollUp');
  });
  it('provides Reader zoom, H/L tab, and zh/zl pan defaults', () => {
    expect(DEFAULT_BINDINGS['normal:H']).toBe('mainPrevTab');
    expect(DEFAULT_BINDINGS['normal:L']).toBe('mainNextTab');
    expect(DEFAULT_BINDINGS['normal:zh']).toBe('scrollLeft');
    expect(DEFAULT_BINDINGS['normal:zl']).toBe('scrollRight');
    expect('normal:J' in DEFAULT_BINDINGS).toBe(false);
    expect('normal:K' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['main:H']).toBe('mainPrevTab');
    expect(DEFAULT_BINDINGS['main:L']).toBe('mainNextTab');
    expect('main:J' in DEFAULT_BINDINGS).toBe(false);
    expect('main:K' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['normal:+']).toBe('zoomIn');
    expect(DEFAULT_BINDINGS['normal:-']).toBe('zoomOut');
    expect(DEFAULT_BINDINGS['normal:zI']).toBe('zoomIn');
    expect(DEFAULT_BINDINGS['normal:zO']).toBe('zoomOut');
    expect(DEFAULT_BINDINGS['normal:=']).toBe('zoomReset');
    expect(DEFAULT_BINDINGS['normal:z0']).toBe('zoomReset');
    expect('normal:zi' in DEFAULT_BINDINGS).toBe(false);
    expect('normal:zo' in DEFAULT_BINDINGS).toBe(false);
    expect('insert:+' in DEFAULT_BINDINGS).toBe(false);
    expect('normal: :' in DEFAULT_BINDINGS).toBe(false);
    expect('main: :' in DEFAULT_BINDINGS).toBe(false);
    expect('main:-' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['normal::']).toBe('openCommandPalette');
    expect(DEFAULT_BINDINGS['main::']).toBe('openCommandPalette');
    expect('visual::' in DEFAULT_BINDINGS).toBe(false);
    expect('cursor::' in DEFAULT_BINDINGS).toBe(false);
    expect('insert::' in DEFAULT_BINDINGS).toBe(false);
    expect(ACTION_IDS).toContain('openCommandPalette');
    expect(ACTION_LABELS.openCommandPalette.en).toBe('Open command palette');
    expect(ACTION_LABELS.zoomReset.en).toBe('Reset zoom / Fit page width');

    const bindings = resolveBindings(
      JSON.stringify({
        'normal:zI': 'zoomOut',
        'normal:zO': 'zoomIn',
        'normal:z0': 'zoomOut',
        'normal:=': 'zoomIn',
      }),
    );
    expect(bindings['normal:zI']).toBe('zoomOut');
    expect(bindings['normal:zO']).toBe('zoomIn');
    expect(bindings['normal:z0']).toBe('zoomOut');
    expect(bindings['normal:=']).toBe('zoomIn');
  });
  it('encodes compact deterministic deltas from the defaults', () => {
    expect(encodeBindingOverrides(DEFAULT_BINDINGS)).toBe('');

    const changed: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
    changed['normal:j'] = 'scrollUp';
    changed['normal:x'] = 'zoomIn';

    const reordered: Record<string, ActionId> = {
      'normal:x': 'zoomIn',
      ...DEFAULT_BINDINGS,
      'normal:j': 'scrollUp',
    };
    const expected = '{"normal:j":"scrollUp","normal:x":"zoomIn"}';

    expect(encodeBindingOverrides(changed)).toBe(expected);
    expect(encodeBindingOverrides(reordered)).toBe(expected);
  });

  it('encodes null tombstones for defaults missing from the effective map', () => {
    const missingDefault: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
    delete missingDefault['normal:j'];

    expect(encodeBindingOverrides(missingDefault)).toBe('{"normal:j":null}');
  });

  it('migrates legacy tables to deterministic compact overrides without inferred tombstones', () => {
    const legacyRows: Record<string, unknown> = {
      'normal:j': 'scrollDown',
      'normal:zh': 'scrollLeft',
      'main:enter': 'mainActivate',
      'normal:H': 'scrollLeft',
      'normal:L': 'scrollRight',
      'normal:J': 'mainPrevTab',
      'normal:K': 'mainNextTab',
      'main:J': 'mainPrevTab',
      'main:K': 'mainNextTab',
      'normal: fb': 'mainFuzzyCollection',
      'normal: bj': 'mainTabPick',
      'normal: o': 'mainOpenPDF',
      'normal: q': 'mainClosePDF',
      'main: fb': 'mainFuzzyCollection',
      'main: bj': 'mainTabPick',
      'main: q': 'mainClosePDF',
      'normal: n': 'mainNotesLayout',
      'main: n': 'mainNotesLayout',
      'normal: tp': 'mainTabPick',
      'main: tp': 'mainTabPick',
      'main:ctrl+u': 'mainRestoreTrashedItems',
      'main:legacy-search': 'mainFocusSearch',
      'main:old-advanced': 'mainAdvancedSearch',
      'main:x': 'mainActivate',
      'normal:custom': 'zoomIn',
    };
    const legacy = JSON.stringify(legacyRows);
    const reorderedLegacy = JSON.stringify(
      Object.fromEntries(Object.entries(legacyRows).reverse()),
    );
    const migrated = migrateLegacyBindingOverrides(legacy);

    expect(migrated).toBe('{"main:x":"mainActivate","normal:custom":"zoomIn"}');
    expect(migrateLegacyBindingOverrides(reorderedLegacy)).toBe(migrated);

    const resolved = resolveBindings(migrated);
    expect(resolved['main:x']).toBe('mainActivate');
    expect(resolved['normal:custom']).toBe('zoomIn');
    expect(resolved['normal:zh']).toBe('scrollLeft');
    expect(resolved['normal:zl']).toBe('scrollRight');
    expect(resolved['normal:H']).toBe('mainPrevTab');
    expect(resolved['normal:L']).toBe('mainNextTab');
    expect(resolved['normal:J']).toBeUndefined();
    expect(resolved['main:J']).toBeUndefined();
    expect(resolved['main:legacy-search']).toBeUndefined();
    expect(resolved['main:old-advanced']).toBeUndefined();
  });
});

describe('input matcher', () => {
  it('executes an unambiguous exact binding and clears input state', () => {
    const bindings: BindingMap = { 'normal:x': 'scrollDown' };

    expect(advanceInput(context(normalState(), bindings), 'x')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'scrollDown',
      count: 0,
    });
  });

  it('waits for an exact binding that has a longer continuation, then resolves it on timeout', () => {
    const bindings: BindingMap = {
      'normal:y': 'yankAnnotation',
      'normal:yy': 'yankAnnotationComment',
    };
    const first = expectPending(
      advanceInput(context(normalState({ countBuffer: '12' }), bindings), 'y'),
    );

    expect(first).toEqual({
      kind: 'pending',
      state: normalState({ keyBuffer: 'y', countBuffer: '12' }),
      consumed: true,
      timeoutMs: 800,
      timeoutAction: 'yankAnnotation',
    });
    expect(resolveInputTimeout(first)).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'yankAnnotation',
      count: 12,
    });
  });

  it('executes the longer binding instead when its continuation arrives', () => {
    const bindings: BindingMap = {
      'normal:y': 'yankAnnotation',
      'normal:yy': 'yankAnnotationComment',
    };
    const first = expectPending(
      advanceInput(context(normalState({ countBuffer: '3' }), bindings), 'y'),
    );

    expect(advanceInput(context(first.state, bindings), 'y')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'yankAnnotationComment',
      count: 3,
    });
  });

  it('keeps a prefix-only binding pending longer and passes after its timeout', () => {
    const bindings: BindingMap = { 'normal:gg': 'firstPage' };
    const pending = expectPending(advanceInput(context(normalState(), bindings), 'g'));

    expect(pending).toEqual({
      kind: 'pending',
      state: normalState({ keyBuffer: 'g' }),
      consumed: true,
      timeoutMs: 1200,
      timeoutAction: null,
    });
    expect(resolveInputTimeout(pending)).toEqual({ kind: 'pass', state: normalState() });
  });

  it('uses a valid single-key binding after an incomplete sequence fails', () => {
    const bindings: BindingMap = {
      'normal:gg': 'firstPage',
      'normal:x': 'scrollDown',
    };

    expect(advanceInput(context(normalState({ keyBuffer: 'g' }), bindings), 'x')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'scrollDown',
      count: 0,
    });
  });

  it('accumulates a count prefix and supplies it to the following action', () => {
    const bindings: BindingMap = { 'normal:j': 'scrollDown' };
    const first = expectPending(advanceInput(context(normalState(), bindings), '3'));
    const second = expectPending(advanceInput(context(first.state, bindings), '2'));

    expect(second).toEqual({
      kind: 'pending',
      state: normalState({ countBuffer: '32' }),
      consumed: true,
      timeoutMs: null,
      timeoutAction: null,
    });
    expect(advanceInput(context(second.state, bindings), 'j')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'scrollDown',
      count: 32,
    });
  });

  it('does not mistake an unmodified key for a ctrl or alt chord prefix', () => {
    const bindings: BindingMap = {
      'normal:ctrl+d': 'halfPageDown',
      'normal:alt+d': 'scrollDown',
    };

    expect(advanceInput(context(normalState(), bindings), 'd')).toEqual({
      kind: 'pass',
      state: normalState(),
    });
    expect(advanceInput(context(normalState(), bindings), 'ctrl+d')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'halfPageDown',
      count: 0,
    });
  });

  it('preflight matches reducer consumption without mutating the input context', () => {
    const bindings: BindingMap = { 'normal:gg': 'firstPage', 'normal:x': 'scrollDown' };
    const initial = context(normalState({ keyBuffer: 'g' }), bindings);

    expect(inputWouldConsume(initial, 'g')).toBe(true);
    expect(inputWouldConsume(initial, 'x')).toBe(true);
    expect(inputWouldConsume(context(normalState(), bindings), 'z')).toBe(false);
    expect(initial).toEqual(context(normalState({ keyBuffer: 'g' }), bindings));
    expect(inputWouldConsume(initial, 'g')).toBe(advanceInput(initial, 'g').kind !== 'pass');
  });

  it('cancels and backspaces only leader input while preserving other state', () => {
    const leader = normalState({ keyBuffer: ' ff', countBuffer: '2' });
    expect(cancelLeaderInput(leader)).toEqual(normalState({ countBuffer: '2' }));
    expect(backspaceLeaderInput(leader)).toEqual(
      normalState({ keyBuffer: ' f', countBuffer: '2' }),
    );
    expect(cancelLeaderInput(normalState({ keyBuffer: 'g' }))).toBeNull();
    expect(backspaceLeaderInput(normalState())).toBeNull();
  });
});
