import { ACTION_LABELS } from './actions';
import type { KeyGuideLanguage } from './key-guide-config';
import {
  bindingNodesFromActions,
  parseBindingKey,
  type Binding,
  type BindingMap,
  type Mode,
} from './bindings';
import {
  bindingMatchesInputPrefix,
  bindingSequenceTokens,
  inputBufferTokens,
  inputStartsWithKey,
  inputTokenCount,
  nextBindingToken,
  serializeBindingTokens,
} from './key-sequence';

export type { KeyGuideLanguage } from './key-guide-config';

export interface KeyGuideEntry {
  readonly key: string;
  readonly label: string;
  readonly isGroup: boolean;
}

export function isLeaderPrefix(prefix: string): boolean {
  return inputStartsWithKey(prefix, ' ');
}

export function isGuidePrefix(bindings: BindingMap, mode: Mode, prefix: string): boolean {
  const prefixLength = inputTokenCount(prefix);
  if (!prefix || !prefixLength) return false;

  return Object.keys(bindings).some((bindingKey) => {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== mode || !bindingMatchesInputPrefix(binding.sequence, prefix))
      return false;
    return (bindingSequenceTokens(binding.sequence)?.length ?? 0) > prefixLength;
  });
}

export function formatGuideKey(key: string): string {
  if (key === ' ') return 'SPC';
  return serializeBindingTokens([key]) || key;
}

export function formatGuidePrefix(prefix: string): string {
  return (inputBufferTokens(prefix) ?? []).map(formatGuideKey).join(' › ');
}

/**
 * Projects the immediate children of the pending prefix from the resolved
 * mode-owned keymap. Legacy exact/prefix collisions still use the matcher's
 * timeout; the guide displays their namespace rather than an action leaf.
 */
export function guideEntries(
  bindings: BindingMap,
  mode: Mode,
  prefix: string,
  language: KeyGuideLanguage,
): readonly KeyGuideEntry[] {
  if (!isGuidePrefix(bindings, mode, prefix)) return [];

  const prefixLength = inputTokenCount(prefix);
  if (!prefixLength) return [];

  const candidates = new Map<string, Binding>();
  const nodes = bindingNodesFromActions(bindings, 'prefer-prefix');
  for (const [bindingKey, node] of Object.entries(nodes)) {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== mode || !bindingMatchesInputPrefix(binding.sequence, prefix))
      continue;

    const tokens = bindingSequenceTokens(binding.sequence);
    if (tokens?.length !== prefixLength + 1) continue;
    const nextKey = nextBindingToken(binding.sequence, prefix);
    if (!nextKey) continue;
    if (node.kind === 'prefix' || candidates.get(nextKey)?.kind !== 'prefix') {
      candidates.set(nextKey, node);
    }
  }

  return [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, node]) => ({
      key,
      label: node.kind === 'prefix' ? node.label[language] : ACTION_LABELS[node.action][language],
      isGroup: node.kind === 'prefix',
    }));
}

/** Space-leader convenience wrapper over the generic pending-prefix guide. */
export function leaderGuideEntries(
  bindings: BindingMap,
  mode: Mode,
  prefix: string,
  language: KeyGuideLanguage,
): readonly KeyGuideEntry[] {
  return isLeaderPrefix(prefix) ? guideEntries(bindings, mode, prefix, language) : [];
}
