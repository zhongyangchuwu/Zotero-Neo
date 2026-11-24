import { t } from '.';
import type { AppLanguage } from './types';

export interface BatchOutcome {
  done: number;
  unchanged?: number;
  unavailable?: number;
  missingData?: number;
  failed?: number;
}

type BatchAction =
  | 'citekeys'
  | 'tagAdd'
  | 'tagRemove'
  | 'collectionAdd'
  | 'collectionRemove'
  | 'collectionMove'
  | 'restore'
  | 'readerAnnotationCopy'
  | 'readerAnnotationRecolor';

/** Summarizes actual changes and distinguishes an idempotent skip from a failed write. */
export function batchStatus(
  action: BatchAction,
  result: BatchOutcome,
  language: AppLanguage,
): string {
  const { done, unchanged = 0, unavailable = 0, missingData = 0, failed = 0 } = result;
  const count = (key: string, value: number) => t(key, language).replace('{count}', String(value));
  const skipped = unchanged + unavailable + missingData + failed;
  const tagAction = action === 'tagAdd' || action === 'tagRemove';
  const blocking = failed || missingData || (unavailable && !tagAction);
  const prefix = done && !skipped ? '✓ ' : !done && blocking ? '✗ ' : '→ ';
  const lead = done ? count(`batch.${action}.done`, done) : t(`batch.${action}.empty`, language);
  if (!skipped) return prefix + lead;

  const reasons: string[] = [];
  if (missingData) reasons.push(count(`batch.${action}.missingData`, missingData));
  if (unavailable) {
    const read = action === 'citekeys' || action === 'readerAnnotationCopy';
    reasons.push(count(read ? 'batch.readUnavailable' : 'batch.unavailable', unavailable));
  }
  if (unchanged) reasons.push(count('batch.unchanged', unchanged));
  if (failed) reasons.push(count('batch.failed', failed));
  return (prefix + t('batch.summary', language))
    .replace('{done}', lead)
    .replace('{count}', String(skipped))
    .replace('{reasons}', reasons.join(t('batch.reasonSeparator', language)));
}
