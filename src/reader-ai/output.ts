import type { ReaderAIEvidence, ReaderAIOutput } from './contracts';
import { ReaderAIError } from './errors';

const roles = ['goal', 'method', 'result', 'limitation', 'other'];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Reject unsupported references rather than inventing a navigable source. */
export function parseReaderAIOutput(
  value: unknown,
  evidence: readonly ReaderAIEvidence[],
): ReaderAIOutput {
  const ids = new Set(evidence.map((entry) => entry.id));
  if (
    !object(value) ||
    !Array.isArray(value.paragraphs) ||
    !Array.isArray(value.guide) ||
    value.paragraphs.length === 0 ||
    value.paragraphs.length > 100 ||
    value.guide.length > 100
  )
    throw new ReaderAIError('invalid-output');
  const paragraphs = value.paragraphs.map((entry) => {
    if (
      !object(entry) ||
      !text(entry.text, 20000) ||
      !Array.isArray(entry.evidenceIDs) ||
      entry.evidenceIDs.length > 100 ||
      !entry.evidenceIDs.every((id: unknown) => typeof id === 'string' && ids.has(id))
    )
      throw new ReaderAIError('invalid-output');
    return { text: entry.text, evidenceIDs: [...entry.evidenceIDs] as string[] };
  });
  const guide = value.guide.map((entry) => {
    if (
      !object(entry) ||
      typeof entry.evidenceID !== 'string' ||
      !ids.has(entry.evidenceID) ||
      typeof entry.role !== 'string' ||
      !roles.includes(entry.role) ||
      !text(entry.reason, 4000)
    )
      throw new ReaderAIError('invalid-output');
    return {
      evidenceID: entry.evidenceID,
      role: entry.role as ReaderAIOutput['guide'][number]['role'],
      reason: entry.reason,
    };
  });
  return { paragraphs, guide };
}
