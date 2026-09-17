import { describe, expect, it, vi } from 'vitest';

import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../src/input/composition';

describe('composition input boundary', () => {
  it('tracks composition and only treats committed input as semantic text', () => {
    const listeners = new Map<string, EventListener[]>();
    const input = {
      addEventListener: (type: string, listener: EventListener) =>
        listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      removeEventListener: vi.fn(),
    } as unknown as HTMLInputElement;
    const state = { active: false };
    const cleanup = bindCompositionState(input, state);
    const emit = (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener({ type } as Event);
    };

    emit('compositionstart');
    expect(state.active).toBe(true);
    expect(isCommittedInput({ isComposing: true } as unknown as Event, state.active)).toBe(false);
    expect(
      compositionOwnsKey(
        { key: 'Enter', isComposing: true, keyCode: 229 } as unknown as KeyboardEvent,
        state.active,
      ),
    ).toBe(true);

    emit('compositionend');
    expect(state.active).toBe(false);
    expect(isCommittedInput({ isComposing: false } as unknown as Event, state.active)).toBe(true);
    cleanup();
  });
});
