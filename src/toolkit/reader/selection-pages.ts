export interface ReaderSelectionPage {
  readonly pageIndex: number;
  readonly rects: readonly (readonly number[])[];
  readonly text: string;
  readonly sortIndex: string;
  readonly pageLabel: string;
}

export interface ReaderSelectionPart {
  readonly position: {
    readonly pageIndex: number;
    readonly rects: ReaderSelectionPage['rects'];
    readonly nextPageRects?: ReaderSelectionPage['rects'];
  };
  readonly text: string;
  readonly sortIndex: string;
  readonly pageLabel: string;
}

/** Zotero stores rects for one page and, optionally, its immediate successor. */
export function groupReaderSelectionPages(
  pages: readonly ReaderSelectionPage[],
): readonly ReaderSelectionPart[] {
  const ordered = pages
    .filter(({ rects }) => rects.length > 0)
    .sort((left, right) => left.pageIndex - right.pageIndex);
  const parts: ReaderSelectionPart[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const first = ordered[i]!;
    const next = ordered[i + 1];
    const second = next?.pageIndex === first.pageIndex + 1 ? next : undefined;
    parts.push({
      position: {
        pageIndex: first.pageIndex,
        rects: first.rects,
        ...(second ? { nextPageRects: second.rects } : {}),
      },
      text: second ? [first.text, second.text].filter(Boolean).join(' ') : first.text,
      sortIndex: first.sortIndex,
      pageLabel: first.pageLabel,
    });
    if (second) i += 1;
  }
  return parts;
}
