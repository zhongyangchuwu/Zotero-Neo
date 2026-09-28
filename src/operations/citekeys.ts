import type { ItemTargetSet } from '../core/item-target';
import { citationKey } from '../platform/better-bibtex';
import { copyToClipboard } from '../platform/clipboard';

/** Copy all resolved citation keys atomically; return the action feedback for the owning Surface. */
export function copyCitekeys(targets: ItemTargetSet): string {
  try {
    if (targets.missing > 0)
      return targets.source === 'main'
        ? '✗ Selection contains unavailable items; refresh before citekey copy'
        : '✗ Context item is unavailable; refresh before citekey copy';
    if (!targets.total || !targets.items.length) return '✗ No item target';

    const keys: string[] = [];
    let missing = 0;
    for (const item of targets.items) {
      const key = citationKey(item);
      if (key) keys.push(key);
      else missing += 1;
    }
    if (missing)
      return `✗ ${missing} target${missing === 1 ? '' : 's'} without citekey (BBT not ready?)`;

    copyToClipboard(keys.join(' '));
    return keys.length === 1 ? `✓ @${keys[0]}` : `✓ Copied ${keys.length} citekeys`;
  } catch (error) {
    return `✗ ${String(error).slice(0, 40)}`;
  }
}
