import { ACTION_LABELS, type ActionId } from './actions';
import { type KeyGuideLanguage, KEY_GUIDE_CONFIG } from './key-guide-config';
import { parseBindingKey, type BindingMap, type Mode } from './bindings';

export type { KeyGuideLanguage } from './key-guide-config';

export interface KeyGuideEntry {
  readonly key: string;
  readonly label: string;
  readonly isGroup: boolean;
}

export function isLeaderPrefix(prefix: string): boolean {
  return prefix.startsWith(' ');
}

export function formatGuideKey(key: string): string {
  return key === ' ' ? 'SPC' : key;
}

export function formatGuidePrefix(prefix: string): string {
  if (!isLeaderPrefix(prefix)) return '';
  return ['SPC', ...[...prefix.slice(1)].map(formatGuideKey)].join(' › ');
}

/**
 * Projects immediately valid Space-leader continuations from the same resolved binding map
 * used by the dispatcher. The projection deliberately creates no executable bindings.
 */
export function leaderGuideEntries(
  bindings: BindingMap,
  mode: Mode,
  prefix: string,
  language: KeyGuideLanguage,
): readonly KeyGuideEntry[] {
  if (!isLeaderPrefix(prefix)) return [];

  const candidates = new Map<string, { action: ActionId | null; hasChildren: boolean }>();
  for (const [bindingKey, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== mode || !binding.sequence.startsWith(prefix)) continue;
    const suffix = binding.sequence.slice(prefix.length);
    const nextKey = suffix[0];
    if (!nextKey) continue;

    const candidatePrefix = `${prefix}${nextKey}`;
    const current = candidates.get(nextKey) ?? { action: null, hasChildren: false };
    if (binding.sequence === candidatePrefix) current.action = action;
    else current.hasChildren = true;
    candidates.set(nextKey, current);
  }

  return [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]) => {
      const group = candidate.hasChildren;
      const groupLabel =
        KEY_GUIDE_CONFIG.groupLabels[
          `${prefix}${key}`.slice(1) as keyof typeof KEY_GUIDE_CONFIG.groupLabels
        ];
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
