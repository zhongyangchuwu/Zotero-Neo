import { ACTION_LABELS, type ActionId } from './actions';
import { type KeyGuideLanguage, KEY_GUIDE_CONFIG } from './key-guide-config';
import { parseBindingKey, type BindingMap, type Mode } from './bindings';
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

function groupLabelKey(prefix: string, key: string): keyof typeof KEY_GUIDE_CONFIG.groupLabels {
  const tokens = [...(inputBufferTokens(prefix) ?? []), key];
  if (tokens[0] === ' ') tokens.shift();
  return tokens.join('') as keyof typeof KEY_GUIDE_CONFIG.groupLabels;
}

/**
 * Projects immediately valid continuations from the same resolved binding map
 * used by the dispatcher. The projection deliberately creates no executable
 * bindings and works for both Space-leader and ordinary direct prefixes.
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

  const candidates = new Map<string, { action: ActionId | null; hasChildren: boolean }>();
  for (const [bindingKey, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== mode || !bindingMatchesInputPrefix(binding.sequence, prefix))
      continue;

    const tokens = bindingSequenceTokens(binding.sequence);
    const nextKey = nextBindingToken(binding.sequence, prefix);
    if (!tokens || !nextKey) continue;

    const current = candidates.get(nextKey) ?? { action: null, hasChildren: false };
    if (tokens.length === prefixLength + 1) current.action = action;
    else current.hasChildren = true;
    candidates.set(nextKey, current);
  }

  return [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]) => {
      const group = candidate.hasChildren;
      const groupLabel = KEY_GUIDE_CONFIG.groupLabels[groupLabelKey(prefix, key)];
      const actionLabel = candidate.action
        ? (KEY_GUIDE_CONFIG.actionLabels[candidate.action] ?? ACTION_LABELS[candidate.action])
        : null;
      return {
        key,
        label: group
          ? (groupLabel ?? KEY_GUIDE_CONFIG.genericGroupLabel)[language]
          : actionLabel
            ? actionLabel[language]
            : KEY_GUIDE_CONFIG.genericGroupLabel[language],
        isGroup: group,
      };
    });
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
