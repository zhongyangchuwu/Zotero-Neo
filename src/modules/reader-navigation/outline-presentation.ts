const FIGURE_TITLE =
  /^\s*(?:fig(?:ure)?\.?\s*|图\s*)(?:\d+(?:[.-]\d+)*|[零〇一二三四五六七八九十百千万两]+(?:[.．-][零〇一二三四五六七八九十百千万两]+)*)(?=$|[\s:：.．、,，)\]】\-–—\u3400-\u9fff])/i;
const TABLE_TITLE =
  /^\s*(?:table\s*|表\s*)(?:\d+(?:[.-]\d+)*|[零〇一二三四五六七八九十百千万两]+(?:[.．-][零〇一二三四五六七八九十百千万两]+)*)(?=$|[\s:：.．、,，)\]】\-–—\u3400-\u9fff])/i;
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)*)(?:[.)、])?\s+\S/;

const MEANINGFUL_TITLE = /\p{L}/u;

export function outlineEntryKind(
  title: string,
  depth: number,
): 'figure' | 'table' | 'section' | 'subsection' | null {
  if (FIGURE_TITLE.test(title)) {
    return 'figure';
  }
  if (TABLE_TITLE.test(title)) return 'table';

  if (!MEANINGFUL_TITLE.test(title)) return null;
  const numberedHeading = NUMBERED_HEADING.exec(title);
  if (numberedHeading) return numberedHeading[1].includes('.') ? 'subsection' : 'section';
  return depth > 0 ? 'subsection' : 'section';
}
