import type { ItemTargetSet } from '../core/item-target';
import type { Logger } from '../core/logging';
import type { BatchOutcome } from '../i18n/batch-result';
import { citationKey } from '../platform/better-bibtex';
import { copyToClipboard } from '../platform/clipboard';

/** Copies available citekeys in target order, leaving the clipboard untouched if none are found. */
export function copyCitekeys(targets: ItemTargetSet, logger: Logger): BatchOutcome {
  const outcome = { done: 0, unavailable: targets.missing, missingData: 0, failed: 0 };
  const keys: string[] = [];
  for (const item of targets.items) {
    try {
      const key = citationKey(item);
      if (key) keys.push(key);
      else outcome.missingData++;
    } catch (error) {
      logger.debug(`citekey lookup failed for item ${item.id}: ${String(error)}`);
      outcome.failed++;
    }
  }
  if (!keys.length) return outcome;
  try {
    copyToClipboard(keys.join(' '));
    outcome.done = keys.length;
  } catch (error) {
    logger.debug(`citekey clipboard write failed: ${String(error)}`);
    outcome.failed += keys.length;
  }
  return outcome;
}
