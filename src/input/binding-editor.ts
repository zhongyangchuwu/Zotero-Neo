import type { ActionId } from './actions';
import type { BindingContext, BindingMap } from './bindings';
import { canonicalBindingSequence, bindingSequenceIsStrictPrefix } from './key-sequence';
import { nativeReservation } from './shortcut-catalog';

export interface BindingEditTarget {
  readonly context: BindingContext;
  readonly action: ActionId;
  readonly previous: string | null;
}

export interface ShortcutConflict {
  readonly sequence: string;
  readonly action: ActionId;
}

/** Validate only the proposed binding. Existing unrelated overrides cannot block this edit. */
export function inspectShortcut(
  bindings: BindingMap,
  target: BindingEditTarget,
  expression: string,
):
  | { readonly problem: 'empty' | 'malformed' | 'native' }
  | {
      readonly sequence: string;
      readonly exact: ActionId | undefined;
      readonly prefixes: readonly ShortcutConflict[];
    } {
  if (!expression) return { problem: 'empty' };
  const sequence = canonicalBindingSequence(expression);
  if (!sequence) return { problem: 'malformed' };
  const { context, previous } = target;
  if (nativeReservation(context, sequence)) return { problem: 'native' };
  const prefix = `${context}:`;
  const prefixes: ShortcutConflict[] = [];
  for (const [key, action] of Object.entries(bindings)) {
    if (!key.startsWith(prefix)) continue;
    const other = key.slice(prefix.length);
    if (other === previous || other === sequence) continue;
    if (
      bindingSequenceIsStrictPrefix(other, sequence) ||
      bindingSequenceIsStrictPrefix(sequence, other)
    )
      prefixes.push({ action, sequence: other });
  }
  return {
    sequence,
    exact: previous === sequence ? undefined : bindings[`${context}:${sequence}`],
    prefixes,
  };
}
