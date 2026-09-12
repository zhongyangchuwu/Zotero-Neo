import type { ActionId } from './actions';
import type { BindingMap, Mode } from './bindings';

export interface InputState {
  readonly mode: Mode;
  readonly keyBuffer: string;
  readonly countBuffer: string;
}

export interface InputContext extends InputState {
  readonly bindings: BindingMap;
  readonly allowCountPrefix: boolean;
}

export type InputDecision =
  | {
      readonly kind: 'pass';
      readonly state: InputState;
    }
  | {
      readonly kind: 'pending';
      readonly state: InputState;
      readonly consumed: true;
      readonly timeoutMs: number | null;
      readonly timeoutAction: ActionId | null;
    }
  | {
      readonly kind: 'execute';
      readonly state: InputState;
      readonly consumed: true;
      readonly action: ActionId;
      readonly count: number;
    };

export type InputTransition = InputDecision;

function resetState(state: InputState): InputState {
  return { ...state, keyBuffer: '', countBuffer: '' };
}

function countValue(buffer: string): number {
  return buffer ? Number.parseInt(buffer, 10) : 0;
}

export function bindingMatchesPrefix(bindingKey: string, mode: Mode, buffer: string): boolean {
  const modePrefix = `${mode}:`;
  if (!bindingKey.startsWith(modePrefix)) return false;
  const tail = bindingKey.slice(modePrefix.length);
  if (!tail.startsWith(buffer)) return false;

  if (!buffer.includes('+') && buffer.length === 1 && /^[A-Za-z]$/.test(buffer)) {
    if (tail.startsWith('ctrl+') || tail.startsWith('alt+')) return false;
  }
  return true;
}

function processMatch(
  state: InputState,
  buffer: string,
  exact: ActionId | undefined,
  possible: readonly string[],
  bindings: BindingMap,
): InputDecision {
  const fullLength = `${state.mode}:`.length + buffer.length;
  const longerPossible = possible.filter((key) => key.length > fullLength);

  if (exact && longerPossible.length === 0) {
    return {
      kind: 'execute',
      state: resetState(state),
      consumed: true,
      action: exact,
      count: countValue(state.countBuffer),
    };
  }

  if (exact) {
    return {
      kind: 'pending',
      state: { ...state, keyBuffer: buffer },
      consumed: true,
      timeoutMs: 800,
      timeoutAction: bindings[`${state.mode}:${buffer}`] ?? null,
    };
  }

  return {
    kind: 'pending',
    state: { ...state, keyBuffer: buffer },
    consumed: true,
    timeoutMs: 1200,
    timeoutAction: null,
  };
}

export function advanceInput(context: InputContext, key: string): InputTransition {
  const { mode, keyBuffer, countBuffer, bindings, allowCountPrefix } = context;
  const state: InputState = { mode, keyBuffer, countBuffer };
  if (!key) return { kind: 'pass', state };

  if (
    allowCountPrefix &&
    !state.keyBuffer &&
    /^\d$/.test(key) &&
    (key !== '0' || state.countBuffer)
  ) {
    return {
      kind: 'pending',
      state: { ...state, countBuffer: `${state.countBuffer}${key}` },
      consumed: true,
      timeoutMs: null,
      timeoutAction: null,
    };
  }

  const nextBuffer = `${state.keyBuffer}${key}`;
  const nextKey = `${state.mode}:${nextBuffer}`;
  const possible = Object.keys(bindings).filter((binding) =>
    bindingMatchesPrefix(binding, state.mode, nextBuffer),
  );
  const exact = bindings[nextKey];

  if (possible.length > 0 || exact) {
    return processMatch(state, nextBuffer, exact, possible, bindings);
  }

  const fallbackState = resetState(state);
  const fallbackKey = `${state.mode}:${key}`;
  const fallbackPossible = Object.keys(bindings).filter((binding) =>
    bindingMatchesPrefix(binding, state.mode, key),
  );
  const fallbackExact = bindings[fallbackKey];
  if (fallbackPossible.length === 0 && !fallbackExact) {
    return { kind: 'pass', state: fallbackState };
  }
  return processMatch(fallbackState, key, fallbackExact, fallbackPossible, bindings);
}

export function resolveInputTimeout(
  pending: Extract<InputTransition, { readonly kind: 'pending' }>,
): InputTransition {
  if (pending.timeoutAction) {
    return {
      kind: 'execute',
      state: resetState(pending.state),
      consumed: true,
      action: pending.timeoutAction,
      count: countValue(pending.state.countBuffer),
    };
  }
  return { kind: 'pass', state: resetState(pending.state) };
}

export function inputWouldConsume(context: InputContext, key: string): boolean {
  return advanceInput(context, key).kind !== 'pass';
}

export function cancelLeaderInput(state: InputState): InputState | null {
  if (!state.keyBuffer.startsWith(' ')) return null;
  return { ...state, keyBuffer: '' };
}

export function backspaceLeaderInput(state: InputState): InputState | null {
  if (!state.keyBuffer.startsWith(' ')) return null;
  return { ...state, keyBuffer: state.keyBuffer.slice(0, -1) };
}
