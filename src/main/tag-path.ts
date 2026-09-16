import { fuzzyMatchScore } from './picker/fuzzy';

export type TagPathSuggestionKind = 'namespace' | 'tag';

export interface TagPathSuggestion {
  readonly kind: TagPathSuggestionKind;
  readonly label: string;
  readonly insertText: string;
  readonly score: number;
  readonly count: number;
}

function sameSegment(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function flatSuggestions(tags: readonly string[], query: string): TagPathSuggestion[] {
  return tags
    .flatMap((tag) => {
      const score = fuzzyMatchScore(tag, query);
      return score === null
        ? []
        : [{ kind: 'tag' as const, label: tag, insertText: tag, score, count: 1 }];
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/**
 * Interpret existing Zotero tag strings as virtual paths for input completion.
 * Storage stays flat: the separator only affects Neo's projection and suggestions.
 */
export function suggestTagPaths(
  tags: readonly string[],
  input: string,
  separator: string,
): TagPathSuggestion[] {
  const uniqueTags = [...new Set(tags.filter(Boolean))];
  if (!separator) return flatSuggestions(uniqueTags, input);

  const inputSegments = input.split(separator);
  const query = inputSegments.pop() ?? '';
  const parent = inputSegments;
  const prefix = parent.length ? `${parent.join(separator)}${separator}` : '';
  const namespaces = new Map<string, TagPathSuggestion>();
  const tagSuggestions: TagPathSuggestion[] = [];

  for (const tag of uniqueTags) {
    const segments = tag.split(separator);
    if (segments.length < parent.length + 1) continue;
    if (!parent.every((segment, index) => sameSegment(segment, segments[index] ?? ''))) continue;

    const nextSegment = segments[parent.length] ?? '';
    const score = fuzzyMatchScore(nextSegment, query);
    if (score === null) continue;

    if (segments.length > parent.length + 1) {
      const insertText = `${prefix}${nextSegment}${separator}`;
      const existing = namespaces.get(insertText);
      if (existing) {
        namespaces.set(insertText, { ...existing, count: existing.count + 1 });
      } else {
        namespaces.set(insertText, {
          kind: 'namespace',
          label: insertText,
          insertText,
          score,
          count: 1,
        });
      }
      continue;
    }

    tagSuggestions.push({
      kind: 'tag',
      label: tag,
      insertText: tag,
      score,
      count: 1,
    });
  }

  return [...namespaces.values(), ...tagSuggestions].sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.kind === 'tag') - Number(b.kind === 'tag') ||
      a.label.localeCompare(b.label),
  );
}
