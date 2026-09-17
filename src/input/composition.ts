export interface CompositionState {
  active: boolean;
}

/** Track the browser/IME composition lifecycle for one real text input. */
export function bindCompositionState(
  input: HTMLInputElement,
  state: CompositionState,
): () => void {
  const start = (): void => {
    state.active = true;
  };
  const end = (): void => {
    state.active = false;
  };
  input.addEventListener('compositionstart', start);
  input.addEventListener('compositionend', end);
  return () => {
    input.removeEventListener('compositionstart', start);
    input.removeEventListener('compositionend', end);
    state.active = false;
  };
}

/**
 * IME-owned keydowns must bypass Neo commands without cancelling the browser's default editing.
 * keyCode 229 covers Gecko/platform edge cases where isComposing is briefly false around IME keys.
 */
export function compositionOwnsKey(event: KeyboardEvent, active: boolean): boolean {
  return active || event.isComposing || event.key === 'Process' || event.keyCode === 229;
}

/** Only committed input values should trigger Neo matching/completion. */
export function isCommittedInput(event: Event, active: boolean): boolean {
  return !active && !(event as InputEvent).isComposing;
}
