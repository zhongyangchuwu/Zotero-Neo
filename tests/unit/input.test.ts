import { describe, expect, it } from 'vitest';
import { ACTION_IDS, ACTION_LABELS, type ActionId } from '../../src/input/actions';

import {
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  migrateLegacyBindingOverrides,
  migrateMainDirectPrefixOverrides,
  migrateNoteBindingOverrides,
  parseBindingKey,
  parseBindingOverrides,
  parseCustomBindings,
  resolveBindings,
  type BindingMap,
} from '../../src/input/bindings';
import {
  advanceInput,
  backspaceLeaderInput,
  backspacePendingInput,
  cancelLeaderInput,
  cancelPendingInput,
  inputWouldConsume,
  resolveInputTimeout,
  type InputContext,
  type InputDecision,
  type InputState,
} from '../../src/input/engine';
import { keyString } from '../../src/input/keys';

const normalState = (overrides: Partial<InputState> = {}): InputState => ({
  mode: 'reader-normal',
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
    expect(keyString({ key: 'Tab', shiftKey: true })).toBe('shift+tab');
    expect(keyString({ key: ' ', shiftKey: true })).toBe('shift+ ');
    expect(keyString({ key: 'ArrowDown', ctrlKey: true, shiftKey: true })).toBe(
      'ctrl+shift+arrowdown',
    );
  });

  it('preserves printable key case and ignores modifier-only or unusable events', () => {
    expect(keyString({ key: 'G' })).toBe('G');
    expect(keyString({ key: '🙂' })).toBe('🙂');
    expect(keyString({ key: 'Control', ctrlKey: true })).toBe('');
    expect(keyString({ key: 'Dead' })).toBe('');
    expect(keyString({ key: 'Unidentified' })).toBe('');
    expect(keyString({})).toBe('');
  });
});

describe('binding parsing and overrides', () => {
  it('parses known modes and retains complete key sequences', () => {
    expect(parseBindingKey('reader-normal:<C-d>')).toEqual({
      mode: 'reader-normal',
      sequence: '<C-d>',
    });
    expect(parseBindingKey('main-normal:<Space>gg')).toEqual({
      mode: 'main-normal',
      sequence: '<Space>gg',
    });
    expect(parseBindingKey('note-normal:diw')).toEqual({ mode: 'note-normal', sequence: 'diw' });
    expect(parseBindingKey('note-insert:<Esc>')).toEqual({
      mode: 'note-insert',
      sequence: '<Esc>',
    });
  });

  it('parses colon command bindings without widening their mode', () => {
    expect(parseBindingKey('reader-normal::')).toEqual({ mode: 'reader-normal', sequence: ':' });
    expect(parseBindingKey('main-normal::')).toEqual({ mode: 'main-normal', sequence: ':' });
  });

  it('rejects malformed binding keys', () => {
    expect(parseBindingKey('normal')).toBeNull();
    expect(parseBindingKey(':j')).toBeNull();
    expect(parseBindingKey('reader:j')).toBeNull();
    expect(parseBindingKey('reader-normal:')).toBeNull();
  });
  it('accepts action and null overrides while rejecting invalid payload entries', () => {
    expect(
      parseBindingOverrides(
        JSON.stringify({
          'reader-normal:j': 'scrollUp',
          'reader-normal:x': null,
          normal: 'scrollDown',
          'reader:j': 'scrollUp',
          'reader-normal:': 'scrollDown',
          'reader-normal:q': 'notAnAction',
          'reader-normal:y': ['scrollDown'],
          'reader-normal:z': 42,
          'reader-normal:Z': false,
          'reader-normal:custom': { action: 'scrollDown' },
        }),
      ),
    ).toEqual({
      'reader-normal:j': 'scrollUp',
      'reader-normal:x': null,
    });

    expect(parseBindingOverrides(JSON.stringify(['reader-normal:j', 'scrollUp']))).toEqual({});
    expect(parseBindingOverrides(JSON.stringify(42))).toEqual({});
    expect(parseBindingOverrides({ 'reader-normal:j': 'scrollUp' })).toEqual({});
    expect(parseBindingOverrides(['reader-normal:j', 'scrollUp'])).toEqual({});
    expect(parseBindingOverrides(null)).toEqual({});
    expect(parseBindingOverrides(undefined)).toEqual({});
  });

  it('accepts only valid binding-action pairs from a custom mapping', () => {
    const custom = parseCustomBindings(
      JSON.stringify({
        'reader-normal:x': 'scrollDown',
        'reader-normal:': 'scrollUp',
        'reader:j': 'scrollUp',
        'reader-normal:q': 'notAnAction',
      }),
    );

    expect(custom).toEqual({ 'reader-normal:x': 'scrollDown' });
  });

  it('rejects malformed custom binding payloads and leaves defaults available', () => {
    expect(parseCustomBindings('{')).toEqual({});
    expect(parseCustomBindings('["reader-normal:j"]')).toEqual({});
    expect(parseCustomBindings({ 'reader-normal:j': 'scrollUp' })).toEqual({});

    const bindings = resolveBindings(
      JSON.stringify({
        'reader-normal:j': 'scrollUp',
        'reader-normal:': 'scrollDown',
        'reader-normal:x': 'notAnAction',
      }),
    );
    expect(bindings['reader-normal:j']).toBe('scrollUp');
    expect(bindings['reader-normal:k']).toBe('scrollUp');
    expect(bindings['reader-normal:']).toBeUndefined();
    expect(bindings['reader-normal:x']).toBeUndefined();
  });
  it('applies overrides and treats null as an authoritative unbind', () => {
    const bindings = resolveBindings(
      JSON.stringify({
        'reader-normal:j': null,
        'reader-normal:x': 'scrollDown',
        'main-normal:<Enter>': null,
      }),
    );

    expect(bindings['reader-normal:j']).toBeUndefined();
    expect(bindings['reader-normal:x']).toBe('scrollDown');
    expect(bindings['reader-normal:k']).toBe('scrollUp');
    expect(bindings['reader-normal:h']).toBe('prevPage');
    expect(bindings['main-normal:<Enter>']).toBeUndefined();
    expect(bindings['main-normal:<Return>']).toBe('mainActivate');
  });

  it('provides native history, Follow Link, and Select-first Flash defaults that remain remappable', () => {
    expect(DEFAULT_BINDINGS['reader-normal:<C-o>']).toBe('historyBack');
    expect(DEFAULT_BINDINGS['reader-normal:<C-i>']).toBe('historyForward');
    expect(DEFAULT_BINDINGS['reader-normal:f']).toBe('followLink');
    expect(DEFAULT_BINDINGS['reader-normal:v']).toBe('enterVisual');
    expect('reader-normal:s' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['reader-select:s']).toBe('flashText');
    expect(DEFAULT_BINDINGS['reader-select:<Enter>']).toBe('openSelectionActions');
    expect(Object.keys(DEFAULT_BINDINGS).some((key) => key.startsWith('cursor:'))).toBe(false);
    expect('reader-insert:<C-o>' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal:<C-o>' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-insert:f' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal:f' in DEFAULT_BINDINGS).toBe(false);

    const bindings = resolveBindings(
      '{"reader-normal:<C-o>":"scrollDown","reader-normal:f":"scrollUp"}',
    );
    expect(bindings['reader-normal:<C-o>']).toBe('scrollDown');
    expect(bindings['reader-normal:<C-i>']).toBe('historyForward');
    expect(bindings['reader-normal:f']).toBe('scrollUp');
  });
  it('provides Reader zoom, H/L tab, and zh/zl pan defaults', () => {
    expect(DEFAULT_BINDINGS['reader-normal:H']).toBe('previousTab');
    expect(DEFAULT_BINDINGS['reader-normal:L']).toBe('nextTab');
    expect(DEFAULT_BINDINGS['reader-normal:zh']).toBe('scrollLeft');
    expect(DEFAULT_BINDINGS['reader-normal:zl']).toBe('scrollRight');
    expect('reader-normal:J' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal:K' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['main-normal:H']).toBe('previousTab');
    expect(DEFAULT_BINDINGS['main-normal:L']).toBe('nextTab');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>,']).toBe('switchTab');
    expect(DEFAULT_BINDINGS['main-normal:,']).toBe('switchTab');
    expect(DEFAULT_BINDINGS['reader-normal:<Space>q']).toBe('closeCurrentTab');
    expect(DEFAULT_BINDINGS['main-normal:q']).toBe('closeCurrentTab');
    expect('reader-normal: ft' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal: td' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal:J' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal:K' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['reader-normal:+']).toBe('zoomIn');
    expect(DEFAULT_BINDINGS['reader-normal:-']).toBe('zoomOut');
    expect(DEFAULT_BINDINGS['reader-normal:zI']).toBe('zoomIn');
    expect(DEFAULT_BINDINGS['reader-normal:zO']).toBe('zoomOut');
    expect(DEFAULT_BINDINGS['reader-normal:=']).toBe('zoomReset');
    expect(DEFAULT_BINDINGS['reader-normal:z0']).toBe('zoomReset');
    expect('reader-normal:zi' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal:zo' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-insert:+' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-normal: :' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal: :' in DEFAULT_BINDINGS).toBe(false);
    expect('main-normal:-' in DEFAULT_BINDINGS).toBe(false);
    expect(DEFAULT_BINDINGS['reader-normal::']).toBe('openCommandPalette');
    expect(DEFAULT_BINDINGS['main-normal::']).toBe('openCommandPalette');
    expect('reader-select::' in DEFAULT_BINDINGS).toBe(false);
    expect('cursor::' in DEFAULT_BINDINGS).toBe(false);
    expect('reader-insert::' in DEFAULT_BINDINGS).toBe(false);
    expect(ACTION_IDS).toContain('openCommandPalette');
    expect(ACTION_LABELS.openCommandPalette.en).toBe('Open command palette');
    expect(ACTION_LABELS.zoomReset.en).toBe('Reset zoom / Fit page width');

    const bindings = resolveBindings(
      JSON.stringify({
        'reader-normal:zI': 'zoomOut',
        'reader-normal:zO': 'zoomIn',
        'reader-normal:z0': 'zoomOut',
        'reader-normal:=': 'zoomIn',
      }),
    );
    expect(bindings['reader-normal:zI']).toBe('zoomOut');
    expect(bindings['reader-normal:zO']).toBe('zoomIn');
    expect(bindings['reader-normal:z0']).toBe('zoomOut');
    expect(bindings['reader-normal:=']).toBe('zoomIn');
  });
  it('copies schema-8 global Note overrides into explicit Note scope', () => {
    const migrated = migrateNoteBindingOverrides(
      JSON.stringify({
        'main-normal:H': 'nextTab',
        'main-normal:L': 'mainTrashItems',
        'main-normal: ff': 'switchTab',
        'main-normal:ctrl+h': null,
        'main-normal:j': 'mainNavUp',
      }),
    );

    expect(JSON.parse(migrated)).toEqual({
      'main-normal:<Space>ff': 'switchTab',
      'main-normal:H': 'nextTab',
      'main-normal:L': 'mainTrashItems',
      'main-normal:ctrl+h': null,
      'main-normal:j': 'mainNavUp',
      'note-normal:<Space>ff': 'switchTab',
      'note-normal:H': 'nextTab',
      'note-normal:ctrl+h': null,
    });
  });

  it('migrates Main explicit unbindings to the v0.2 direct-prefix defaults', () => {
    const migrated = migrateMainDirectPrefixOverrides(
      JSON.stringify({
        'main-normal: ff': null,
        'main-normal: ta': null,
        'main-normal: q': null,
        'main-normal: e': null,
        'main-normal: custom': 'nextTab',
        'reader-normal: ff': null,
      }),
    );

    expect(JSON.parse(migrated)).toEqual({
      'main-normal:<Space>custom': 'nextTab',
      'main-normal:e': null,
      'main-normal:ff': null,
      'main-normal:q': null,
      'main-normal:ta': null,
      'reader-normal:<Space>ff': null,
    });
  });

  it('encodes compact deterministic deltas from the defaults', () => {
    expect(encodeBindingOverrides(DEFAULT_BINDINGS)).toBe('');

    const changed: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
    changed['reader-normal:j'] = 'scrollUp';
    changed['reader-normal:x'] = 'zoomIn';

    const reordered: Record<string, ActionId> = {
      'reader-normal:x': 'zoomIn',
      ...DEFAULT_BINDINGS,
      'reader-normal:j': 'scrollUp',
    };
    const expected = '{"reader-normal:j":"scrollUp","reader-normal:x":"zoomIn"}';

    expect(encodeBindingOverrides(changed)).toBe(expected);
    expect(encodeBindingOverrides(reordered)).toBe(expected);
  });

  it('canonicalizes symbolic aliases before encoding binding overrides', () => {
    const aliases: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
    delete aliases['reader-normal:<Enter>'];
    aliases['reader-normal:<CR>'] = 'editAnnotation';

    expect(encodeBindingOverrides(aliases)).toBe('');
  });

  it('encodes null tombstones for defaults missing from the effective map', () => {
    const missingDefault: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
    delete missingDefault['reader-normal:j'];

    expect(encodeBindingOverrides(missingDefault)).toBe('{"reader-normal:j":null}');
  });

  it('migrates legacy tables to deterministic compact overrides without inferred tombstones', () => {
    const legacyRows: Record<string, unknown> = {
      'reader-normal:j': 'scrollDown',
      'reader-normal:zh': 'scrollLeft',
      'main-normal:enter': 'mainActivate',
      'reader-normal:H': 'scrollLeft',
      'reader-normal:L': 'scrollRight',
      'reader-normal:J': 'mainPrevTab',
      'reader-normal:K': 'mainNextTab',
      'main-normal:J': 'mainPrevTab',
      'main-normal:K': 'mainNextTab',
      'reader-normal: fb': 'mainFuzzyCollection',
      'reader-normal: bj': 'mainTabPick',
      'reader-normal: o': 'mainOpenPDF',
      'reader-normal: q': 'mainClosePDF',
      'main-normal: fb': 'mainFuzzyCollection',
      'main-normal: bj': 'mainTabPick',
      'main-normal: q': 'mainClosePDF',
      'reader-normal: n': 'mainNotesLayout',
      'main-normal: n': 'mainNotesLayout',
      'reader-normal: tp': 'mainTabPick',
      'main-normal: tp': 'mainTabPick',
      'main-normal:ctrl+u': 'mainRestoreTrashedItems',
      'main-normal:legacy-search': 'mainFocusSearch',
      'main-normal:old-advanced': 'mainAdvancedSearch',
      'main-normal:x': 'mainActivate',
      'reader-normal:custom': 'zoomIn',
    };
    const legacy = JSON.stringify(legacyRows);
    const reorderedLegacy = JSON.stringify(
      Object.fromEntries(Object.entries(legacyRows).reverse()),
    );
    const migrated = migrateLegacyBindingOverrides(legacy);

    expect(migrated).toBe('{"main-normal:x":"mainActivate","reader-normal:custom":"zoomIn"}');
    expect(migrateLegacyBindingOverrides(reorderedLegacy)).toBe(migrated);

    const resolved = resolveBindings(migrated);
    expect(resolved['main-normal:x']).toBe('mainActivate');
    expect(resolved['reader-normal:custom']).toBe('zoomIn');
    expect(resolved['reader-normal:zh']).toBe('scrollLeft');
    expect(resolved['reader-normal:zl']).toBe('scrollRight');
    expect(resolved['reader-normal:H']).toBe('previousTab');
    expect(resolved['reader-normal:L']).toBe('nextTab');
    expect(resolved['reader-normal:J']).toBeUndefined();
    expect(resolved['main-normal:J']).toBeUndefined();
    expect(resolved['main-normal:legacy-search']).toBeUndefined();
    expect(resolved['main-normal:old-advanced']).toBeUndefined();
  });
});

describe('input matcher', () => {
  it('executes an unambiguous exact binding and clears input state', () => {
    const bindings: BindingMap = { 'reader-normal:x': 'scrollDown' };

    expect(advanceInput(context(normalState(), bindings), 'x')).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'scrollDown',
      count: 0,
    });
  });

  it('keeps Note word motion immediate instead of turning w into a prefix timeout', () => {
    const bindings = resolveBindings('');
    const state: InputState = {
      mode: 'note-normal',
      keyBuffer: '',
      countBuffer: '',
    };

    expect(
      advanceInput(
        {
          ...state,
          bindings,
          allowCountPrefix: true,
        },
        'w',
      ),
    ).toEqual({
      kind: 'execute',
      state,
      consumed: true,
      action: 'noteMoveWordForward',
      count: 0,
    });
  });

  it('waits for an exact binding that has a longer continuation, then resolves it on timeout', () => {
    const bindings: BindingMap = {
      'reader-normal:y': 'yankAnnotation',
      'reader-normal:yy': 'yankAnnotationComment',
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
      'reader-normal:y': 'yankAnnotation',
      'reader-normal:yy': 'yankAnnotationComment',
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

  it('matches named-key and modifier tokens inside multi-key sequences', () => {
    const special: BindingMap = { 'reader-normal:<Enter>g': 'firstPage' };
    const firstSpecial = expectPending(advanceInput(context(normalState(), special), 'enter'));
    expect(advanceInput(context(firstSpecial.state, special), 'g')).toMatchObject({
      kind: 'execute',
      action: 'firstPage',
    });

    const chord: BindingMap = { 'reader-normal:<C-d>g': 'lastPage' };
    const firstChord = expectPending(advanceInput(context(normalState(), chord), 'ctrl+d'));
    expect(advanceInput(context(firstChord.state, chord), 'g')).toMatchObject({
      kind: 'execute',
      action: 'lastPage',
    });
    expect(backspacePendingInput(firstChord.state)).toEqual(normalState());
  });

  it('keeps a prefix-only binding pending longer and passes after its timeout', () => {
    const bindings: BindingMap = { 'reader-normal:gg': 'firstPage' };
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
      'reader-normal:gg': 'firstPage',
      'reader-normal:x': 'scrollDown',
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
    const bindings: BindingMap = { 'reader-normal:j': 'scrollDown' };
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
      'reader-normal:<C-d>': 'halfPageDown',
      'reader-normal:<M-d>': 'scrollDown',
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
    const bindings: BindingMap = {
      'reader-normal:gg': 'firstPage',
      'reader-normal:x': 'scrollDown',
    };
    const initial = context(normalState({ keyBuffer: 'g' }), bindings);

    expect(inputWouldConsume(initial, 'g')).toBe(true);
    expect(inputWouldConsume(initial, 'x')).toBe(true);
    expect(inputWouldConsume(context(normalState(), bindings), 'z')).toBe(false);
    expect(initial).toEqual(context(normalState({ keyBuffer: 'g' }), bindings));
    expect(inputWouldConsume(initial, 'g')).toBe(advanceInput(initial, 'g').kind !== 'pass');
  });

  it('keeps leader-only helpers and supports generic pending-prefix cancellation', () => {
    const leader = normalState({ keyBuffer: ' ff', countBuffer: '2' });
    expect(cancelLeaderInput(leader)).toEqual(normalState({ countBuffer: '2' }));
    expect(backspaceLeaderInput(leader)).toEqual(
      normalState({ keyBuffer: ' f', countBuffer: '2' }),
    );
    expect(cancelLeaderInput(normalState({ keyBuffer: 'g' }))).toBeNull();

    const direct = normalState({ keyBuffer: 'ff', countBuffer: '2' });
    expect(cancelPendingInput(direct)).toEqual(normalState({ countBuffer: '2' }));
    expect(backspacePendingInput(direct)).toEqual(
      normalState({ keyBuffer: 'f', countBuffer: '2' }),
    );
    expect(backspacePendingInput(normalState())).toBeNull();
  });
});
