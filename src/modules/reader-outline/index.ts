import { observeReaderOutline, type ReaderRuntime } from '../../toolkit/reader';

/** Follows the final authored destination behind the reading position without navigating. */
export function mountReaderOutline(
  reader: ReaderRuntime,
  reportError: (error: unknown) => void,
): () => void {
  return observeReaderOutline(
    reader,
    (entries, compare) => {
      let current: number | null = null;
      for (const [index, entry] of entries.entries()) {
        const reached = compare(index, null);
        if (reached === null || reached > 0) continue;
        if (current === null) {
          current = index;
          continue;
        }
        const order = compare(index, current);
        if (
          order !== null &&
          (order > 0 || (order === 0 && entry.depth >= entries[current]!.depth))
        )
          current = index;
      }
      return current;
    },
    reportError,
  );
}
