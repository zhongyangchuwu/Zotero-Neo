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
  if (!prefix) return '';
  return [...prefix].map(formatGuideKey).join(' › ');
}

function groupKey(prefix: string): keyof typeof KEY_GUIDE_CONFIG.groupLabels | undefined {
  const normalized = prefix.startsWith(' ') ? prefix.slice(1) : prefix;
  return normalized in KEY_GUIDE_CONFIG.groupLabels
    ? (normalized as keyof typeof KEY_GUIDE_CONFIG.groupLabels)
    : undefined;
}

/**
 * Projects immediately valid continuations from the same resolved binding map used by the
 * dispatcher. The projection deliberately creates no executable bindings.
 */
export function prefixGuideEntries(
  bindings: BindingMap,
  mode: Mode,
  prefix: string,
  language: KeyGuideLanguage,
): readonly KeyGuideEntry[] {
  if (!prefix) return [];

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
      const keyForGroup = groupKey(`${prefix}${key}`);
      const groupLabel = keyForGroup ? KEY_GUIDE_CONFIG.groupLabels[keyForGroup] : undefined;
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

/** Compatibility wrapper for surfaces that intentionally expose only Space-leader guides. */
export function leaderGuideEntries(
  bindings: BindingMap,
  mode: Mode,
  prefix: string,
  language: KeyGuideLanguage,
): readonly KeyGuideEntry[] {
  return isLeaderPrefix(prefix) ? prefixGuideEntries(bindings, mode, prefix, language) : [];
}
