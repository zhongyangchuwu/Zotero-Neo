import type { ActionId } from './actions';
import type { BindingMap, Mode } from './bindings';
import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
  bindingTokenCount,
  inputStartsWithKey,
  inputTokenCount,
  popInputKey,
} from './key-sequence';

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
  return bindingMatchesInputPrefix(bindingKey.slice(modePrefix.length), buffer);
}

interface MatchSummary {
  readonly exact: ActionId | undefined;
  readonly longer: boolean;
}

function summarizeMatches(bindings: BindingMap, mode: Mode, buffer: string): MatchSummary {
  const inputLength = inputTokenCount(buffer);
  if (inputLength === null) return { exact: undefined, longer: false };

  let exact: ActionId | undefined;
  let longer = false;
  const modePrefix = `${mode}:`;
  for (const [bindingKey, action] of Object.entries(bindings)) {
    if (!bindingKey.startsWith(modePrefix)) continue;
    const sequence = bindingKey.slice(modePrefix.length);
    if (!bindingMatchesInputPrefix(sequence, buffer)) continue;

    const length = bindingTokenCount(sequence);
    if (length === null) continue;
    if (bindingEqualsInput(sequence, buffer)) exact = action;
    else if (length > inputLength) longer = true;
  }
  return { exact, longer };
}

function processMatch(state: InputState, buffer: string, match: MatchSummary): InputDecision {
  if (match.exact && !match.longer) {
    return {
      kind: 'execute',
      state: resetState(state),
      consumed: true,
      action: match.exact,
      count: countValue(state.countBuffer),
    };
  }

  if (match.exact) {
    return {
      kind: 'pending',
      state: { ...state, keyBuffer: buffer },
      consumed: true,
      timeoutMs: 800,
      timeoutAction: match.exact,
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

  const nextBuffer = appendInputKey(state.keyBuffer, key);
  const nextMatch = summarizeMatches(bindings, mode, nextBuffer);
  if (nextMatch.exact || nextMatch.longer) {
    return processMatch(state, nextBuffer, nextMatch);
  }

  const fallbackState = resetState(state);
  const fallbackBuffer = appendInputKey('', key);
  const fallbackMatch = summarizeMatches(bindings, mode, fallbackBuffer);
  if (!fallbackMatch.exact && !fallbackMatch.longer) {
    return { kind: 'pass', state: fallbackState };
  }
  return processMatch(fallbackState, fallbackBuffer, fallbackMatch);
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

export function cancelPendingInput(state: InputState): InputState | null {
  if (!state.keyBuffer) return null;
  return { ...state, keyBuffer: '' };
}

export function backspacePendingInput(state: InputState): InputState | null {
  if (!state.keyBuffer) return null;
  return { ...state, keyBuffer: popInputKey(state.keyBuffer) };
}

export function cancelLeaderInput(state: InputState): InputState | null {
  if (!inputStartsWithKey(state.keyBuffer, ' ')) return null;
  return { ...state, keyBuffer: '' };
}

export function backspaceLeaderInput(state: InputState): InputState | null {
  if (!inputStartsWithKey(state.keyBuffer, ' ')) return null;
  return { ...state, keyBuffer: popInputKey(state.keyBuffer) };
}
