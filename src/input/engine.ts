import type { ActionId } from './actions';
import type { BindingMap, Mode } from './bindings';

export interface InputState {
  readonly mode: Mode;
  readonly keyBuffer: string;
  readonly countBuffer: string;
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

export interface AdvanceOptions {
  readonly allowCountPrefix: boolean;
}

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

export function advanceInput(
  state: InputState,
  key: string,
  bindings: BindingMap,
  options: AdvanceOptions,
): InputDecision {
  if (!key) return { kind: 'pass', state };

  if (
    options.allowCountPrefix &&
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
  decision: Extract<InputDecision, { kind: 'pending' }>,
): InputDecision {
  if (decision.timeoutAction) {
    return {
      kind: 'execute',
      state: resetState(decision.state),
      consumed: true,
      action: decision.timeoutAction,
      count: countValue(decision.state.countBuffer),
    };
  }
  return { kind: 'pass', state: resetState(decision.state) };
}
