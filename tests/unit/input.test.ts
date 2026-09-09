import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINDINGS,
  parseBindingKey,
  parseCustomBindings,
  resolveBindings,
  type BindingMap,
} from '../../src/input/bindings';
import {
  advanceInput,
  resolveInputTimeout,
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

  it('rejects malformed binding keys', () => {
    expect(parseBindingKey('normal')).toBeNull();
    expect(parseBindingKey(':j')).toBeNull();
    expect(parseBindingKey('reader:j')).toBeNull();
    expect(parseBindingKey('normal:')).toBeNull();
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

  it('provides reader-only native history and follow-link defaults that remain remappable', () => {
    expect(DEFAULT_BINDINGS['normal:ctrl+o']).toBe('historyBack');
    expect(DEFAULT_BINDINGS['normal:ctrl+i']).toBe('historyForward');
    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');
    expect('insert:ctrl+o' in DEFAULT_BINDINGS).toBe(false);
    expect('main:ctrl+o' in DEFAULT_BINDINGS).toBe(false);
    expect('insert:f' in DEFAULT_BINDINGS).toBe(false);
    expect('main:f' in DEFAULT_BINDINGS).toBe(false);

    const bindings = resolveBindings('{"normal:ctrl+o":"scrollDown","normal:f":"scrollUp"}');
    expect(bindings['normal:ctrl+o']).toBe('scrollDown');
    expect(bindings['normal:ctrl+i']).toBe('historyForward');
    expect(bindings['normal:f']).toBe('scrollUp');
  });
});

describe('input matcher', () => {
  it('executes an unambiguous exact binding and clears input state', () => {
    const bindings: BindingMap = { 'normal:x': 'scrollDown' };

    expect(advanceInput(normalState(), 'x', bindings, { allowCountPrefix: true })).toEqual({
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
    const initial = normalState({ countBuffer: '12' });
    const first = expectPending(advanceInput(initial, 'y', bindings, { allowCountPrefix: true }));

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
      advanceInput(normalState({ countBuffer: '3' }), 'y', bindings, {
        allowCountPrefix: true,
      }),
    );

    expect(advanceInput(first.state, 'y', bindings, { allowCountPrefix: true })).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'yankAnnotationComment',
      count: 3,
    });
  });

  it('keeps a prefix-only binding pending longer and passes after its timeout', () => {
    const bindings: BindingMap = { 'normal:gg': 'firstPage' };
    const pending = expectPending(
      advanceInput(normalState(), 'g', bindings, { allowCountPrefix: true }),
    );

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

    expect(
      advanceInput(normalState({ keyBuffer: 'g' }), 'x', bindings, {
        allowCountPrefix: true,
      }),
    ).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'scrollDown',
      count: 0,
    });
  });

  it('accumulates a count prefix and supplies it to the following action', () => {
    const bindings: BindingMap = { 'normal:j': 'scrollDown' };
    const first = expectPending(
      advanceInput(normalState(), '3', bindings, { allowCountPrefix: true }),
    );
    const second = expectPending(
      advanceInput(first.state, '2', bindings, { allowCountPrefix: true }),
    );

    expect(second).toEqual({
      kind: 'pending',
      state: normalState({ countBuffer: '32' }),
      consumed: true,
      timeoutMs: null,
      timeoutAction: null,
    });
    expect(advanceInput(second.state, 'j', bindings, { allowCountPrefix: true })).toEqual({
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

    expect(advanceInput(normalState(), 'd', bindings, { allowCountPrefix: true })).toEqual({
      kind: 'pass',
      state: normalState(),
    });
    expect(
      advanceInput(normalState(), keyString({ key: 'd', ctrlKey: true }), bindings, {
        allowCountPrefix: true,
      }),
    ).toEqual({
      kind: 'execute',
      state: normalState(),
      consumed: true,
      action: 'halfPageDown',
      count: 0,
    });
  });
});
